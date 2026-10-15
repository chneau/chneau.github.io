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

const STORAGE = 2;

const WAREHOUSE = 8;

const ENDGAME_TIMEOUT = 60_000;

const HELD_EARRING = 8504;

const apply = async (source: Uint8Array, edits: SaveEdit[]) => {
	let current = source;
	for (const run of planSaveEdits(edits)) {
		const [next] = await run.run(current, async () => {});
		current = next;
	}
	return current;
};

const insertedKeys = (edits: SaveEdit[]): number[] =>
	edits.flatMap((edit) => ("itemKey" in edit ? [edit.itemKey] : []));

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

	test(
		"the engine applies the whole set to a real save",
		async () => {
			const save = fixture("save.save");
			const merged = await mergedCatalog();
			const before = await describeInventory(await opened(save));
			const { edits, skipped } = await cheatGearEdits({
				inventoryKey: STORAGE,
				records: before.records,
				catalog: { items: merged },
			});
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
			const signature = (record: (typeof after.records)[number]) =>
				`${record.inventoryKey}:${record.itemNo}:${record.itemKey}:${record.slotNo}:${record.quantity}`;
			const afterSignatures = new Set(after.records.map(signature));
			for (const record of before.records) {
				expect(afterSignatures.has(signature(record)), signature(record)).toBe(
					true,
				);
			}
		},
		ENDGAME_TIMEOUT,
	);
});

describe("the cheat set against a save that is not empty", () => {
	test(
		"an item the storage already holds is skipped, and the rest still apply",
		async () => {
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
			expect(insertedKeys(edits)).not.toContain(HELD_EARRING);

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

	test(
		"pressing the button twice stages the set once",
		async () => {
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
			const keys = insertedKeys(first.planned);
			expect(new Set(keys).size).toBe(keys.length);

			const before = await describeInventory(await opened(save));
			const after = await describeInventory(
				await opened(await apply(save, first.planned)),
			);
			expect(after.records.length).toBe(
				before.records.length + first.planned.length,
			);
		},
		ENDGAME_TIMEOUT,
	);

	test("an item staged by hand is not queued a second time either", async () => {
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
		expect(intoInventory.skipped.filter((skip) => skip.wasStaged)).toEqual([]);
		expect(intoInventory.edits.length).toBeGreaterThan(0);
	});
});
