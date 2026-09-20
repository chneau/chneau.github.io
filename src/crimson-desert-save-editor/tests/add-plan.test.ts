/**
 * The add rule.
 *
 * Two contracts. The first is the rule itself: which of the three shapes adding
 * an item to a storage takes, and what it refuses instead. The second is the one
 * the views depend on — the edit the rule produces is one the engine really
 * applies, so a staged addition cannot fail at the download because the picker
 * and the applier disagreed.
 *
 * Run with `bun test` (or `bun run check:test`, the same command with the
 * repository's parallel and timeout settings).
 */

import { describe, expect, test } from "bun:test";
import { planAddition, storageKeys } from "../lib/add-plan";
import type { InsertEquipmentEdit } from "../lib/equipment";
import type { CatalogItem, InventoryRecord } from "../lib/inventory";
import { describeInventory } from "../lib/save-engine/browser-equipment";
import { planSaveEdits } from "../lib/save-engine/edits";
import type {
	InsertCatalogItemEdit,
	InsertItemEdit,
	QuantityEdit,
	SaveEdit,
} from "../lib/staged-edits";
import { catalogOf, fixture, mergedCatalog, opened } from "./fixtures";

/** The storage the fixture's own inventory lives in. */
const STORAGE = 2;

const record = (overrides: Partial<InventoryRecord> = {}): InventoryRecord => ({
	inventoryKey: STORAGE,
	itemNo: 10,
	itemKey: 500,
	slotNo: 1,
	quantity: 3,
	socketCount: 0,
	filledSockets: 0,
	...overrides,
});

const quantityEdit = (overrides: Partial<QuantityEdit> = {}): QuantityEdit => ({
	type: "quantity",
	inventoryKey: STORAGE,
	slotNo: 1,
	itemKey: 500,
	itemName: "Stackable Item",
	expectedQuantity: 3,
	newQuantity: 10,
	...overrides,
});

const insertCatalogEdit = (itemKey: number): InsertCatalogItemEdit => ({
	type: "insertCatalogItem",
	inventoryKey: STORAGE,
	itemKey,
	itemName: `Item ${itemKey}`,
	quantity: 1,
});

const insertEquipmentEdit = (itemKey: number): InsertEquipmentEdit => ({
	type: "insertEquipment",
	inventoryKey: STORAGE,
	itemKey,
	itemName: `Item ${itemKey}`,
	refinement: 0,
	unlockedSockets: 0,
	socketItems: [null, null, null, null, null],
	equipment: {
		refinement: 0,
		canRefine: false,
		refinementLevels: [0],
		unlockedSockets: 0,
		socketCap: 0,
		socketItems: [null, null, null, null, null],
	},
});

/** The three shapes, as a plan either produced or refused to produce. */
const shapeOf = (plan: ReturnType<typeof planAddition>): string =>
	"error" in plan ? `error: ${plan.error}` : plan.edit.type;

const editOf = (
	plan: ReturnType<typeof planAddition>,
): QuantityEdit | InsertItemEdit | InsertCatalogItemEdit => {
	if ("error" in plan) throw new Error(`Refused: ${plan.error}`);
	return plan.edit;
};

