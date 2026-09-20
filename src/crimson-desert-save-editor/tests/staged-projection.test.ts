/**
 * The staged-edit projection.
 *
 * The projection is what the views draw, so it has one contract worth testing:
 * the record it shows for a staged edit must be the record the engine really
 * produces when that edit is applied. Both halves of each agreement case come
 * from the same fixture — the preview, then the applied save re-described
 * through `planSaveEdits`, which is the dispatch the page uses — and the
 * equipment catalog the page holds, which is what tells an added item what it
 * is.
 *
 * Run with `bun test` (or `bun run check:test`, the same command with the
 * repository's parallel and timeout settings).
 */

import { describe, expect, test } from "bun:test";
import { cheatGearEdits } from "../lib/cheat-gear";
import type { EquipmentDetails, EquipmentEdit } from "../lib/equipment";
import type { InventoryRecord } from "../lib/inventory";
import {
	describeInventory,
	type InventoryDescription,
} from "../lib/save-engine/browser-equipment";
import {
	type EquipmentCatalogEntry,
	type EquipmentCatalogFile,
	equipmentCatalogTable,
} from "../lib/save-engine/data";
import { planSaveEdits } from "../lib/save-engine/edits";
import type { QuantityEdit, SaveEdit } from "../lib/staged-edits";
import {
	itemTypeCount,
	projectRecords,
	storageSummaries,
} from "../lib/staged-projection";
import { fixture, mergedCatalog, opened } from "./fixtures";

const save = fixture("save.save");

/** The storage every agreement case stages into; the fixture's own inventory. */
const STORAGE = 2;

let catalogPromise: Promise<EquipmentCatalogFile> | undefined;
/** The equipment catalog as the page holds it, read once for every case. */
const catalog = (): Promise<EquipmentCatalogFile> => {
	catalogPromise ??= equipmentCatalogTable();
	return catalogPromise;
};

/**
 * Applies a staged list the way the page does — through the engine's own
 * dispatch, each run starting from the previous run's output — and describes
 * what came out.
 */
const applied = async (
	source: Uint8Array,
	edits: SaveEdit[],
): Promise<InventoryDescription> => {
	let current = source;
	for (const run of planSaveEdits(edits)) {
		const [next] = await run.run(current, async () => {});
		current = next;
	}
	return describeInventory(await opened(current));
};

/** A record's own identity: the storage, slot and item a save assigns it. */
const sameRecord = (left: InventoryRecord, right: InventoryRecord): boolean =>
	left.inventoryKey === right.inventoryKey &&
	left.slotNo === right.slotNo &&
	left.itemKey === right.itemKey;

const recordAt = (
	records: InventoryRecord[],
	target: InventoryRecord,
): InventoryRecord => {
	const found = records.find((record) => sameRecord(record, target));
	if (!found) {
		throw new Error(
			`No record for ${target.inventoryKey}:${target.slotNo}:${target.itemKey}`,
		);
	}
	return found;
};

/**
 * The record as the save holds it. The projection adds three display-only
 * fields — `staged`, `originalQuantity` and `equipmentChanged` — that an
 * applied save has no equivalent for, so both sides are compared in this shape.
 */
const savedShape = (record: InventoryRecord): InventoryRecord => ({
	inventoryKey: record.inventoryKey,
	itemNo: record.itemNo,
	itemKey: record.itemKey,
	slotNo: record.slotNo,
	quantity: record.quantity,
	socketCount: record.socketCount,
	filledSockets: record.filledSockets,
	equipment: record.equipment ?? null,
});

/**
 * What a staged addition and the record it becomes must agree on: everything
 * but identity, because the preview has no Item No or Slot to show and counts
 * down from -1 instead. Gear state is part of it, and so is whether the editor
 * can configure the item at all — both come from the equipment catalog through
 * the same rule the parse uses.
 *
 * The drawer's `addsAsSingleRecord` is a different question, asked of a catalog
 * entry rather than of a record, so it has no place here.
 */
const additionShape = (record: InventoryRecord) => ({
	itemKey: record.itemKey,
	quantity: record.quantity,
	socketCount: record.socketCount,
	filledSockets: record.filledSockets,
	equipment: record.equipment ?? null,
	noGearToEdit: record.noGearToEdit ?? false,
});

