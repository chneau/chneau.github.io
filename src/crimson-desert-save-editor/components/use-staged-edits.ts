import { type Dispatch, type SetStateAction, useCallback } from "react";
import type { CompanionCatalog, CompanionEdit } from "../lib/companions";
import type { EquipmentEdit, InsertEquipmentEdit } from "../lib/equipment";
import type { ParseResult } from "../lib/inventory";
import type { SkillEdit } from "../lib/skills";
import * as stagedList from "../lib/staged-edit-list";
import type {
	CompanionRenameEdit,
	DyeEdit,
	ItemConditionEdit,
	LevelEdit,
	QuestStateEdit,
	SaveEdit,
} from "../lib/staged-edits";
import type { InventoryFocus } from "./inventory-view";

export type StagedTarget = {
	inventoryKey: number;
	itemKey: number;
	slotNo: number | null;
};

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
	busy: boolean;
	result: ParseResult | null;
	companionCatalog: CompanionCatalog;
	setActiveStorage: Dispatch<SetStateAction<number | null>>;
	setFocus: Dispatch<SetStateAction<InventoryFocus | null>>;
}) => {
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

	const replaceEdits = useCallback(
		(matches: (edit: SaveEdit) => boolean, next: SaveEdit[]) => {
			if (busy) return;
			setError("");
			setEdits((current) => stagedList.replaceSection(current, matches, next));
		},
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
