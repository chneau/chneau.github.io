/**
 * What a staged list holds.
 *
 * A staged list is everything one download will apply. The panels are
 * stateless — each hands up its own view of what its section has queued — so
 * these are the rules that turn those views into the list. They live outside
 * the editor shell because each one is a decision worth testing on its own: a
 * section replaces its own entries rather than appending, one progression
 * change is in effect per download, and a companion is staged only when the
 * roster can take it.
 *
 * Every rule here is pure: the shell keeps the busy guard and the state.
 */

import {
	type CompanionCatalog,
	type CompanionEdit,
	type CompanionSummary,
	canQueueWorkers,
	companionStatus,
} from "@/lib/companions";
import type { EquipmentEdit, InsertEquipmentEdit } from "@/lib/equipment";
import type { SkillEdit } from "@/lib/skills";
import type { SaveEdit } from "@/lib/staged-edits";

/**
 * Replaces every edit a section owns with that section's own view of what is
 * queued. The view is the authority for its own section, so switching sections
 * cannot leave a stale change behind.
 */
export const replaceSection = (
	current: SaveEdit[],
	matches: (edit: SaveEdit) => boolean,
	next: SaveEdit[],
): SaveEdit[] => [...current.filter((edit) => !matches(edit)), ...next];

/**
 * Stages an equipment edit, replacing whatever that record had staged.
 *
 * An edit names its target, so re-staging one record revises it instead of
 * stacking a second change on it. An insertion has no Slot yet, so it is
 * matched on its Storage and Item Key alone.
 */
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

/** Stages the one progression change a download carries. */
export const stageProgression = (
	current: SaveEdit[],
	edit: SkillEdit,
): SaveEdit[] =>
	replaceSection(current, (entry) => entry.type === "skills", [edit]);

/** The companion edits a list already holds. */
export const queuedCompanions = (edits: SaveEdit[]): CompanionEdit[] =>
	edits.filter(
		(edit): edit is CompanionEdit =>
			edit.type === "addCompanion" || edit.type === "addRoboWorkers",
	);

/** What staging a companion needs to know about the save and the catalog. */
type CompanionRoster = {
	summary: CompanionSummary | undefined;
	catalog: CompanionCatalog | null;
};

/**
 * Stages a companion, or leaves the list alone when the roster cannot take it:
 * the worker cap would be exceeded, or the character is already owned or
 * already queued.
 */
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
