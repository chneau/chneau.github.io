/**
 * The cheat set.
 *
 * Its value is in a dozen hard-coded keys, pinned to a third-party data patch
 * that nothing else in this repository knows about — so without this check a
 * catalog regeneration, a renamed item or a typo would leave the button quietly
 * staging the wrong thing, or nothing at all. The keys, their names and the
 * path each one has to take are verified against the generated catalogs, and
 * the last case then proves the point of the whole feature: the engine really
 * accepts the staged set and every item lands.
 *
 * The cases after that are the other half of the contract. The set has to be
 * safe against the save it is pointed at: an item the storage already holds,
 * and a button pressed twice, must both leave the download working rather than
 * take every other staged edit down with them.
 */

import { describe, expect, test } from "bun:test";
import { planAddition } from "../lib/add-plan";
import {
	cheatGearEdits,
	cheatGearPlans,
	cheatGearSet,
} from "../lib/cheat-gear";
import { catalogStackSize, isAddableItem } from "../lib/item-catalog";
import { describeInventory } from "../lib/save-engine/browser-equipment";
import { equipmentCatalogTable } from "../lib/save-engine/data";
import { RUNTIME_RESTRICTED_EQUIPMENT } from "../lib/save-engine/donor-equipment-inserter";
import { planSaveEdits } from "../lib/save-engine/edits";
import type { SaveEdit } from "../lib/staged-edits";
import { fixture, mergedCatalog, opened } from "./fixtures";

/** The storage the set is staged into; the fixture's character inventory. */
const STORAGE = 2;

/** The endgame fixture's camp warehouse, which holds three set items. */
const WAREHOUSE = 8;

/** An endgame run re-serializes the whole save; it needs more than the default. */
const ENDGAME_TIMEOUT = 60_000;

/** The item endgame.save already holds in the character inventory. */
const HELD_EARRING = 8504;

/** Runs a staged list the way the download does, and returns the new bytes. */
const apply = async (source: Uint8Array, edits: SaveEdit[]) => {
	let current = source;
	for (const run of planSaveEdits(edits)) {
		const [next] = await run.run(current, async () => {});
		current = next;
	}
	return current;
};

/** The item keys one staged list would insert, in staging order. */
const insertedKeys = (edits: SaveEdit[]): number[] =>
	edits.flatMap((edit) => ("itemKey" in edit ? [edit.itemKey] : []));

/**
 * Presses "Add cheat set" the way the drawer does — appending, never replacing —
 * so a second press is a second call against the first press's staged list.
 */
const pressCheatSet = async (
	save: Uint8Array,
	staged: SaveEdit[],
	inventoryKey: number,
) => {
	const { records } = await describeInventory(await opened(save));
	const { edits, skipped } = await cheatGearEdits({
		inventoryKey,
		records,
		catalog: { items: await mergedCatalog() },
		staged,
	});
	return { planned: [...staged, ...edits], skipped };
};

