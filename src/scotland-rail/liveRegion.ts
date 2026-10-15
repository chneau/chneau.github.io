import type { Snapshot } from "valtio";
import type { ActiveTrainState } from "./engine/interpolator";

export const describeNetwork = (
	activeTrains: Snapshot<readonly ActiveTrainState[]>,
	selectedServiceId: string | null,
): string => {
	if (activeTrains.length === 0) {
		return "No trains running.";
	}

	const selected = selectedServiceId
		? activeTrains.find((train) => train.service.id === selectedServiceId)
		: null;
	if (selected) {
		const where = selected.isDwelling
			? `is at ${selected.currentStopName}`
			: `is heading to ${selected.nextStopName ?? "its destination"}`;
		return `${selected.service.serviceNumber} ${where}.`;
	}

	return `${activeTrains.length} trains running.`;
};