/** A refinement level the catalog allows this item and it does not already use. */
const nextRefinement = (record: InventoryRecord): number | null => {
	const equipment = record.equipment;
	if (!equipment || equipment.refinement >= 10) return null;
	return (
		equipment.refinementLevels.find(
			(level) => level !== equipment.refinement && level <= 10,
		) ?? null
	);
};

/**
 * The cheat set's staged list, used here because it is the repository's own
 * list of items the engine accepts: every addition family can be staged without
 * this file inventing keys or donating records.
 */
const cheatEdits = async (before: InventoryDescription): Promise<SaveEdit[]> =>
	(
		await cheatGearEdits({
			inventoryKey: STORAGE,
			records: before.records,
			catalog: { items: await mergedCatalog() },
		})
	).edits;

/** The one staged edit of a family, or a failure naming the family. */
const editOfType = <Type extends SaveEdit["type"]>(
	edits: SaveEdit[],
	type: Type,
): Extract<SaveEdit, { type: Type }> => {
	const found = edits.find(
		(edit): edit is Extract<SaveEdit, { type: Type }> => edit.type === type,
	);
	if (!found) throw new Error(`The cheat set stages no ${type} edit`);
	return found;
};

/** Projects one addition, applies it, and compares it against what landed. */
const expectAddition = async (
	before: InventoryDescription,
	edit: SaveEdit,
): Promise<void> => {
	const addition = projectRecords(before.records, [edit], await catalog()).find(
		(entry) => entry.staged,
	);
	expect(addition).toBeDefined();
	if (!addition) return;

	const after = await applied(save, [edit]);
	const landed = after.records.filter(
		(candidate) =>
			candidate.inventoryKey === addition.inventoryKey &&
			candidate.itemKey === addition.itemKey,
	);
	expect(landed.length, `item ${addition.itemKey}`).toBe(1);
	const created = landed[0];
	if (!created) return;
	expect(additionShape(addition), `item ${addition.itemKey}`).toEqual(
		additionShape(created),
	);
};

const record = (overrides: Partial<InventoryRecord> = {}): InventoryRecord => ({
	inventoryKey: 2,
	itemNo: 10,
	itemKey: 500,
	slotNo: 4,
	quantity: 7,
	socketCount: 0,
	filledSockets: 0,
	equipment: null,
	...overrides,
});

const equipmentDetails = (
	overrides: Partial<EquipmentDetails> = {},
): EquipmentDetails => ({
	refinement: 0,
	canRefine: true,
	refinementLevels: [0, 1, 2],
	unlockedSockets: 0,
	socketCap: 5,
	socketItems: [null, null, null, null, null],
	...overrides,
});

/** One catalog entry, as the generated table types it: every field present. */
const catalogEntry = (
	overrides: Partial<EquipmentCatalogEntry> = {},
): EquipmentCatalogEntry => ({
	name: "measured item",
	internalName: "measured_item",
	category: "Equipment",
	equipType: 0,
	equipTypeName: "none",
	defaultInventory: 2,
	socketCap: 5,
	blockedInGameData: false,
	characterEquipment: false,
	compatibleCharacters: [],
	refinementLevels: [0, 1, 2],
	canRefine: true,
	initialUnlockedSockets: 0,
	exclusionReason: null,
	...overrides,
});

/** A catalog holding exactly the given entries. */
const catalogOf = (
	entries: Record<string, Partial<EquipmentCatalogEntry>>,
): { items: Record<string, EquipmentCatalogEntry> } => ({
	items: Object.fromEntries(
		Object.entries(entries).map(([key, entry]) => [key, catalogEntry(entry)]),
	),
});

const quantityEdit = (
	target: InventoryRecord,
	newQuantity: number,
): QuantityEdit => ({
	type: "quantity",
	inventoryKey: target.inventoryKey,
	slotNo: target.slotNo,
	itemKey: target.itemKey,
	itemName: "measured item",
	expectedQuantity: target.originalQuantity ?? target.quantity,
	newQuantity,
});