describe("the add rule", () => {
	test("a stack the storage holds grows by what was asked", () => {
		const plan = planAddition({
			records: [record({ quantity: 3 })],
			catalog: catalogOf({ "500": { name: "Stackable Item", max_stack: 20 } }),
			edits: [],
			inventoryKey: STORAGE,
			itemKey: 500,
			quantity: 2,
		});
		expect(editOf(plan)).toEqual({
			type: "quantity",
			inventoryKey: STORAGE,
			slotNo: 1,
			itemKey: 500,
			itemName: "Stackable Item",
			expectedQuantity: 3,
			newQuantity: 5,
		});
	});

	test("the selected stack is the one that grows", () => {
		const plan = planAddition({
			records: [
				record({ slotNo: 1, quantity: 3 }),
				record({ slotNo: 7, quantity: 40 }),
			],
			catalog: catalogOf({ "500": { name: "Stackable Item", max_stack: 20 } }),
			edits: [],
			inventoryKey: STORAGE,
			itemKey: 500,
			quantity: 2,
			preferredSlot: 7,
		});
		expect(editOf(plan)).toMatchObject({ slotNo: 7, newQuantity: 42 });
	});

	test("a staged quantity is added to, not overwritten", () => {
		const plan = planAddition({
			records: [record({ quantity: 3 })],
			catalog: catalogOf({ "500": { name: "Stackable Item", max_stack: 20 } }),
			edits: [quantityEdit({ newQuantity: 10 })],
			inventoryKey: STORAGE,
			itemKey: 500,
			quantity: 2,
		});
		// The stage still expects the save's own quantity; only the total moves.
		expect(editOf(plan)).toMatchObject({
			expectedQuantity: 3,
			newQuantity: 12,
		});
	});

	test("the stack ceiling is refused rather than written", () => {
		const plan = planAddition({
			records: [record({ quantity: 999_999_998 })],
			catalog: catalogOf({ "500": { name: "Stackable Item", max_stack: 20 } }),
			edits: [],
			inventoryKey: STORAGE,
			itemKey: 500,
			quantity: 5,
		});
		expect(plan).toEqual({
			error: "The resulting stack quantity cannot exceed 999,999,999.",
		});
	});

	test("an item that adds as one is inserted on its own, as one", () => {
		const plan = planAddition({
			records: [],
			catalog: catalogOf({
				"900": { name: "One Of A Kind", addsAsSingleRecord: true },
			}),
			edits: [],
			inventoryKey: STORAGE,
			itemKey: 900,
			quantity: 25,
		});
		expect(editOf(plan)).toEqual({
			type: "insertCatalogItem",
			inventoryKey: STORAGE,
			itemKey: 900,
			itemName: "One Of A Kind",
			quantity: 1,
		});
	});

	test("an item that adds as one is refused when the storage holds it", () => {
		const plan = planAddition({
			records: [record({ itemKey: 900 })],
			catalog: catalogOf({
				"900": { name: "One Of A Kind", addsAsSingleRecord: true },
			}),
			edits: [],
			inventoryKey: STORAGE,
			itemKey: 900,
			quantity: 1,
		});
		expect(plan).toEqual({
			error: "This item adds as a single record, and it is already here.",
		});
	});

	test("a new stack is cloned from a donor the storage holds once", () => {
		const plan = planAddition({
			records: [
				// A stackable item held twice is not a donor: cloning it would copy
				// the wrong record's bytes.
				record({ itemKey: 400, slotNo: 4, quantity: 5 }),
				record({ itemKey: 400, slotNo: 5, quantity: 5 }),
				record({ itemKey: 300, slotNo: 6, quantity: 1 }),
			],
			catalog: catalogOf({
				"300": { name: "Donor", max_stack: 20 },
				"400": { name: "Twice Held", max_stack: 20 },
				"600": { name: "New Item", max_stack: 20 },
			}),
			edits: [],
			inventoryKey: STORAGE,
			itemKey: 600,
			quantity: 4,
		});
		expect(editOf(plan)).toEqual({
			type: "insertItem",
			inventoryKey: STORAGE,
			templateItemKey: 300,
			templateName: "Donor",
			itemKey: 600,
			itemName: "New Item",
			quantity: 4,
		});
	});

	test("a storage with nothing stackable cannot take a new item", () => {
		const plan = planAddition({
			records: [record({ itemKey: 500 })],
			catalog: catalogOf({
				"500": { name: "Held Once, Not Stackable" },
				"600": { name: "New Item", max_stack: 20 },
			}),
			edits: [],
			inventoryKey: STORAGE,
			itemKey: 600,
			quantity: 1,
		});
		expect(plan).toEqual({
			error: "New items cannot currently be added to this storage location.",
		});
	});

	test("an item already staged is refused rather than queued twice", () => {
		const plan = planAddition({
			records: [],
			catalog: catalogOf({ "600": { name: "New Item", max_stack: 20 } }),
			edits: [insertCatalogEdit(600)],
			inventoryKey: STORAGE,
			itemKey: 600,
			quantity: 1,
		});
		expect(plan).toEqual({
			error: "This item is already staged for Character Inventory.",
		});
	});

	test("an equipment insertion counts against the item too", () => {
		// The engine refuses a second record with an item key in one storage, so
		// the membership question cannot be limited to the item insertions.
		const plan = planAddition({
			records: [],
			catalog: catalogOf({ "800": { name: "Gear", max_stack: 1 } }),
			edits: [insertEquipmentEdit(800)],
			inventoryKey: STORAGE,
			itemKey: 800,
			quantity: 1,
		});
		expect(plan).toEqual({
			error: "This item is already staged for Character Inventory.",
		});
	});

	test("no storage, no plan", () => {
		expect(
			shapeOf(
				planAddition({
					records: [record()],
					catalog: catalogOf({ "500": { name: "Stackable Item" } }),
					edits: [],
					inventoryKey: null,
					itemKey: 500,
					quantity: 1,
				}),
			),
		).toBe("error: Choose a storage location first.");
	});

	test("an item the catalog cannot name is refused", () => {
		expect(
			shapeOf(
				planAddition({
					records: [],
					catalog: catalogOf({ "500": { name: "Stackable Item" } }),
					edits: [],
					inventoryKey: STORAGE,
					itemKey: 901,
					quantity: 1,
				}),
			),
		).toBe("error: Item 901 is not in this game's catalog.");
		// A catalog that has not loaded yet is the same answer, not a crash.
		expect(
			shapeOf(
				planAddition({
					records: [],
					catalog: null,
					edits: [],
					inventoryKey: STORAGE,
					itemKey: 901,
					quantity: 1,
				}),
			),
		).toBe("error: Item 901 is not in this game's catalog.");
	});
});

