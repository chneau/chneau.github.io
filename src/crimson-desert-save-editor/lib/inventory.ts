/**
 * The inventory model the editor's views work with.
 *
 * The save engine deals in bytes, PARC blocks and records; the views deal in
 * names, categories and grouped rows. This is the layer in between: the record
 * shape the session emits, the catalog shape the page merges from two generated
 * tables, the grouping the table renders, and the small lookups (storage names,
 * item categories) that several views need. Keeping them here is what lets the
 * sidebar, the inventory table and the add-item drawer be separate components
 * without reaching back into the page.
 */

import type { CompanionCategory, CompanionSummary } from "@/lib/companions";
import type { EquipmentDetails } from "@/lib/equipment";
import { catalogStackSize } from "@/lib/item-catalog";
import type { SkillDescription } from "@/lib/save-engine/browser-skills";
import type { CharacterDescription } from "@/lib/save-engine/characters";
import type { CompanionNameDescription } from "@/lib/save-engine/companion-names";
import type { ItemCatalogEntry, ItemCatalogFile } from "@/lib/save-engine/data";
import type { DyeDescription } from "@/lib/save-engine/dyes";
import type { ConditionDescription } from "@/lib/save-engine/item-condition";

/** One record as the engine describes it, with any staged edit folded in. */
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
	/**
	 * The Catalog has an entry for this item and it is not equipment, so the
	 * editor has no Refinement or Sockets to configure on it. A different
	 * question from the drawer's `addsAsSingleRecord`, which asks whether adding
	 * the Item makes a single Record rather than a stack.
	 */
	noGearToEdit?: boolean;
};

/** What `SaveSession.parse` emits once a save has been read. */
export type ParseResult = {
	containerVersion: number;
	payloadBytes: number;
	records: InventoryRecord[];
	companions?: CompanionSummary;
	skills?: SkillDescription;
	dyes?: DyeDescription;
	levels?: CharacterDescription;
	names?: CompanionNameDescription;
	conditions?: ConditionDescription;
};

/**
 * The sections that are not the inventory and not a companion category, with
 * the copy the sidebar and the page header both show.
 */
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

/** Which section of the editor is on screen. */
export type SaveView = "inventory" | EditorView | CompanionCategory;

/**
 * An item catalog entry as the page uses it: the engine's entry plus the two
 * fields `catalog` merges in from the equipment catalog.
 */
export type CatalogItem = ItemCatalogEntry & {
	equipmentCategory?: string;
	/** Adding this item creates one standalone record, not a stack. */
	addsAsSingleRecord?: boolean;
};

export type Catalog = Omit<ItemCatalogFile, "items"> & {
	items: Record<string, CatalogItem>;
};

/** Every record of one item, in one storage, added up. */
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

/**
 * Fold the records of one storage into one row per item, in name order. A
 * staged addition has no save record yet, so its `recordList` holds the
 * placeholder record the caller synthesised.
 *
 * Only the item table is read, so callers that hold a name lookup alone — the
 * cheat-set planner, for one — do not need a whole catalog file.
 */
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

/**
 * The donor record a new stack in one storage would be cloned from: an item the
 * storage holds exactly once, in a stackable form.
 *
 * A `category` prefers a donor shaped like the item being added, then the
 * generic item (key 1), then name order — so the same storage always yields the
 * same donor for the same request, and the add-item picker and the cheat set
 * cannot disagree about which record a new item copies.
 */
export const stackDonor = ({
	records,
	catalog,
	inventoryKey,
	category = null,
}: {
	records: InventoryRecord[];
	catalog: { items: Record<string, CatalogItem> } | null;
	/** `null` when no storage is chosen yet, which has no donor. */
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
