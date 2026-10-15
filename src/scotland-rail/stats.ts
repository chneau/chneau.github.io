import { CATEGORIES, type Category, type TrainService } from "./data/types";
import {
	type ActiveTrainState,
	getPolylineDistances,
} from "./engine/interpolator";

const FIRST_BUCKET_OFFSET = 300;
const BUCKET_COUNT = 19;

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
