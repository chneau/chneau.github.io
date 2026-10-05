import type { Snapshot } from "valtio";
import type { ActiveTrainState } from "./engine/interpolator";

/**
 * The map's non-visual equivalent.
 *
 * The map is a canvas, so a screen reader gets nothing from it. This is the one
 * sentence that stands in for it, and it is a plain function of the running
 * trains rather than JSX: the wording is the whole of the accessibility surface
 * here, and prose buried in an effect body is prose nobody re-reads when it
 * needs changing.
 */

/** How many services are named before the summary counts the rest. */
const NAMED_LIMIT = 6;

export const describeNetwork = (
	activeTrains: Snapshot<readonly ActiveTrainState[]>,
	selectedServiceId: string | null,
): string => {
	if (activeTrains.length === 0) {
		return "No trains are currently running.";
	}

	const selected = selectedServiceId
		? activeTrains.find((train) => train.service.id === selectedServiceId)
		: null;
	if (selected) {
		const where = selected.isDwelling
			? `is at ${selected.currentStopName}`
			: `is heading to ${selected.nextStopName ?? "its destination"}`;
		return `${selected.service.serviceNumber} ${selected.service.name} ${where}.`;
	}

	const names = activeTrains
		.slice(0, NAMED_LIMIT)
		.map((train) => `${train.service.serviceNumber} ${train.service.name}`);
	const more =
		activeTrains.length > names.length
			? `, plus ${activeTrains.length - names.length} more`
			: "";
	return `${activeTrains.length} trains running: ${names.join("; ")}${more}.`;
};
