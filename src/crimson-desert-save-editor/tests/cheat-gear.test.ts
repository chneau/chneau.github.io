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
import { fixture, mergedCatalog, opened } from "./fixtures";

/** The storage the set is staged into; the fixture's character inventory. */
const STORAGE = 2;

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
