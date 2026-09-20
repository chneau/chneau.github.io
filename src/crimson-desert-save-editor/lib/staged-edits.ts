/**
 * Everything the page can stage for one download.
 *
 * Each member builds on the engine's own shape for that operation, and the
 * page adds only the labels it displays — so a staged edit can be handed
 * straight to `SaveSession.apply`, which type-checks it against the appliers
 * the engine actually has. If a view stages a shape the engine cannot apply,
 * the build fails here rather than at the download.
 */

import type { CompanionEdit } from "@/lib/companions";
import type { EquipmentEdit, InsertEquipmentEdit } from "@/lib/equipment";
import type {
	CharacterEdit,
	CharacterPresetEdit,
} from "@/lib/save-engine/characters";
import type { CompanionRenameEdit } from "@/lib/save-engine/companion-names";
import type { DyeEdit } from "@/lib/save-engine/dyes";
import type {
	InsertItemEdit as EngineInsertItemEdit,
	QuantityEdit as EngineQuantityEdit,
} from "@/lib/save-engine/edits";
import type { ItemConditionEdit } from "@/lib/save-engine/item-condition";
import type { QuestEdit, QuestPresetEdit } from "@/lib/save-engine/quests";
import type { SkillEdit } from "@/lib/skills";

/** A level, experience or reward-flag change on one row of the level tables. */
export type LevelEdit = CharacterEdit | CharacterPresetEdit;

/** A quest, mission, stage or gauge state change. */
export type QuestStateEdit = QuestEdit | QuestPresetEdit;

export type { CompanionRenameEdit, DyeEdit, ItemConditionEdit };

/** A quantity change, plus the item name the staged list shows. */
export type QuantityEdit = EngineQuantityEdit & {
	itemName: string;
};

/** A new stack cloned from a donor record, plus the names the list shows. */
export type InsertItemEdit = EngineInsertItemEdit & {
	templateName: string;
	itemName: string;
};

/** An item that adds as one, added on its own without a donor record. */
export type InsertCatalogItemEdit = {
	type: "insertCatalogItem";
	inventoryKey: number;
	itemKey: number;
	itemName: string;
	quantity: 1;
};

export type SaveEdit =
	| QuantityEdit
	| InsertItemEdit
	| EquipmentEdit
	| InsertEquipmentEdit
	| InsertCatalogItemEdit
	| CompanionEdit
	| SkillEdit
	| DyeEdit
	| ItemConditionEdit
	| LevelEdit
	| QuestStateEdit
	| CompanionRenameEdit;
