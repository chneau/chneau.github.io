import { CATEGORIES, type Category, type TrainService } from "./data/types";
import {
	type ActiveTrainState,
	getPolylineDistances,
} from "./engine/interpolator";

/**
 * The two computations behind the stats panel: the hourly "services in progress"
 * histogram and the rolling highlights over the trains currently running.
 *
 * They live here, as plain functions of their inputs, rather than inside the
 * component because that is what they are. Both are the expensive part of the
 * left-hand HUD — one polyline measurement per active train, every repaint —
 * and neither of them reads a single piece of component state, so putting them
 * behind a `useMemo` in the panel made the panel look harder to read than the
 * panel actually was.
 */

/** 05:00, the first minute of the replay window: the histogram starts here. */
const FIRST_BUCKET_OFFSET = 300;
/** 05:00 through to 24:00, one column per hour. */
const BUCKET_COUNT = 19;

/** One column of the activity curve: the hour it covers and its 0..1 intensity. */
type ActivityColumn = {
	hour: number;
	intensity: number;
};

type Highlight = {
	state: ActiveTrainState;
	value: number;
};

export type ActiveHighlights = {
	fastest: Highlight | null;
	longest: Highlight | null;
	mostStops: Highlight | null;
	totalActiveDistanceKm: number;
	movingTrains: number;
	dwellingTrains: number;
};

/**
 * Counts, per hour, how many services from `services` are in progress then.
 *
 * A service counts towards every hour its first departure through its last
 * arrival spans, so a 06:40–09:10 working is visible across three columns
 * rather than only the hour it started in. Intensity is normalised against the
 * busiest column so the curve reads as a shape, not as a count.
 */
export const hourlyActivity = (
	services: readonly TrainService[],
): ActivityColumn[] => {
	const buckets = Array.from({ length: BUCKET_COUNT }, () => 0);
	for (const service of services) {
		const first = service.calls[0];
		const last = service.calls[service.calls.length - 1];
		const startOffset = first?.departureOffset ?? first?.arrivalOffset ?? null;
		const endOffset = last?.arrivalOffset ?? last?.departureOffset ?? null;
		if (startOffset === null || endOffset === null) continue;
		const startIdx = Math.max(
			0,
			Math.floor((startOffset - FIRST_BUCKET_OFFSET) / 60),
		);
		const endIdx = Math.min(
			BUCKET_COUNT - 1,
			Math.floor((endOffset - FIRST_BUCKET_OFFSET) / 60),
		);
		for (let i = startIdx; i <= endIdx; i++) {
			buckets[i] = (buckets[i] ?? 0) + 1;
		}
	}
	const max = Math.max(1, ...buckets);
	return buckets.map((value, index) => ({
		hour: index + 5,
		intensity: value / max,
	}));
};

/**
 * The three rolling highlights, plus the two totals the panel prints above the
 * curve. `null` when nothing is running: the panel then shows its empty state,
 * which is a different thing from "running, but nothing beat zero".
 */
export const summariseActiveTrains = (
	activeTrains: readonly ActiveTrainState[],
): ActiveHighlights | null => {
	if (activeTrains.length === 0) return null;

	let fastest: Highlight | null = null;
	let longest: Highlight | null = null;
	let mostStops: Highlight | null = null;
	let totalActiveDistanceKm = 0;

	for (const train of activeTrains) {
		const service = train.service;
		const totalDist = getPolylineDistances(service.pathCoordinates).total;
		totalActiveDistanceKm += totalDist;

		// Duration in hours. The floor keeps a train whose timetable rounds to
		// zero minutes from producing an infinite average speed.
		const firstDep = service.calls[0]?.departureOffset ?? 0;
		const lastArr =
			service.calls[service.calls.length - 1]?.arrivalOffset ?? firstDep + 1;
		const durationHours = Math.max(0.1, (lastArr - firstDep) / 60);
		const avgSpeedKmh = totalDist / durationHours;

		if (!fastest || avgSpeedKmh > fastest.value) {
			fastest = { state: train, value: avgSpeedKmh };
		}

		if (!longest || totalDist > longest.value) {
			longest = { state: train, value: totalDist };
		}

		const stops = service.calls.length;
		if (!mostStops || stops > mostStops.value) {
			mostStops = { state: train, value: stops };
		}
	}

	return {
		fastest,
		longest,
		mostStops,
		totalActiveDistanceKm: Math.round(totalActiveDistanceKm),
		movingTrains: activeTrains.filter((train) => !train.isDwelling).length,
		dwellingTrains: activeTrains.filter((train) => train.isDwelling).length,
	};
};

/**
 * Names the filters standing between the visitor and the trains, for the empty
 * state: "no service matches the "sleeper" search *or* the Highland filter".
 * `null` when nothing is filtered, because then the empty state is about the
 * clock rather than about a filter.
 */
export const describeActiveFilter = (
	searchQuery: string,
	selectedCategory: Category | "all",
): string | null => {
	const search = searchQuery.trim();
	if (search && selectedCategory !== "all") {
		return `the "${search}" search or the ${
			CATEGORIES[selectedCategory].label
		} filter`;
	}
	if (search) return `the "${search}" search`;
	if (selectedCategory !== "all") {
		return `the ${CATEGORIES[selectedCategory].label} filter`;
	}
	return null;
};
