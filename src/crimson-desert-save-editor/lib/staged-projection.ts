/**
 * The projection the views render: the save's records with the staged edits
 * folded in, so a change is visible before it is applied.
 *
 * This is a derivation, not a decision — which edits are staged is settled by
 * the panels that stage them — so it is a pure function of what it is handed
 * and holds no state. That is what lets `tests/staged-projection.test.ts` hold
 * it to the appliers it previews: project an edit, apply it, describe the
 * output, and the two records must agree. Nothing here is authority;
 * `SaveSession.apply` is what changes a save.
 *
 * A record the save does not hold yet has no own numbers to read, so an added
 * item's gear is derived from the edit and the equipment catalog — through the
 * same rule the parse of a saved record uses, `equipmentStateOf`.
 */

import type { EquipmentEdit, InsertEquipmentEdit } from "@/lib/equipment";
import type { InventoryRecord } from "@/lib/inventory";
import {
	equipmentStateOf,
	type RecordGearState,
} from "@/lib/save-engine/browser-equipment";
import type { EquipmentCatalogEntry } from "@/lib/save-engine/data";
import type {
	InsertCatalogItemEdit,
	InsertItemEdit,
	QuantityEdit,
	SaveEdit,
} from "@/lib/staged-edits";

/** The staged edit that decides this record's quantity, if one has been staged. */
const quantityEditFor = (
	edits: SaveEdit[],
	record: InventoryRecord,
): QuantityEdit | undefined =>
	edits.findLast(
		(edit): edit is QuantityEdit =>
			edit.type === "quantity" &&
			edit.inventoryKey === record.inventoryKey &&
			edit.slotNo === record.slotNo,
	);

/** The staged edit that decides this record's equipment, if one has been staged. */
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

/**
 * One saved record with the edits that address it folded in. `originalQuantity`
 * keeps the value the file holds, which a quantity change is staged against.
 */
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

/** The three ways an edit adds a record the save does not hold yet. */
type InsertionEdit =
	| InsertItemEdit
	| InsertEquipmentEdit
	| InsertCatalogItemEdit;

const isInsertion = (edit: SaveEdit): edit is InsertionEdit =>
	edit.type === "insertItem" ||
	edit.type === "insertEquipment" ||
	edit.type === "insertCatalogItem";

/** The equipment catalog, as much of it as a projection reads. */
type EquipmentCatalog = { items: Record<string, EquipmentCatalogEntry> } | null;

/**
 * The record a clone is taken from: the one saved record in the edit's Storage
 * with the edit's template key. `insertInventoryItem` refuses any other count,
 * so an edit without a single template is one the engine will refuse.
 */
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

/**
 * The gear numbers the save will hold for a staged addition.
 *
 * A fresh record gets the catalog entry's own defaults, which is what
 * `insertCatalogRecord` writes. A clone gets the template record's, because
 * `insertInventoryItem` inserts a copy of that record's bytes — but only as far
 * as a description of that template shows: the views never see a socket count
 * for a record the catalog does not call equipment, so the clone of one
 * previews none, and the socket list it copies is the one thing that carries
 * over visibly.
 */
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
		// A donor the catalog does not call equipment has no unlocked sockets to
		// read; the save holds none for it either, which the tests pin.
		unlockedSockets: gear?.unlockedSockets ?? 0,
		// Its socket list, however, comes with the copied bytes: unknown contents
		// at the length the donor serializes.
		socketItems:
			gear?.socketItems ??
			Array.from({ length: donor.socketCount }, () => null),
		filledSockets: donor.filledSockets,
	};
};

/**
 * The placeholder records staged additions show. The save has no record for
 * them yet, so identity is synthetic: `itemNo` and `slotNo` count down from -1,
 * which a real record's position or item number can never be, and `staged`
 * marks the row as not yet in the file.
 *
 * Their gear goes through the same rule the parse uses, so an added item the
 * catalog calls equipment previews the refinement and sockets the engine will
 * write, and the placeholder and the created record agree about everything but
 * identity. Without the catalog an addition previews no gear, which is what the
 * views showed before the catalog was passed in.
 */
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
			// The parse's own rule, so an added item is gear-less or not exactly as a
			// saved one is. The drawer's `addsAsSingleRecord` asks something else.
			noGearToEdit: definition !== undefined && state.equipment === null,
			staged: true,
		};
	});

/** The save's records with every staged edit folded in, additions last. */
export const projectRecords = (
	saved: InventoryRecord[],
	edits: SaveEdit[],
	catalog: EquipmentCatalog,
): InventoryRecord[] => [
	...saved.map((record) => projectRecord(record, edits)),
	...stagedAdditions(saved, edits, catalog),
];

/** One Storage as the sidebar, the add-item drawer and the workshop list it. */
type StorageSummary = {
	key: number;
	/** How many records it holds once staged additions are counted. */
	records: number;
	quantity: number;
};

/**
 * Where the sidebar puts each Storage: the two the editor is mostly used for
 * first, then the rest in key order.
 */
const storagePriority = (key: number): number =>
	key === 2 ? 0 : key === 10 ? 1 : 2;

/** Every Storage the projection holds records for, in sidebar order. */
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

/** How many distinct items one Storage holds, for the header subtitle. */
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
