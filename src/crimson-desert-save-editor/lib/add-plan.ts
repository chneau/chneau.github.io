/**
 * The one rule for adding an Item to a Storage, and what a Storage holds.
 *
 * Adding an item has three shapes — grow a stack the Storage already holds, add
 * an item that adds as one on its own, or clone a donor Record — and the picker
 * and the cheat set each used to decide between them on their own. They drifted
 * where it mattered: the picker grows a held stack while the cheat set leaves it
 * alone, and only one of them knew about the other's staged insertions. Here the
 * question is answered once, and the two callers differ only in what they do
 * with the answer.
 *
 * Everything this module decides is a fact about the rule rather than about a
 * screen, so the refusals read as the reason they happened. The callers add
 * their own framing: the drawer shows one as a dialog error, the cheat set lists
 * one beside the item it skipped.
 */

import {
	type CatalogItem,
	type GroupedItem,
	groupRecords,
	type InventoryRecord,
	itemType,
	stackDonor,
	storageName,
} from "@/lib/inventory";
import type {
	InsertCatalogItemEdit,
	InsertItemEdit,
	QuantityEdit,
	SaveEdit,
} from "@/lib/staged-edits";

/** The Item Keys one Storage holds and has staged, for O(1) membership tests. */
type StorageKeys = {
	/** Item Keys the save's own Records hold in this Storage. */
	held: Set<number>;
	/**
	 * Item Keys with an insertion already staged into this Storage, of any kind:
	 * the engine refuses a second Record with the same Item Key in one Storage,
	 * so every kind has to count.
	 */
	staged: Set<number>;
};

/**
 * What one Storage holds and has staged, as Item Keys.
 *
 * The two Sets keep the per-row questions cheap: a browser asks whether it holds
 * or has staged each of its four thousand rows. `staged` is empty for an
 * unchosen Storage, and both are empty for no Storage at all.
 */
export const storageKeys = ({
	records,
	edits,
	inventoryKey,
}: {
	/** Only the two identity fields are read, so a narrower record shape fits. */
	records: Array<{ inventoryKey: number; itemKey: number }>;
	edits: SaveEdit[];
	inventoryKey: number | null;
}): StorageKeys => {
	const held = new Set<number>();
	const staged = new Set<number>();
	if (inventoryKey === null) return { held, staged };
	for (const record of records) {
		if (record.inventoryKey === inventoryKey) held.add(record.itemKey);
	}
	for (const edit of edits) {
		if (
			(edit.type === "insertItem" ||
				edit.type === "insertCatalogItem" ||
				edit.type === "insertEquipment") &&
			edit.inventoryKey === inventoryKey
		) {
			staged.add(edit.itemKey);
		}
	}
	return { held, staged };
};

/**
 * What adding one Item to one Storage would stage, or why it cannot be staged.
 *
 * The shapes are exclusive and checked in this order: an Item the Storage has
 * already been given a staged insertion for is refused rather than queued twice;
 * an Item that adds as one is inserted on its own and is refused if the Storage
 * already holds it; an Item the Storage holds as a stack grows that stack; and
 * anything else is cloned from a donor.
 */
type AddPlan =
	| { edit: QuantityEdit | InsertItemEdit | InsertCatalogItemEdit }
	| { error: string };

export const planAddition = ({
	records,
	catalog,
	edits,
	inventoryKey,
	itemKey,
	quantity,
	preferredSlot = null,
}: {
	records: InventoryRecord[];
	catalog: { items: Record<string, CatalogItem> } | null;
	/** Every edit already staged this session, so a duplicate cannot be queued. */
	edits: SaveEdit[];
	inventoryKey: number | null;
	itemKey: number;
	/** How many the user asked for. An Item that adds as one always stages one. */
	quantity: number;
	/** The stack the picker selected, when the Storage holds more than one. */
	preferredSlot?: number | null;
}): AddPlan => {
	if (inventoryKey === null) {
		return { error: "Choose a storage location first." };
	}
	const item = catalog?.items[String(itemKey)];
	if (!item) {
		return { error: `Item ${itemKey} is not in this game's catalog.` };
	}
	if (storageKeys({ records, edits, inventoryKey }).staged.has(itemKey)) {
		return {
			error: `This item is already staged for ${storageName(inventoryKey)}.`,
		};
	}
	const held =
		groupRecords(
			records.filter((record) => record.inventoryKey === inventoryKey),
			catalog,
		).find((entry) => entry.itemKey === itemKey) ?? null;

	if (item.addsAsSingleRecord) {
		if (held) {
			return {
				error: "This item adds as a single record, and it is already here.",
			};
		}
		return {
			edit: {
				type: "insertCatalogItem",
				inventoryKey,
				itemKey,
				itemName: item.name,
				quantity: 1,
			},
		};
	}

	if (held) {
		const record = stackToGrow(held, preferredSlot);
		if (!record) {
			return { error: "This stack cannot be added to this storage." };
		}
		const newQuantity =
			(stagedQuantity(edits, record) ?? record.quantity) + quantity;
		if (newQuantity > 999_999_999) {
			return {
				error: "The resulting stack quantity cannot exceed 999,999,999.",
			};
		}
		return {
			edit: {
				type: "quantity",
				inventoryKey: record.inventoryKey,
				slotNo: record.slotNo,
				itemKey: record.itemKey,
				itemName: item.name,
				expectedQuantity: record.quantity,
				newQuantity,
			},
		};
	}

	// A new stack is cloned from a donor record, so the donor has to be an item
	// the storage already holds exactly once, in a stackable form.
	const donor = stackDonor({
		records,
		catalog,
		inventoryKey,
		category: itemType(item),
	});
	if (!donor) {
		return {
			error: "New items cannot currently be added to this storage location.",
		};
	}
	return {
		edit: {
			type: "insertItem",
			inventoryKey,
			templateItemKey: donor.itemKey,
			templateName: donor.name,
			itemKey,
			itemName: item.name,
			quantity,
		},
	};
};

/** The record a growing stack names: the selected one, or the first. */
const stackToGrow = (
	held: GroupedItem,
	preferredSlot: number | null,
): InventoryRecord | undefined =>
	held.recordList.find((record) => record.slotNo === preferredSlot) ??
	held.recordList[0];

/** The quantity an already-staged change leaves this record at, if there is one. */
const stagedQuantity = (
	edits: SaveEdit[],
	record: InventoryRecord,
): number | null => {
	const staged = edits.find(
		(edit): edit is QuantityEdit =>
			edit.type === "quantity" &&
			edit.inventoryKey === record.inventoryKey &&
			edit.slotNo === record.slotNo,
	);
	return staged?.newQuantity ?? null;
};