describe("cheat gear set", () => {
	test("every set item resolves to a catalog item the drawer can stage", async () => {
		const merged = await mergedCatalog();
		const equipment = await equipmentCatalogTable();
		const plans = new Map(
			(await cheatGearPlans()).map((plan) => [plan.itemKey, plan]),
		);
		for (const gear of cheatGearSet) {
			const key = String(gear.itemKey);
			const item = merged[key];
			expect(item, `item ${key} (${gear.label})`).toBeDefined();
			if (!item) continue;
			expect(item.name).toBe(gear.label);
			expect(key in RUNTIME_RESTRICTED_EQUIPMENT).toBe(false);
			const definition = equipment.items[key];
			if (definition?.characterEquipment) {
				// Character gear goes through the equipment inserter, which wants an
				// equippable, unblocked item at a refinement level it supports.
				expect(definition.blockedInGameData).toBe(false);
				expect(definition.compatibleCharacters.length).toBeGreaterThan(0);
				const plan = plans.get(gear.itemKey);
				expect(plan?.equipment, `${gear.label} maxed configuration`).not.toBe(
					null,
				);
				expect(definition.refinementLevels).toContain(
					plan?.equipment?.refinement ?? -1,
				);
				expect(plan?.equipment?.unlockedSockets).toBeLessThanOrEqual(
					definition.socketCap ?? 0,
				);
				continue;
			}
			// Everything else lands through Add Item: a record the catalog adds as
			// one, or a stack cloned from a donor, which needs a stack size above
			// one.
			expect(isAddableItem(item)).toBe(true);
			if (item.addsAsSingleRecord) {
				expect(definition?.characterEquipment).toBeFalsy();
				continue;
			}
			expect(catalogStackSize(item)).toBeGreaterThan(1);
		}
	});

	test("no item appears twice in the set", () => {
		const keys = cheatGearSet.map((gear) => gear.itemKey);
		expect(new Set(keys).size).toBe(keys.length);
	});

	test("every item the set leaves out is one the picker would not add", async () => {
		// The batch and the add-item picker decide through one rule, so a skip can
		// only ever be an item the rule itself refuses, or a stack the storage
		// already holds, which a preset must not grow. Anything else would mean the
		// button had quietly stopped offering an item the picker can stage.
		const save = fixture("save.save");
		const catalog = { items: await mergedCatalog() };
		const before = await describeInventory(await opened(save));
		const { skipped } = await cheatGearEdits({
			inventoryKey: STORAGE,
			records: before.records,
			catalog,
		});
		for (const skip of skipped) {
			const gear = cheatGearSet.find((entry) => entry.label === skip.label);
			expect(gear, `a set item named ${skip.label}`).toBeDefined();
			if (!gear) continue;
			const planned = planAddition({
				records: before.records,
				catalog,
				edits: [],
				inventoryKey: STORAGE,
				itemKey: gear.itemKey,
				quantity: 1,
			});
			const justified = "error" in planned || planned.edit.type === "quantity";
			expect(justified, `${skip.label}: ${skip.reason}`).toBe(true);
		}
	});

	test("the engine applies the whole set to a real save", async () => {
		const save = fixture("save.save");
		const merged = await mergedCatalog();
		const before = await describeInventory(await opened(save));
		const { edits, skipped } = await cheatGearEdits({
			inventoryKey: STORAGE,
			records: before.records,
			catalog: { items: merged },
		});
		// Every item is accounted for: staged, or left out with a reason.
		expect(edits.length + skipped.length).toBe(cheatGearSet.length);
		expect(edits.length).toBeGreaterThan(0);

		let current = save;
		for (const run of planSaveEdits(edits)) {
			const [next] = await run.run(current, async () => {});
			current = next;
		}

		const after = await describeInventory(await opened(current));
		expect(after.records.length).toBe(before.records.length + edits.length);
		const landed = new Set(
			after.records
				.filter((record) => record.inventoryKey === STORAGE)
				.map((record) => record.itemKey),
		);
		for (const edit of edits) {
			if (!("itemKey" in edit)) continue;
			expect(landed.has(edit.itemKey), `item ${edit.itemKey} inserted`).toBe(
				true,
			);
		}
		// Nothing the save already held moved, changed or was lost.
		const signature = (record: (typeof after.records)[number]) =>
			`${record.inventoryKey}:${record.itemNo}:${record.itemKey}:${record.slotNo}:${record.quantity}`;
		const afterSignatures = new Set(after.records.map(signature));
		for (const record of before.records) {
			expect(afterSignatures.has(signature(record)), signature(record)).toBe(
				true,
			);
		}
	});
});

/**
 * What the set does about a save that is not empty.
 *
 * The equipment inserter refuses a second record with an item key in one storage
 * by throwing, and `SaveSession.runApply` has no way to catch that for one edit
 * without losing the whole download. So a held item and an already-staged one
 * have to be settled before anything is staged, as a skip with a reason — the
 * same two answers the equipment browser shows, and the same refusal the add
 * rule already made for plain items.
 */
