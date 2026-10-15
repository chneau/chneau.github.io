import type { CompanionCategory, CompanionSummary } from "./companions";
import type { EquipmentDetails } from "./equipment";
import { catalogStackSize } from "./item-catalog";
import type { SkillDescription } from "./save-engine/browser-skills";
import type { CharacterDescription } from "./save-engine/characters";
import type { CompanionNameDescription } from "./save-engine/companion-names";
import type { ItemCatalogEntry, ItemCatalogFile } from "./save-engine/data";
import type { DyeDescription } from "./save-engine/dyes";
import type { ConditionDescription } from "./save-engine/item-condition";

export type InventoryRecord = {
	inventoryKey: number;
	itemNo: number | string;
	itemKey: number;
	slotNo: number;
	quantity: number;
	socketCount: number;
	filledSockets: number;
	staged?: boolean;
	originalQuantity?: number;
	equipment?: EquipmentDetails | null;
	equipmentChanged?: boolean;
	noGearToEdit?: boolean;
};

export type ParseResult = {
	containerVersion: number;
	payloadBytes: number;
	records: InventoryRecord[];
	skippedRecords: number;
	skippedDetails: string[];
	companions?: CompanionSummary;
	skills?: SkillDescription;
	dyes?: DyeDescription;
	levels?: CharacterDescription;
	names?: CompanionNameDescription;
	conditions?: ConditionDescription;
};

type EditorView =
	| "skills"
	| "levels"
	| "quests"
	| "dyes"
	| "condition"
	| "names";

export const editorViewInfo: Record<
	EditorView,
	{ label: string; blurb: string }
> = {
	skills: {
		label: "Skills & knowledge",
		blurb:
			"Unlock the skill tree, learn knowledge and cap health, stamina and spirit",
	},
	levels: {
		label: "Levels & XP",
		blurb: "Set the player, bond, progression and companion levels",
	},
	quests: {
		label: "Quests & stages",
		blurb: "Complete, advance or reset quests, missions, stages and gauges",
	},
	dyes: {
		label: "Dye colours",
		blurb: "Recolour equipment that has already been dyed in-game",
	},
	condition: {
		label: "Item wear",
		blurb: "Set endurance, sharpness and remaining charges on your items",
	},
	names: {
		label: "Rename companions",
		blurb: "Give your pets, horses and workers their own names",
	},
};

export const isEditorView = (view: SaveView): view is EditorView =>
	Object.hasOwn(editorViewInfo, view);

export type SaveView = "inventory" | EditorView | CompanionCategory;

export type CatalogItem = ItemCatalogEntry & {
	equipmentCategory?: string;
	addsAsSingleRecord?: boolean;
};

export type Catalog = Omit<ItemCatalogFile, "items"> & {
	items: Record<string, CatalogItem>;
};

export type GroupedItem = {
	itemKey: number;
	name: string;
	category: string;
	description: string;
	quantity: number;
	records: number;
	firstSlot: number;
	socketCount: number;
	filledSockets: number;
	staged: boolean;
	recordList: InventoryRecord[];
};

const storageNames: Record<number, string> = {
	1: "Currency",
	2: "Character Inventory",
	3: "Account Add-ons",
	4: "Character Add-ons",
	5: "Quest Items",
	6: "Wagon",
	7: "Pets & Vehicles",
	8: "Camp Warehouse",
	9: "Warehouse",
	10: "Bank",
	11: "Camp Straw Storage",
	12: "Recovery",
	13: "Kuku Storage",
	14: "Hidden Inventory",
};

export const storageName = (key: number): string => {
	return storageNames[key] ?? `Storage ${key}`;
};

export const itemType = (item: CatalogItem): string => {
	if (item.equipmentCategory) return item.equipmentCategory;
	if (item.category) return item.category;
	const category = item.legacy_category_hint?.trim().toLowerCase();
	const searchable = `${item.name} ${item.description ?? ""} ${
		item.legacy_internal_name_hint ?? ""
	}`.toLowerCase();

	if (searchable.includes("abyssgear")) return "Abyss Gear";
	if (category === "consumable") return "Consumables";
	if (category === "currency") return "Currency";
	if (category === "ammo") return "Ammunition";
	if (category === "quest") return "Quest Items";
	if (
		category === "material" ||
		/crafting|refinement material/.test(searchable)
	) {
		return "Crafting Materials";
	}
	if (/onehand(?:ed)?sword|one hand(?:ed)? sword/.test(searchable)) {
		return "One-Handed Swords";
	}
	if (/twohand(?:ed)?sword|two hand(?:ed)? sword/.test(searchable)) {
		return "Two-Handed Swords";
	}
	if (/helm|headgear/.test(searchable)) return "Helmets";
	if (/glove|gauntlet/.test(searchable)) return "Gloves";
	if (/boot|shoe|footwear/.test(searchable)) return "Boots";
	if (/shield/.test(searchable)) return "Shields";
	if (/spear/.test(searchable)) return "Spears";
	if (/bow/.test(searchable)) return "Bows";
	if (/musket|rifle|firearm/.test(searchable)) return "Firearms";
	if (category === "equipment") return "Equipment";
	return "Other";
};

export const groupRecords = (
	records: InventoryRecord[],
	catalog: { items: Record<string, CatalogItem> } | null,
): GroupedItem[] => {
	const grouped = new Map<number, GroupedItem>();
	for (const record of records) {
		const catalogItem = catalog?.items[String(record.itemKey)];
		const existing = grouped.get(record.itemKey);
		if (existing) {
			existing.quantity += record.quantity;
			existing.records += 1;
			existing.socketCount = Math.max(existing.socketCount, record.socketCount);
			existing.filledSockets = Math.max(
				existing.filledSockets,
				record.filledSockets,
			);
			existing.staged = existing.staged || Boolean(record.staged);
			existing.recordList.push(record);
			continue;
		}
		grouped.set(record.itemKey, {
			itemKey: record.itemKey,
			name: catalogItem?.name ?? `Unknown item ${record.itemKey}`,
			category: catalogItem ? itemType(catalogItem) : "Unclassified",
			description:
				catalogItem?.description ??
				"No current-game description is available for this item.",
			quantity: record.quantity,
			records: 1,
			firstSlot: record.slotNo,
			socketCount: record.socketCount,
			filledSockets: record.filledSockets,
			staged: Boolean(record.staged),
			recordList: [record],
		});
	}
	return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const stackDonor = ({
	records,
	catalog,
	inventoryKey,
	category = null,
}: {
	records: InventoryRecord[];
	catalog: { items: Record<string, CatalogItem> } | null;
	inventoryKey: number | null;
	category?: string | null;
}): GroupedItem | null => {
	if (inventoryKey === null) return null;
	const candidates = groupRecords(
		records.filter((record) => record.inventoryKey === inventoryKey),
		catalog,
	).filter(
		(item) =>
			item.records === 1 &&
			catalogStackSize(catalog?.items[String(item.itemKey)]) > 1,
	);
	const sameCategory = (item: GroupedItem) =>
		category !== null && item.category === category;
	return (
		candidates.sort(
			(left, right) =>
				Number(sameCategory(right)) - Number(sameCategory(left)) ||
				(left.itemKey === 1 || right.itemKey === 1
					? left.itemKey === 1
						? -1
						: 1
					: left.name.localeCompare(right.name)),
		)[0] ?? null
	);
};
