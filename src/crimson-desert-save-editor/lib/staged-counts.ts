import type { SaveView } from "@/lib/inventory";
import type { SaveEdit } from "@/lib/staged-edits";

/**
 * How many staged edits each storage location and each view holds, for the
 * sidebar's badges.
 *
 * It is a plain fold over the edit list — no React, no engine — so the tests
 * can hold it to the counts the sidebar shows without rendering anything.
 */
export const stagedCounts = (
	edits: SaveEdit[],
): {
	stagedStorageCounts: Record<number, number>;
	stagedViewCounts: Record<SaveView, number>;
} => {
	const storageCounts: Record<number, number> = {};
	const viewCounts: Record<SaveView, number> = {
		inventory: 0,
		skills: 0,
		levels: 0,
		quests: 0,
		dyes: 0,
		condition: 0,
		names: 0,
		pets: 0,
		mounts: 0,
		specialMounts: 0,
		camp: 0,
	};

	for (const edit of edits) {
		if (edit.type === "condition") {
			storageCounts[edit.inventoryKey] =
				(storageCounts[edit.inventoryKey] ?? 0) + 1;
			viewCounts.condition++;
		} else if ("inventoryKey" in edit) {
			storageCounts[edit.inventoryKey] =
				(storageCounts[edit.inventoryKey] ?? 0) + 1;
			viewCounts.inventory++;
		} else if (edit.type === "skills") {
			viewCounts.skills++;
		} else if (edit.type === "character" || edit.type === "characterPreset") {
			viewCounts.levels++;
		} else if (edit.type === "quest" || edit.type === "questPreset") {
			viewCounts.quests++;
		} else if (edit.type === "dye") {
			viewCounts.dyes++;
		} else if (edit.type === "renameCompanion") {
			viewCounts.names++;
		} else if (edit.type === "addCompanion" || edit.type === "addRoboWorkers") {
			viewCounts[edit.category] = (viewCounts[edit.category] ?? 0) + 1;
		}
	}

	return { stagedStorageCounts: storageCounts, stagedViewCounts: viewCounts };
};
