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

// Interpolate along a polyline
const interpolatePolyline = (
	coords: Coordinate[],
	fraction: number,
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
			const segFrac =
				segmentDist === 0 ? 0 : (targetDist - previousDist) / segmentDist;
			const p1 = coords[i - 1] as Coordinate;
			const p2 = coords[i] as Coordinate;
			const pos: Coordinate = [
				p1[0] + (p2[0] - p1[0]) * segFrac,
				p1[1] + (p2[1] - p1[1]) * segFrac,
			];
			const heading = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
			return { pos, prev: p1, heading };
		}
	}

	return {
		pos: coords[coords.length - 1] as Coordinate,
		prev: null,
		heading: 0,
	};
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

	// Find active leg between calls
	for (let i = 0; i < calls.length - 1; i++) {
		const fromCall = calls[i];
		const toCall = calls[i + 1];
		if (!fromCall || !toCall) continue;

		const depTime = fromCall.departureOffset ?? fromCall.arrivalOffset ?? 0;
		const arrTime = toCall.arrivalOffset ?? toCall.departureOffset ?? 0;

		// Check if dwelling at fromCall station
		if (fromCall.arrivalOffset !== null && fromCall.departureOffset !== null) {
			if (
				timeOffset >= fromCall.arrivalOffset &&
				timeOffset < fromCall.departureOffset
			) {
				// Dwelling at station
				const { pos } = interpolatePolyline(
					service.pathCoordinates,
					i / (calls.length - 1),
				);
				return {
					service,
					position: pos,
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
			const legFrac = (timeOffset - depTime) / Math.max(1, arrTime - depTime);
			const totalLegs = calls.length - 1;
			const polyFrac = (i + legFrac) / totalLegs;
			const { pos, prev, heading } = interpolatePolyline(
				service.pathCoordinates,
				polyFrac,
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

	return null;
};
