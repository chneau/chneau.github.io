import type { Coordinate, TrainService } from "../data/types";

export type ActiveTrainState = {
	service: TrainService;
	position: Coordinate;
	previousPosition: Coordinate | null;
	progress: number; // 0..1 overall
	currentSegmentIndex: number;
	currentStopName: string;
	nextStopName: string | null;
	isDwelling: boolean;
	headingAngle: number;
};

// Distance in km between two coords
const distanceKm = (c1: Coordinate, c2: Coordinate): number => {
	const R = 6371;
	const dLat = ((c2[1] - c1[1]) * Math.PI) / 180;
	const dLon = ((c2[0] - c1[0]) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos((c1[1] * Math.PI) / 180) *
			Math.cos((c2[1] * Math.PI) / 180) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
};

// Cumulative distance lookup cache for polyline coordinates to prevent reallocations on every frame
const polylineDistanceCache = new WeakMap<
	Coordinate[],
	{ cumulative: number[]; total: number }
>();

const getPolylineDistances = (
	coords: Coordinate[],
): { cumulative: number[]; total: number } => {
	const cached = polylineDistanceCache.get(coords);
	if (cached) return cached;

	const cumulative: number[] = [0];
	for (let i = 1; i < coords.length; i++) {
		const c1 = coords[i - 1] as Coordinate;
		const c2 = coords[i] as Coordinate;
		const prev = cumulative[i - 1] ?? 0;
		cumulative.push(prev + distanceKm(c1, c2));
	}
	const total = cumulative[cumulative.length - 1] ?? 0;
	const result = { cumulative, total };
	polylineDistanceCache.set(coords, result);
	return result;
};

// Physics S-curve easing for realistic station departure acceleration & arrival braking
// Smoothstep cubic polynomial: 3t^2 - 2t^3 with linear cruise section in between
const smoothLegProgress = (t: number): number => {
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	// Smooth cubic ease-in-out
	return t * t * (3 - 2 * t);
};

// Catmull-Rom cubic spline interpolation between 4 control points
const catmullRom = (
	p0: number,
	p1: number,
	p2: number,
	p3: number,
	t: number,
): number => {
	const t2 = t * t;
	const t3 = t2 * t;
	return (
		0.5 *
		(2 * p1 +
			(-p0 + p2) * t +
			(2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
			(-p0 + 3 * p1 - 3 * p2 + p3) * t3)
	);
};

// Interpolate smoothly along a polyline using Catmull-Rom splines
const interpolatePolyline = (
	coords: Coordinate[],
	fraction: number,
	trackOffsetMeters = 0,
): { pos: Coordinate; prev: Coordinate | null; heading: number } => {
	if (coords.length === 0) return { pos: [0, 0], prev: null, heading: 0 };
	if (coords.length === 1 || fraction <= 0) {
		const pos = coords[0] as Coordinate;
		return { pos, prev: null, heading: 0 };
	}
	if (fraction >= 1) {
		const pos = coords[coords.length - 1] as Coordinate;
		const prev = coords[coords.length - 2] || null;
		const heading = prev ? Math.atan2(pos[1] - prev[1], pos[0] - prev[0]) : 0;
		return { pos, prev, heading };
	}

	const { cumulative: dists, total: totalDist } = getPolylineDistances(coords);
	if (totalDist === 0) {
		return { pos: coords[0] as Coordinate, prev: null, heading: 0 };
	}

	const targetDist = fraction * totalDist;
	for (let i = 1; i < dists.length; i++) {
		const currentDist = dists[i] ?? 0;
		const previousDist = dists[i - 1] ?? 0;
		if (currentDist >= targetDist) {
			const segmentDist = currentDist - previousDist;
			const t =
				segmentDist === 0 ? 0 : (targetDist - previousDist) / segmentDist;

			// Control points for Catmull-Rom spline
			const p0 = (coords[Math.max(0, i - 2)] ?? coords[0]) as Coordinate;
			const p1 = (coords[i - 1] ?? coords[0]) as Coordinate;
			const p2 = (coords[i] ?? coords[coords.length - 1]) as Coordinate;
			const p3 = (coords[Math.min(coords.length - 1, i + 1)] ??
				coords[coords.length - 1]) as Coordinate;

			let lon = catmullRom(p0[0], p1[0], p2[0], p3[0], t);
			let lat = catmullRom(p0[1], p1[1], p2[1], p3[1], t);

			// Calculate tangent heading vector for orientation in projected screen coordinates:
			// screen x = dLon * cos(lat), screen y = -dLat (since screen Y goes downwards)
			const tEpsilon = 0.02;
			const tNext = Math.min(1, t + tEpsilon);
			const lonNext = catmullRom(p0[0], p1[0], p2[0], p3[0], tNext);
			const latNext = catmullRom(p0[1], p1[1], p2[1], p3[1], tNext);

			const dLon = lonNext - lon;
			const dLat = latNext - lat;
			const radLat = (lat * Math.PI) / 180;
			const dxScreen = dLon * Math.cos(radLat);
			const dyScreen = -dLat;
			const heading = Math.atan2(dyScreen, dxScreen);

			// Apply dual-track perpendicular offset (creates left/right passing lanes)
			if (trackOffsetMeters !== 0) {
				const geoAngle = Math.atan2(dLat, dLon * Math.cos(radLat));
				const normalAngle = geoAngle + Math.PI / 2;
				// Approx degree offset: 1 degree latitude ~ 111,000 meters
				const latOffset = (Math.sin(normalAngle) * trackOffsetMeters) / 111000;
				const lonOffset =
					(Math.cos(normalAngle) * trackOffsetMeters) /
					(111000 * Math.cos(radLat));
				lon += lonOffset;
				lat += latOffset;
			}

			const pos: Coordinate = [lon, lat];
			return { pos, prev: p1, heading };
		}
	}

	return {
		pos: coords[coords.length - 1] as Coordinate,
		prev: null,
		heading: 0,
	};
};

// Find the nearest point along a polyline to a given coordinate and calculate its fractional distance along the path
const findClosestPolylineFraction = (
	coords: Coordinate[],
	target: Coordinate,
): number => {
	const { cumulative, total } = getPolylineDistances(coords);
	if (total === 0 || coords.length < 2) return 0;

	let bestDist = Infinity;
	let bestPathDistance = 0;

	for (let i = 0; i < coords.length - 1; i++) {
		const p1 = coords[i] as Coordinate;
		const p2 = coords[i + 1] as Coordinate;
		const segLen = distanceKm(p1, p2);
		const segStartDist = cumulative[i] ?? 0;

		if (segLen === 0) {
			const d = distanceKm(target, p1);
			if (d < bestDist) {
				bestDist = d;
				bestPathDistance = segStartDist;
			}
			continue;
		}

		// Project target onto segment p1-p2 in Euclidean approx (good for small segments)
		const dx = p2[0] - p1[0];
		const dy = p2[1] - p1[1];
		const t = Math.max(
			0,
			Math.min(
				1,
				((target[0] - p1[0]) * dx + (target[1] - p1[1]) * dy) /
					(dx * dx + dy * dy),
			),
		);

		const projPt: Coordinate = [p1[0] + t * dx, p1[1] + t * dy];
		const d = distanceKm(target, projPt);

		if (d < bestDist) {
			bestDist = d;
			bestPathDistance = segStartDist + t * segLen;
		}
	}

	return Math.min(1, Math.max(0, bestPathDistance / total));
};

import { STATIONS_BY_ID } from "../data/geography";

// Cache for mapped call fractions along a service's route
const serviceCallFractionsCache = new WeakMap<TrainService, number[]>();

const getServiceCallFractions = (service: TrainService): number[] => {
	const cached = serviceCallFractionsCache.get(service);
	if (cached) return cached;

	const coords = service.pathCoordinates;
	const calls = service.calls;
	const fractions: number[] = [];

	for (let i = 0; i < calls.length; i++) {
		const call = calls[i];
		if (i === 0) {
			fractions.push(0);
			continue;
		}
		if (i === calls.length - 1) {
			fractions.push(1);
			continue;
		}
		const station = call ? STATIONS_BY_ID.get(call.stationId) : null;
		if (station) {
			const frac = findClosestPolylineFraction(coords, station.coordinate);
			fractions.push(frac);
		} else {
			fractions.push(i / (calls.length - 1));
		}
	}

	// Ensure monotonic strictly non-decreasing fractions
	for (let i = 1; i < fractions.length; i++) {
		const prev = fractions[i - 1] ?? 0;
		const curr = fractions[i] ?? 0;
		if (curr < prev) {
			fractions[i] = prev;
		}
	}

	serviceCallFractionsCache.set(service, fractions);
	return fractions;
};

export const resolveServiceAtTime = (
	service: TrainService,
	timeOffset: number, // minutes
	stationNamesById: Map<string, string>,
): ActiveTrainState | null => {
	const calls = service.calls;
	if (calls.length < 2) return null;

	const firstCall = calls[0];
	const lastCall = calls[calls.length - 1];
	if (!firstCall || !lastCall) return null;

	const startTime = firstCall.departureOffset ?? firstCall.arrivalOffset ?? 0;
	const finishTime = lastCall.arrivalOffset ?? lastCall.departureOffset ?? 0;

	if (timeOffset < startTime || timeOffset > finishTime) {
		return null;
	}

	const overallProgress =
		(timeOffset - startTime) / Math.max(1, finishTime - startTime);
	const callFractions = getServiceCallFractions(service);

	// Find active leg between calls
	for (let i = 0; i < calls.length - 1; i++) {
		const fromCall = calls[i];
		const toCall = calls[i + 1];
		if (!fromCall || !toCall) continue;

		const depTime = fromCall.departureOffset ?? fromCall.arrivalOffset ?? 0;
		const arrTime = toCall.arrivalOffset ?? toCall.departureOffset ?? 0;

		const fromFrac = callFractions[i] ?? i / (calls.length - 1);
		const toFrac = callFractions[i + 1] ?? (i + 1) / (calls.length - 1);

		// Check if dwelling at fromCall station
		if (fromCall.arrivalOffset !== null && fromCall.departureOffset !== null) {
			if (
				timeOffset >= fromCall.arrivalOffset &&
				timeOffset < fromCall.departureOffset
			) {
				const fromStation = STATIONS_BY_ID.get(fromCall.stationId);
				const dwellingPos: Coordinate = fromStation
					? fromStation.coordinate
					: interpolatePolyline(service.pathCoordinates, fromFrac).pos;

				return {
					service,
					position: dwellingPos,
					previousPosition: null,
					progress: overallProgress,
					currentSegmentIndex: i,
					currentStopName:
						stationNamesById.get(fromCall.stationId) || fromCall.stationId,
					nextStopName:
						stationNamesById.get(toCall.stationId) || toCall.stationId,
					isDwelling: true,
					headingAngle: 0,
				};
			}
		}

		// Check if moving between fromCall and toCall
		if (timeOffset >= depTime && timeOffset <= arrTime) {
			const rawLegFrac =
				(timeOffset - depTime) / Math.max(1, arrTime - depTime);
			const legFrac = smoothLegProgress(rawLegFrac);
			const polyFrac = fromFrac + legFrac * (toFrac - fromFrac);

			// Dual track passing offset: northbound/eastbound trains offset +12m, southbound/westbound offset -12m
			const trackOffset =
				service.id.endsWith("-2") ||
				service.id.endsWith("-4") ||
				service.id.endsWith("-6")
					? 14
					: -14;

			const { pos, prev, heading } = interpolatePolyline(
				service.pathCoordinates,
				polyFrac,
				trackOffset,
			);

			return {
				service,
				position: pos,
				previousPosition: prev,
				progress: overallProgress,
				currentSegmentIndex: i,
				currentStopName:
					stationNamesById.get(fromCall.stationId) || fromCall.stationId,
				nextStopName:
					stationNamesById.get(toCall.stationId) || toCall.stationId,
				isDwelling: false,
				headingAngle: heading,
			};
		}
	}

	// Terminus arrival check (if dwelling at destination before service ends)
	if (lastCall.arrivalOffset !== null && timeOffset >= lastCall.arrivalOffset) {
		const lastStation = STATIONS_BY_ID.get(lastCall.stationId);
		const destPos: Coordinate = lastStation
			? lastStation.coordinate
			: (service.pathCoordinates[
					service.pathCoordinates.length - 1
				] as Coordinate);

		return {
			service,
			position: destPos,
			previousPosition: null,
			progress: 1,
			currentSegmentIndex: calls.length - 1,
			currentStopName:
				stationNamesById.get(lastCall.stationId) || lastCall.stationId,
			nextStopName: null,
			isDwelling: true,
			headingAngle: 0,
		};
	}

	return null;
};