const equipmentEdit = (
	target: InventoryRecord,
	overrides: Partial<EquipmentEdit> = {},
): EquipmentEdit => ({
	type: "equipment",
	inventoryKey: target.inventoryKey,
	slotNo: target.slotNo,
	itemKey: target.itemKey,
	itemName: "measured equipment",
	refinement: 0,
	unlockedSockets: 0,
	socketItems: [null, null, null, null, null],
	...overrides,
});

/** A stack added by cloning a saved record, with no catalog entry of its own. */
const insertItemEdit = (
	target: InventoryRecord,
	itemKey: number,
	quantity: number,
): SaveEdit => ({
	type: "insertItem",
	inventoryKey: target.inventoryKey,
	itemKey,
	templateItemKey: target.itemKey,
	templateName: "donor",
	itemName: "added item",
	quantity,
});

describe("staged edit projection", () => {
	test("with nothing staged it returns the save's own records", () => {
		const records = [record(), record({ itemKey: 501, slotNo: 5 })];
		expect(projectRecords(records, [], null)).toEqual(records);
	});

	test("a staged quantity replaces the count and remembers the saved one", () => {
		const target = record({ quantity: 7 });
		const other = record({ itemKey: 501, slotNo: 5, quantity: 3 });
		const projected = projectRecords(
			[target, other],
			[quantityEdit(target, 12)],
			null,
		);
		expect(recordAt(projected, target)).toEqual({
			...target,
			quantity: 12,
			originalQuantity: 7,
		});
		// Another record in the same storage is untouched.
		expect(recordAt(projected, other)).toEqual(other);
	});

	test("the last staged edit for one record wins", () => {
		const target = record();
		const projected = projectRecords(
			[target],
			[quantityEdit(target, 12), quantityEdit(target, 30)],
			null,
		);
		expect(recordAt(projected, target)?.quantity).toBe(30);
	});

	test("a staged equipment change replaces the whole record's gear state", () => {
		const saved = equipmentDetails({ refinement: 1, unlockedSockets: 2 });
		const target = record({ equipment: saved });
		const projected = recordAt(
			projectRecords(
				[target],
				[
					equipmentEdit(target, {
						refinement: 2,
						unlockedSockets: 3,
						socketItems: [900, null, 901, null, null],
					}),
				],
				null,
			),
			target,
		);
		expect(projected.equipment).toEqual({
			...saved,
			refinement: 2,
			unlockedSockets: 3,
			socketItems: [900, null, 901, null, null],
		});
		// The counts the table and the workshop read come from the same edit.
		expect(projected.socketCount).toBe(3);
		expect(projected.filledSockets).toBe(2);
		expect(projected.equipmentChanged).toBe(true);
	});

	test("a staged equipment change leaves a non-equipment record alone", () => {
		const target = record({ equipment: null });
		const projected = projectRecords([target], [equipmentEdit(target)], null);
		expect(recordAt(projected, target)).toEqual(target);
	});

	test("a staged addition has no save identity but carries the edit's numbers", () => {
		const donor = record({ itemKey: 500, slotNo: 4 });
		const projected = projectRecords(
			[donor],
			[
				insertItemEdit(donor, 700, 25),
				{
					type: "insertEquipment",
					inventoryKey: 2,
					itemKey: 800,
					itemName: "gear addition",
					refinement: 3,
					unlockedSockets: 2,
					socketItems: [901, null, null, null, null],
					equipment: equipmentDetails(),
				},
				{
					type: "insertCatalogItem",
					inventoryKey: 2,
					itemKey: 900,
					itemName: "single addition",
					quantity: 1,
				},
			],
			null,
		).filter((entry) => entry.staged);
		expect(projected.map((entry) => [entry.itemNo, entry.slotNo])).toEqual([
			[-1, -1],
			[-2, -2],
			[-3, -3],
		]);
		expect(projected[0]?.quantity).toBe(25);
		expect(projected[1]?.quantity).toBe(1);
		// With no catalog there is nothing to read an added item against, so it
		// previews no gear: the socket count is the list the record serializes,
		// which a fresh one always writes as five positions. Nothing is known to
		// be gear-less either, so the editor holds out for every addition.
		expect(projected[1]?.equipment).toBeNull();
		expect(projected[1]?.socketCount).toBe(5);
		expect(projected[2]?.socketCount).toBe(5);
		expect(projected.map((entry) => entry.noGearToEdit)).toEqual([
			false,
			false,
			false,
		]);
	});

	test("an added item's gear is read against the catalog", () => {
		const projected = projectRecords(
			[],
			[
				{
					type: "insertEquipment",
					inventoryKey: 2,
					itemKey: 800,
					itemName: "gear addition",
					refinement: 2,
					unlockedSockets: 2,
					socketItems: [901, null, null, null, null],
					equipment: equipmentDetails(),
				},
				{
					type: "insertCatalogItem",
					inventoryKey: 2,
					itemKey: 900,
					itemName: "single addition",
					quantity: 1,
				},
			],
			catalogOf({
				"800": {
					characterEquipment: true,
					socketCap: 3,
					refinementLevels: [0, 1, 2],
				},
				"900": {
					characterEquipment: false,
					socketCap: 0,
					refinementLevels: [0, 5],
					initialUnlockedSockets: 2,
				},
			}),
		);
		// The state the edit states, described under its catalog entry.
		expect(projected[0]?.equipment).toEqual({
			refinement: 2,
			canRefine: true,
			refinementLevels: [0, 1, 2],
			unlockedSockets: 2,
			socketCap: 3,
			socketItems: [901, null, null, null, null],
		});
		expect(projected[0]?.socketCount).toBe(2);
		expect(projected[0]?.filledSockets).toBe(1);
		// A fresh record gets the catalog entry's own defaults, which is what
		// `insertCatalogRecord` writes.
		expect(projected[1]?.equipment).toEqual({
			refinement: 0,
			canRefine: true,
			refinementLevels: [0, 5],
			unlockedSockets: 2,
			socketCap: 0,
			socketItems: [null, null, null, null, null],
		});
		expect(projected[1]?.socketCount).toBe(2);
		expect(projected[1]?.filledSockets).toBe(0);
		// Both are gear the editor can configure, so neither is held out for.
		expect(projected.map((entry) => entry.noGearToEdit)).toEqual([
			false,
			false,
		]);
	});

	test("an addition cloned from a saved record previews that record's gear", () => {
		const plain = record({ itemKey: 500, socketCount: 5 });
		const geared = record({
			itemKey: 501,
			slotNo: 5,
			socketCount: 2,
			filledSockets: 1,
			equipment: equipmentDetails({
				refinement: 4,
				unlockedSockets: 2,
				socketItems: [901, null, null, null, null],
			}),
		});
		const projected = projectRecords(
			[plain, geared],
			[
				// Neither item is equipment: the clone inherits the socket list the
				// applier copies with the record's bytes.
				insertItemEdit(plain, 700, 3),
				// This one is, so the clone reads as the donor does.
				insertItemEdit(geared, 701, 1),
			],
			catalogOf({
				"700": { characterEquipment: false, canRefine: false },
				"701": { characterEquipment: true, canRefine: false },
			}),
		).filter((entry) => entry.staged);
		expect(projected[0]?.socketCount).toBe(5);
		expect(projected[0]?.filledSockets).toBe(0);
		expect(projected[0]?.equipment).toBeNull();
		expect(projected[1]?.socketCount).toBe(2);
		expect(projected[1]?.filledSockets).toBe(1);
		expect(projected[1]?.equipment?.refinement).toBe(4);
		expect(projected[1]?.equipment?.unlockedSockets).toBe(2);
		// The clone of a donor the catalog calls gear-less is gear-less too, which
		// is the rule the save's own parse would reach.
		expect(projected.map((entry) => entry.noGearToEdit)).toEqual([true, false]);
	});

	test("storage summaries count the projection, in sidebar order", () => {
		const records = [
			record({ inventoryKey: 14, quantity: 1 }),
			record({ inventoryKey: 10, quantity: 4 }),
			record({ inventoryKey: 2, quantity: 5 }),
			record({ inventoryKey: 2, itemKey: 501, slotNo: 5, quantity: 6 }),
		];
		expect(storageSummaries(records)).toEqual([
			{ key: 2, records: 2, quantity: 11 },
			{ key: 10, records: 1, quantity: 4 },
			{ key: 14, records: 1, quantity: 1 },
		]);
	});

	test("the item type count is per storage and distinct", () => {
		const records = [
			record({ itemKey: 500, slotNo: 1 }),
			record({ itemKey: 500, slotNo: 2 }),
			record({ itemKey: 501, slotNo: 3 }),
			record({ inventoryKey: 10, itemKey: 502, slotNo: 4 }),
		];
		expect(itemTypeCount(records, 2)).toBe(2);
		expect(itemTypeCount(records, 10)).toBe(1);
		expect(itemTypeCount(records, null)).toBe(0);
	});
});

