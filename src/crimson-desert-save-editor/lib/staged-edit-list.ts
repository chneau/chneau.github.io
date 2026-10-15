import {
	type CompanionCatalog,
	type CompanionEdit,
	type CompanionSummary,
	canQueueWorkers,
	companionStatus,
} from "./companions";
import type { EquipmentEdit, InsertEquipmentEdit } from "./equipment";
import type { SkillEdit } from "./skills";
import type { SaveEdit } from "./staged-edits";

export const replaceSection = (
	current: SaveEdit[],
	matches: (edit: SaveEdit) => boolean,
	next: SaveEdit[],
): SaveEdit[] => [...current.filter((edit) => !matches(edit)), ...next];

export const stageEquipment = (
	current: SaveEdit[],
	edit: EquipmentEdit | InsertEquipmentEdit,
): SaveEdit[] =>
	replaceSection(
		current,
		(entry) =>
			entry.type === edit.type &&
			entry.inventoryKey === edit.inventoryKey &&
			entry.itemKey === edit.itemKey &&
			(edit.type === "insertEquipment" ||
				(entry.type === "equipment" && entry.slotNo === edit.slotNo)),
		[edit],
	);

export const stageProgression = (
	current: SaveEdit[],
	edit: SkillEdit,
): SaveEdit[] =>
	replaceSection(current, (entry) => entry.type === "skills", [edit]);

export const queuedCompanions = (edits: SaveEdit[]): CompanionEdit[] =>
	edits.filter(
		(edit): edit is CompanionEdit =>
			edit.type === "addCompanion" || edit.type === "addRoboWorkers",
	);

type CompanionRoster = {
	summary: CompanionSummary | undefined;
	catalog: CompanionCatalog | null;
};

export const stageCompanion = (
	current: SaveEdit[],
	edit: CompanionEdit,
	{ summary, catalog }: CompanionRoster,
): SaveEdit[] => {
	const queued = queuedCompanions(current);
	if (
		edit.type === "addRoboWorkers" &&
		!canQueueWorkers(summary?.roboWorkers ?? 0, queued, edit.quantity)
	) {
		return current;
	}
	if (
		edit.type === "addCompanion" &&
		(!catalog ||
			companionStatus(catalog, summary, queued, edit.characterKey) !== "Add")
	) {
		return current;
	}
	return [...current, edit];
};
