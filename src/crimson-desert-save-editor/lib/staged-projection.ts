import type { EquipmentEdit, InsertEquipmentEdit } from "./equipment";
import type { InventoryRecord } from "./inventory";
import {
	equipmentStateOf,
	type RecordGearState,
} from "./save-engine/browser-equipment";
import type { EquipmentCatalogEntry } from "./save-engine/data";
import type {
	InsertCatalogItemEdit,
	InsertItemEdit,
	QuantityEdit,
	SaveEdit,
} from "./staged-edits";

const quantityEditFor = (
	edits: SaveEdit[],
	record: InventoryRecord,
): QuantityEdit | undefined =>
	edits.findLast(
		(edit): edit is QuantityEdit =>
			edit.type === "quantity" &&
			edit.inventoryKey === record.inventoryKey &&
			edit.slotNo === record.slotNo &&
			edit.itemKey === record.itemKey,
	);

const equipmentEditFor = (
	edits: SaveEdit[],
	record: InventoryRecord,
): EquipmentEdit | undefined =>
	edits.findLast(
		(edit): edit is EquipmentEdit =>
			edit.type === "equipment" &&
			edit.inventoryKey === record.inventoryKey &&
			edit.slotNo === record.slotNo &&
			edit.itemKey === record.itemKey,
	);

const projectRecord = (
	record: InventoryRecord,
	edits: SaveEdit[],
): InventoryRecord => {
	const quantity = quantityEditFor(edits, record);
	const withQuantity: InventoryRecord = quantity
		? {
				...record,
				quantity: quantity.newQuantity,
				originalQuantity: record.quantity,
			}
		: record;
	const equipment = equipmentEditFor(edits, record);
	if (!equipment || !record.equipment) return withQuantity;
	return {
		...withQuantity,
		equipment: {
			...record.equipment,
			refinement: equipment.refinement,
			unlockedSockets: equipment.unlockedSockets,
			socketItems: equipment.socketItems,
		},
		socketCount: equipment.unlockedSockets,
		filledSockets: equipment.socketItems.filter(Boolean).length,
		equipmentChanged: true,
	};
};

type InsertionEdit =
	| InsertItemEdit
	| InsertEquipmentEdit
	| InsertCatalogItemEdit;

const isInsertion = (edit: SaveEdit): edit is InsertionEdit =>
	edit.type === "insertItem" ||
	edit.type === "insertEquipment" ||
	edit.type === "insertCatalogItem";

type EquipmentCatalog = { items: Record<string, EquipmentCatalogEntry> } | null;

const donorOf = (
	saved: InventoryRecord[],
	edit: InsertItemEdit,
): InventoryRecord | null => {
	const templates = saved.filter(
		(record) =>
			record.inventoryKey === edit.inventoryKey &&
			record.itemKey === edit.templateItemKey,
	);
	return templates.length === 1 ? (templates[0] ?? null) : null;
};

const additionGear = (
	saved: InventoryRecord[],
	edit: InsertionEdit,
	definition: EquipmentCatalogEntry | undefined,
): RecordGearState => {
	if (edit.type === "insertEquipment") {
		return {
			refinement: edit.refinement,
			unlockedSockets: edit.unlockedSockets,
			socketItems: edit.socketItems,
			filledSockets: edit.socketItems.filter(Boolean).length,
		};
	}
	if (edit.type === "insertCatalogItem") {
		return {
			refinement: 0,
			unlockedSockets: definition?.initialUnlockedSockets ?? 0,
			socketItems: [null, null, null, null, null],
			filledSockets: 0,
		};
	}
	const donor = donorOf(saved, edit);
	if (!donor) {
		return {
			refinement: 0,
			unlockedSockets: 0,
			socketItems: [],
			filledSockets: 0,
		};
	}
	const gear = donor.equipment ?? null;
	return {
		refinement: gear?.refinement ?? 0,
		unlockedSockets: gear?.unlockedSockets ?? 0,
		socketItems:
			gear?.socketItems ??
			Array.from({ length: donor.socketCount }, () => null),
		filledSockets: donor.filledSockets,
	};
};

const stagedAdditions = (
	saved: InventoryRecord[],
	edits: SaveEdit[],
	catalog: EquipmentCatalog,
): InventoryRecord[] =>
	edits.filter(isInsertion).map((edit, index): InventoryRecord => {
		const definition = catalog?.items[String(edit.itemKey)];
		const state = equipmentStateOf(
			additionGear(saved, edit, definition),
			definition,
		);
		return {
			inventoryKey: edit.inventoryKey,
			itemNo: -(index + 1),
			itemKey: edit.itemKey,
			slotNo: -(index + 1),
			quantity: edit.type === "insertEquipment" ? 1 : edit.quantity,
			...state,
			noGearToEdit: definition !== undefined && state.equipment === null,
			staged: true,
		};
	});

export const projectRecords = (
	saved: InventoryRecord[],
	edits: SaveEdit[],
	catalog: EquipmentCatalog,
): InventoryRecord[] => [
	...saved.map((record) => projectRecord(record, edits)),
	...stagedAdditions(saved, edits, catalog),
];

type StorageSummary = {
	key: number;
	records: number;
	quantity: number;
};

const storagePriority = (key: number): number =>
	key === 2 ? 0 : key === 10 ? 1 : 2;

export const storageSummaries = (
	records: InventoryRecord[],
): StorageSummary[] => {
	const summaries = new Map<number, StorageSummary>();
	for (const record of records) {
		const summary = summaries.get(record.inventoryKey) ?? {
			key: record.inventoryKey,
			records: 0,
			quantity: 0,
		};
		summary.records += 1;
		summary.quantity += record.quantity;
		summaries.set(record.inventoryKey, summary);
	}
	return [...summaries.values()].sort(
		(left, right) =>
			storagePriority(left.key) - storagePriority(right.key) ||
			left.key - right.key,
	);
};

export const itemTypeCount = (
	records: InventoryRecord[],
	storageKey: number | null,
): number => {
	if (storageKey === null) return 0;
	return new Set(
		records
			.filter((record) => record.inventoryKey === storageKey)
			.map((record) => record.itemKey),
	).size;
};