describe("the projection against the appliers", () => {
	test("a staged quantity previews what applying it writes", async () => {
		const before = await describeInventory(await opened(save));
		const target = before.records.find(
			(candidate) =>
				candidate.inventoryKey === STORAGE &&
				candidate.equipment === null &&
				candidate.quantity > 1,
		);
		expect(target).toBeDefined();
		if (!target) return;

		const edit = quantityEdit(target, target.quantity + 3);
		const projected = recordAt(
			projectRecords(before.records, [edit], await catalog()),
			target,
		);
		const after = await applied(save, [edit]);
		expect(savedShape(projected)).toEqual(
			savedShape(recordAt(after.records, target)),
		);
	});

	test("a staged equipment change previews what applying it writes", async () => {
		const before = await describeInventory(await opened(save));
		const target = before.records.find(
			(candidate) =>
				candidate.inventoryKey === STORAGE &&
				nextRefinement(candidate) !== null,
		);
		expect(target).toBeDefined();
		if (!target?.equipment) return;

		const refinement = nextRefinement(target);
		if (refinement === null) return;
		const edit = equipmentEdit(target, {
			refinement,
			unlockedSockets: target.equipment.unlockedSockets,
			socketItems: target.equipment.socketItems,
		});
		const projected = recordAt(
			projectRecords(before.records, [edit], await catalog()),
			target,
		);
		const after = await applied(save, [edit]);
		expect(savedShape(projected)).toEqual(
			savedShape(recordAt(after.records, target)),
		);
	});

	test("a staged stack addition previews the record the engine creates", async () => {
		const before = await describeInventory(await opened(save));
		await expectAddition(
			before,
			editOfType(await cheatEdits(before), "insertItem"),
		);
	});

	test("a staged single-record addition previews the record the engine creates", async () => {
		const before = await describeInventory(await opened(save));
		await expectAddition(
			before,
			editOfType(await cheatEdits(before), "insertCatalogItem"),
		);
	});

	test("a staged equipment addition previews the record the engine creates", async () => {
		const before = await describeInventory(await opened(save));
		await expectAddition(
			before,
			editOfType(await cheatEdits(before), "insertEquipment"),
		);
	});

	test("a clone of a record the catalog does not call equipment previews no gear", async () => {
		const before = await describeInventory(await opened(save));
		// The applier needs exactly one template record, so the donor is one the
		// Storage holds once — and not equipment, which is the case where the save's
		// own socket count is not visible in a description of it.
		const counts = new Map<number, number>();
		for (const candidate of before.records) {
			if (candidate.inventoryKey !== STORAGE) continue;
			counts.set(candidate.itemKey, (counts.get(candidate.itemKey) ?? 0) + 1);
		}
		const donor = before.records.find(
			(candidate) =>
				candidate.inventoryKey === STORAGE &&
				candidate.equipment === null &&
				candidate.socketCount > 0 &&
				counts.get(candidate.itemKey) === 1,
		);
		expect(donor).toBeDefined();
		if (!donor) return;
		// An item the catalog does call equipment, cloned from that donor: the
		// engine describes the clone as equipment with no unlocked sockets.
		const added = editOfType(await cheatEdits(before), "insertCatalogItem");
		await expectAddition(before, {
			type: "insertItem",
			inventoryKey: STORAGE,
			itemKey: added.itemKey,
			templateItemKey: donor.itemKey,
			templateName: "donor",
			itemName: added.itemName,
			quantity: 1,
		});
	});
});
