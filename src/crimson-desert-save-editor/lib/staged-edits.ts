import type { CompanionEdit } from "./companions";
import type { EquipmentEdit, InsertEquipmentEdit } from "./equipment";
import type {
	CharacterEdit,
	CharacterPresetEdit,
} from "./save-engine/characters";
import type { CompanionRenameEdit } from "./save-engine/companion-names";
import type { DyeEdit } from "./save-engine/dyes";
import type {
	InsertItemEdit as EngineInsertItemEdit,
	QuantityEdit as EngineQuantityEdit,
} from "./save-engine/edits";
import type { ItemConditionEdit } from "./save-engine/item-condition";
import type { QuestEdit, QuestPresetEdit } from "./save-engine/quests";
import type { SkillEdit } from "./skills";

export type LevelEdit = CharacterEdit | CharacterPresetEdit;

export type QuestStateEdit = QuestEdit | QuestPresetEdit;

export type { CompanionRenameEdit, DyeEdit, ItemConditionEdit };

export type QuantityEdit = EngineQuantityEdit & {
	itemName: string;
};

export type InsertItemEdit = EngineInsertItemEdit & {
	templateName: string;
	itemName: string;
};

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