describe("the cheat set against a save that is not empty", () => {
	test(
		"an item the storage already holds is skipped, and the rest still apply",
		async () => {
			// endgame.save holds one set item in the character inventory: the earring
			// the set stages as its own second earring. It used to be staged anyway
			// and threw the whole download away at the last moment.
			const save = fixture("endgame.save");
			const catalog = { items: await mergedCatalog() };
			const before = await describeInventory(await opened(save));
			const { edits, skipped } = await cheatGearEdits({
				inventoryKey: STORAGE,
				records: before.records,
				catalog,
			});

			expect(skipped).toEqual([
				{
					label: "Earring of Dark Magic",
					reason: "already in Character Inventory",
					existing: true,
					wasStaged: false,
				},
			]);
			expect(edits.length + skipped.length).toBe(cheatGearSet.length);
			expect(edits.length).toBe(cheatGearSet.length - 1);
			// The one item that is left out is the one the save holds.
			expect(insertedKeys(edits)).not.toContain(HELD_EARRING);

			// The download the user was promised: no throw, and the rest landed.
			const after = await describeInventory(
				await opened(await apply(save, edits)),
			);
			expect(after.records.length).toBe(before.records.length + edits.length);
			const held = after.records.filter(
				(record) =>
					record.inventoryKey === STORAGE && record.itemKey === HELD_EARRING,
			);
			expect(held, "the earring the save already held").toHaveLength(1);
			for (const key of insertedKeys(edits)) {
				expect(
					after.records.some(
						(record) =>
							record.inventoryKey === STORAGE && record.itemKey === key,
					),
					`item ${key} inserted`,
				).toBe(true);
			}
		},
		ENDGAME_TIMEOUT,
	);

	test(
		"three items the storage holds cost the other twelve, not the download",
		async () => {
			// The endgame camp warehouse holds three set items, so this is the partial
			// success case: a third of the set is left out and the rest still commits.
			const save = fixture("endgame.save");
			const catalog = { items: await mergedCatalog() };
			const before = await describeInventory(await opened(save));
			const { edits, skipped } = await cheatGearEdits({
				inventoryKey: WAREHOUSE,
				records: before.records,
				catalog,
			});

			expect(skipped.map((skip) => skip.label)).toEqual([
				"Official Knight's Plate Armor",
				"Ancient's Necklace",
				"Karmic Pulse",
			]);
			expect(skipped.every((skip) => skip.existing && !skip.wasStaged)).toBe(
				true,
			);
			expect(edits.length).toBe(cheatGearSet.length - 3);
			expect(edits.length).toBeGreaterThan(0);

			const after = await describeInventory(
				await opened(await apply(save, edits)),
			);
			expect(after.records.length).toBe(before.records.length + edits.length);
			for (const key of insertedKeys(edits)) {
				expect(
					after.records.some(
						(record) =>
							record.inventoryKey === WAREHOUSE && record.itemKey === key,
					),
					`item ${key} inserted`,
				).toBe(true);
			}
			// Each held item is still there exactly once, untouched.
			for (const skip of skipped) {
				const gear = cheatGearSet.find((entry) => entry.label === skip.label);
				const held = after.records.filter(
					(record) =>
						record.inventoryKey === WAREHOUSE &&
						record.itemKey === gear?.itemKey,
				);
				expect(held, `${skip.label} left as it was`).toHaveLength(1);
			}
		},
		ENDGAME_TIMEOUT,
	);

	test("pressing the button twice stages the set once", async () => {
		// The drawer appends, so a second press used to stack a second copy of
		// every equipment edit — and the first duplicate was enough to abort the
		// download. Pressing again now stages nothing, and says why.
		const save = fixture("save.save");
		const first = await pressCheatSet(save, [], STORAGE);
		expect(first.planned.length).toBe(cheatGearSet.length);
		expect(first.skipped).toEqual([]);

		const second = await pressCheatSet(save, first.planned, STORAGE);
		expect(second.planned, "a second press adds nothing").toEqual(
			first.planned,
		);
		expect(second.skipped).toHaveLength(cheatGearSet.length);
		for (const skip of second.skipped) {
			expect(skip.wasStaged, `${skip.label} was already staged`).toBe(true);
			expect(skip.existing).toBe(false);
			expect(skip.reason).toBe("already staged for Character Inventory");
		}
		// No item key is staged twice, which is what the engine refuses.
		const keys = insertedKeys(first.planned);
		expect(new Set(keys).size).toBe(keys.length);

		// And the single copy of the set really does apply.
		const before = await describeInventory(await opened(save));
		const after = await describeInventory(
			await opened(await apply(save, first.planned)),
		);
		expect(after.records.length).toBe(
			before.records.length + first.planned.length,
		);
	});

	test("an item staged by hand is not queued a second time either", async () => {
		// The staged guard counts every insertion family, so a record the user
		// added through the equipment browser is as protected as one the button
		// staged itself.
		const save = fixture("save.save");
		const catalog = { items: await mergedCatalog() };
		const before = await describeInventory(await opened(save));
		const handStaged = cheatGearSet[0];
		if (!handStaged) throw new Error("the set is empty");
		const { edits, skipped } = await cheatGearEdits({
			inventoryKey: STORAGE,
			records: before.records,
			catalog,
			staged: [
				{
					type: "insertEquipment",
					inventoryKey: STORAGE,
					itemKey: handStaged.itemKey,
					itemName: handStaged.label,
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
				},
			],
		});

		expect(insertedKeys(edits)).not.toContain(handStaged.itemKey);
		expect(skipped).toEqual([
			{
				label: handStaged.label,
				reason: "already staged for Character Inventory",
				existing: false,
				wasStaged: true,
			},
		]);
		expect(edits.length).toBe(cheatGearSet.length - 1);
	});

	test("a set staged into another storage is not in the way", async () => {
		// Membership is per storage: the same item can perfectly well be queued
		// for a different one, and the guard has to leave that alone.
		const save = fixture("save.save");
		const { records } = await describeInventory(await opened(save));
		const catalog = { items: await mergedCatalog() };
		const intoWarehouse = await cheatGearEdits({
			inventoryKey: WAREHOUSE,
			records,
			catalog,
		});
		const intoInventory = await cheatGearEdits({
			inventoryKey: STORAGE,
			records,
			catalog,
			staged: intoWarehouse.edits,
		});
		// The warehouse's insertions do not count against the character
		// inventory, so the set can be staged into both.
		expect(intoInventory.skipped.filter((skip) => skip.wasStaged)).toEqual([]);
		expect(intoInventory.edits.length).toBeGreaterThan(0);
	});
});
