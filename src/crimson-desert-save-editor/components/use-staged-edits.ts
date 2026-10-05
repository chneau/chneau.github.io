import { type Dispatch, type SetStateAction, useCallback } from "react";
import type { InventoryFocus } from "@/components/inventory-view";
import type { CompanionCatalog, CompanionEdit } from "@/lib/companions";
import type { EquipmentEdit, InsertEquipmentEdit } from "@/lib/equipment";
import type { ParseResult } from "@/lib/inventory";
import type { SkillEdit } from "@/lib/skills";
import * as stagedList from "@/lib/staged-edit-list";
import type {
	CompanionRenameEdit,
	DyeEdit,
	ItemConditionEdit,
	LevelEdit,
	QuestStateEdit,
	SaveEdit,
} from "@/lib/staged-edits";

/** Which row a freshly staged change belongs to, so the inventory can reveal it. */
export type StagedTarget = {
	inventoryKey: number;
	itemKey: number;
	slotNo: number | null;
};

/**
 * Every way a panel can write to the staged list, and the rules behind them.
 *
 * The page owns the list; this owns the *policy* for writing to it, and there
 * are three rules the page had to remember in the right order:
 *
 *  - a change made while a save is being rebuilt is refused, because the run is
 *    reading the list it would then be written against;
 *  - a change clears the page's error, so a red banner from a previous attempt
 *    does not sit under the change meant to fix it;
 *  - a panel's change replaces that panel's section of the list rather than
 *    appending to it, which is what stops a second keystroke on the same row
 *    leaving the earlier value queued behind it.
 */
export const useStagedEdits = ({
	setEdits,
	setError,
	busy,
	result,
	companionCatalog,
	setActiveStorage,
	setFocus,
}: {
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
	setError: Dispatch<SetStateAction<string>>;
	/** True while the save is being rebuilt; every staging call then refuses. */
	busy: boolean;
	result: ParseResult | null;
	companionCatalog: CompanionCatalog;
	setActiveStorage: Dispatch<SetStateAction<number | null>>;
	setFocus: Dispatch<SetStateAction<InventoryFocus | null>>;
}) => {
	/** Point the inventory at the row a staged change just touched. */
	const revealStaged = useCallback(
		(target: StagedTarget) => {
			setActiveStorage(target.inventoryKey);
			setFocus({ itemKey: target.itemKey, slotNo: target.slotNo });
		},
		[setActiveStorage, setFocus],
	);

	const stageEquipment = useCallback(
		(edit: EquipmentEdit | InsertEquipmentEdit) => {
			setError("");
			setEdits((current) => stagedList.stageEquipment(current, edit));
			revealStaged({
				inventoryKey: edit.inventoryKey,
				itemKey: edit.itemKey,
				slotNo: edit.type === "equipment" ? edit.slotNo : null,
			});
		},
		// `setEdits` and `setError` are declared rather than assumed away. Both
		// are `useState` setters, whose identity React guarantees is fixed for
		// the life of the component, so listing them cannot re-create this
		// callback — while omitting them left the callbacks below reading them
		// without saying so.
		[revealStaged, setEdits, setError],
	);

	const stageCompanion = (edit: CompanionEdit) => {
		if (busy || !result?.companions) return;
		setError("");
		setEdits((current) =>
			stagedList.stageCompanion(current, edit, {
				summary: result.companions,
				catalog: companionCatalog,
			}),
		);
	};

	/**
	 * Replaces a section's staged edits with that section's own view of what it
	 * has queued. The rule is `stagedList.replaceSection`; what stays here is the
	 * guard that ignores a panel's change while a save is being rebuilt.
	 */
	const replaceEdits = useCallback(
		(matches: (edit: SaveEdit) => boolean, next: SaveEdit[]) => {
			if (busy) return;
			setError("");
			setEdits((current) => stagedList.replaceSection(current, matches, next));
		},
		// The two setters are `useState` dispatches, so they never change
		// identity and this callback is still created only when `busy` flips.
		[busy, setEdits, setError],
	);

	const stageDyes = useCallback(
		(next: DyeEdit[]) => replaceEdits((edit) => edit.type === "dye", next),
		[replaceEdits],
	);
	const stageConditions = useCallback(
		(next: ItemConditionEdit[]) =>
			replaceEdits((edit) => edit.type === "condition", next),
		[replaceEdits],
	);
	const stageLevels = useCallback(
		(next: LevelEdit[]) =>
			replaceEdits(
				(edit) => edit.type === "character" || edit.type === "characterPreset",
				next,
			),
		[replaceEdits],
	);
	const stageQuests = useCallback(
		(next: QuestStateEdit[]) =>
			replaceEdits(
				(edit) => edit.type === "quest" || edit.type === "questPreset",
				next,
			),
		[replaceEdits],
	);
	const stageNames = useCallback(
		(next: CompanionRenameEdit[]) =>
			replaceEdits((edit) => edit.type === "renameCompanion", next),
		[replaceEdits],
	);

	const stageSkill = (edit: SkillEdit) => {
		if (busy || !result?.skills || result.skills.error) return;
		setError("");
		setEdits((current) => stagedList.stageProgression(current, edit));
	};

	const removeStagedEdit = (index: number) => {
		setEdits((current) => current.filter((_, i) => i !== index));
	};

	return {
		revealStaged,
		stageEquipment,
		stageCompanion,
		stageDyes,
		stageConditions,
		stageLevels,
		stageQuests,
		stageNames,
		stageSkill,
		removeStagedEdit,
	};
};