describe("what a storage holds and has staged", () => {
	test("the held and staged item keys of one storage", () => {
		const keys = storageKeys({
			records: [
				{ inventoryKey: STORAGE, itemKey: 500 },
				{ inventoryKey: STORAGE, itemKey: 500 },
				{ inventoryKey: 10, itemKey: 501 },
			],
			edits: [
				insertCatalogEdit(600),
				insertEquipmentEdit(800),
				{ ...insertCatalogEdit(700), inventoryKey: 10 },
				quantityEdit({ itemKey: 500 }),
			],
			inventoryKey: STORAGE,
		});
		expect([...keys.held]).toEqual([500]);
		// Only insertions count as staged, and only in this storage.
		expect([...keys.staged]).toEqual([600, 800]);
	});

	test("an unchosen storage holds and has staged nothing", () => {
		const keys = storageKeys({
			records: [{ inventoryKey: STORAGE, itemKey: 500 }],
			edits: [insertCatalogEdit(600)],
			inventoryKey: null,
		});
		expect(keys.held.size).toBe(0);
		expect(keys.staged.size).toBe(0);
	});
});

describe("the plan against the appliers", () => {
	/** Applies one edit the way the page does, and describes what came out. */
	const applied = async (source: Uint8Array, edit: SaveEdit) => {
		const run = planSaveEdits([edit])[0];
		if (!run) throw new Error("the dispatch planned no run");
		const [next] = await run.run(source, async () => {});
		return describeInventory(await opened(next));
	};

	test("each shape plans an edit the engine really applies", async () => {
		const save = fixture("save.save");
		const merged = await mergedCatalog();
		const catalog = { items: merged };
		const before = await describeInventory(await opened(save));
		const held = before.records.filter(
			(record) => record.inventoryKey === STORAGE,
		);
		const heldKeys = new Set(held.map((record) => record.itemKey));

		// A stack the storage already holds, one past the largest stack so the
		// growth is unambiguous.
		const stack = held.find((record) => record.quantity > 1);
		expect(stack, "a stack to grow").toBeDefined();
		if (!stack) return;
		const grown = editOf(
			planAddition({
				records: before.records,
				catalog,
				edits: [],
				inventoryKey: STORAGE,
				itemKey: stack.itemKey,
				quantity: 3,
				preferredSlot: stack.slotNo,
			}),
		);
		expect(grown.type).toBe("quantity");
		const grownAfter = await applied(save, grown);
		expect(
			grownAfter.records.find(
				(record) =>
					record.inventoryKey === stack.inventoryKey &&
					record.slotNo === stack.slotNo,
			)?.quantity,
		).toBe(stack.quantity + 3);

		// A new stack cloned from a donor, and an item that adds as one, both for
		// items the fixture does not already hold.
		const keyOf = (pick: (item: CatalogItem) => boolean) =>
			Object.entries(merged).find(
				([key, item]) => !heldKeys.has(Number(key)) && pick(item),
			)?.[0];
		const stackableKey = Number(keyOf((item) => !item.addsAsSingleRecord));
		const singleKey = Number(keyOf((item) => item.addsAsSingleRecord === true));
		expect(stackableKey, "a stackable item to clone").toBeGreaterThan(0);
		expect(singleKey, "an item that adds as one").toBeGreaterThan(0);

		for (const [itemKey, itemName] of [
			[stackableKey, "cloned"],
			[singleKey, "added on its own"],
		] as const) {
			const planned = editOf(
				planAddition({
					records: before.records,
					catalog,
					edits: [],
					inventoryKey: STORAGE,
					itemKey,
					quantity: 1,
				}),
			);
			expect(planned.type, `${itemName}: ${itemKey}`).toBe(
				itemKey === singleKey ? "insertCatalogItem" : "insertItem",
			);
			const after = await applied(save, planned);
			expect(
				after.records.find(
					(record) =>
						record.inventoryKey === STORAGE && record.itemKey === itemKey,
				),
				`item ${itemKey} ${itemName}`,
			).toBeDefined();
		}
	});
});
