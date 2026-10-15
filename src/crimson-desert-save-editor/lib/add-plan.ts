import {
	type CatalogItem,
	type GroupedItem,
	groupRecords,
	type InventoryRecord,
	itemType,
	stackDonor,
	storageName,
} from "./inventory";
import type {
	InsertCatalogItemEdit,
	InsertItemEdit,
	QuantityEdit,
	SaveEdit,
} from "./staged-edits";

type StorageKeys = {
	held: Set<number>;
	staged: Set<number>;
};

export const storageKeys = ({
	records,
	edits,
	inventoryKey,
}: {
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
	edits: SaveEdit[];
	inventoryKey: number | null;
	itemKey: number;
	quantity: number;
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

const stackToGrow = (
	held: GroupedItem,
	preferredSlot: number | null,
): InventoryRecord | undefined =>
	held.recordList.find((record) => record.slotNo === preferredSlot) ??
	held.recordList[0];

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
