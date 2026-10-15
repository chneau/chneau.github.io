import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canSocketGear } from "../lib/abyss-gear";
import type { EquipmentDetails } from "../lib/equipment";
import { maxEquipmentEdits } from "../lib/max-equipment";
import {
	applyEquipmentChange,
	describeInventory,
	type InventoryDescription,
} from "../lib/save-engine/browser-equipment";
import { type DecodedSave, decodeSave } from "../lib/save-engine/container";
import { abyssGearRulesTable } from "../lib/save-engine/data";
import { defined } from "../lib/save-engine/defined";

const root = join(import.meta.dir, "..");
const fixture = (name: string): Uint8Array =>
	new Uint8Array(readFileSync(join(root, "saves", name)));

const endgame = fixture("endgame.save");

const openedFixtures = new Map<Uint8Array, Promise<DecodedSave>>();
const opened = (bytes: Uint8Array): Promise<DecodedSave> => {
	let decoded = openedFixtures.get(bytes);
	if (decoded === undefined) {
		decoded = decodeSave(bytes);
		openedFixtures.set(bytes, decoded);
	}
	return decoded;
};

const keyOf = (record: {
	inventoryKey: number;
	slotNo: number;
	itemKey: number;
}): string => `${record.inventoryKey}:${record.slotNo}:${record.itemKey}`;

const byKey = (records: InventoryDescription["records"]) =>
	new Map(records.map((record) => [keyOf(record), record]));

const equipmentStorages = (before: InventoryDescription): number[] => [
	...new Set(
		before.records
			.filter((record) => record.equipment !== null)
			.map((record) => record.inventoryKey),
	),
];

const ceiling = (equipment: EquipmentDetails): number =>
	equipment.canRefine && equipment.refinementLevels.length > 0
		? Math.min(10, Math.max(...equipment.refinementLevels))
		: equipment.refinement;

const tier = (internalName: string): number => {
	const level = /_LV(\d+)$/.exec(internalName)?.[1];
	return level === undefined ? Number.POSITIVE_INFINITY : Number(level);
};

type Rules = Awaited<ReturnType<typeof abyssGearRulesTable>>;

const familyOf = (rules: Rules, gearKey: number): string =>
	defined(rules.gear[String(gearKey)], "gear").internalName.replace(
		/_(LV\d+|Special)$/i,
		"",
	);

const tierOf = (rules: Rules, gearKey: number): number => {
	const internalName = defined(
		rules.gear[String(gearKey)],
		"gear",
	).internalName;
	const level = /_LV(\d+)$/.exec(internalName)?.[1];
	return level === undefined ? 1000 : Number(level);
};

const bestTierOf = (rules: Rules, gearKey: number): number => {
	const family = familyOf(rules, gearKey);
	return Object.keys(rules.gear)
		.map(Number)
		.filter((key) => familyOf(rules, key) === family)
		.reduce((best, key) => Math.max(best, tierOf(rules, key)), 0);
};

describe("max equipment", () => {
	test("stages only changes inside each item's own limits", async () => {
		const rules = await abyssGearRulesTable();
		const before = await describeInventory(await opened(endgame));
		const original = byKey(before.records);
		let staged = 0;

		for (const inventoryKey of equipmentStorages(before)) {
			const { edits } = maxEquipmentEdits({
				records: before.records,
				inventoryKey,
				rules,
			});
			for (const edit of edits) {
				staged += 1;
				const equipment = defined(
					defined(original.get(keyOf(edit)), "original record").equipment ??
						undefined,
					"equipment",
				);
				const current = equipment.socketItems;

				expect(edit.refinement).toBe(ceiling(equipment));

				if (equipment.socketCap === null || equipment.socketCap === 0) {
					expect(edit.unlockedSockets).toBe(equipment.unlockedSockets);
					expect(edit.socketItems).toEqual(current);
				} else {
					const untouched =
						edit.unlockedSockets === equipment.unlockedSockets &&
						edit.socketItems.every(
							(gearKey, index) => gearKey === (current[index] ?? null),
						);
					if (!untouched) {
						expect(edit.unlockedSockets).toBe(
							Math.min(
								5,
								Math.max(equipment.unlockedSockets, equipment.socketCap),
							),
						);
					}
				}
				expect(edit.socketItems).toHaveLength(5);

				const fitted = edit.socketItems.filter(
					(gearKey): gearKey is number => gearKey !== null,
				);
				for (const gearKey of fitted) {
					expect(canSocketGear(rules, edit.itemKey, gearKey)).toBe(true);
				}
				edit.socketItems.forEach((gearKey, index) => {
					const socketed = current[index] ?? null;
					if (socketed !== null) expect(gearKey).not.toBeNull();
					if (index >= edit.unlockedSockets) expect(gearKey).toBe(socketed);
					if (gearKey === null) return;
					const twin = edit.socketItems.indexOf(gearKey);
					if (twin === index) return;
					const restaged = (position: number): boolean =>
						edit.socketItems[position] !== (current[position] ?? null);
					expect(restaged(index)).toBe(restaged(twin));
				});

				const changed =
					edit.refinement !== equipment.refinement ||
					edit.unlockedSockets !== equipment.unlockedSockets ||
					edit.socketItems.some(
						(gearKey, index) => gearKey !== (current[index] ?? null),
					);
				expect(changed).toBe(true);
			}
		}

		expect(staged).toBeGreaterThan(0);
	});

	test("upgrades a held tier and fills the rest with the strongest", async () => {
		const rules = await abyssGearRulesTable();
		const before = await describeInventory(await opened(endgame));
		const original = byKey(before.records);
		let filled = 0;
		let upgraded = 0;
		let untouched = 0;

		for (const inventoryKey of equipmentStorages(before)) {
			const { edits } = maxEquipmentEdits({
				records: before.records,
				inventoryKey,
				rules,
			});
			for (const edit of edits) {
				const equipment = defined(
					defined(original.get(keyOf(edit)), "record").equipment ?? undefined,
					"equipment",
				);
				const current = equipment.socketItems;

				for (let index = 0; index < edit.unlockedSockets; index++) {
					const socketed = current[index] ?? null;
					if (
						socketed === null ||
						!canSocketGear(rules, edit.itemKey, socketed)
					) {
						continue;
					}
					const planned = edit.socketItems[index] ?? null;
					if (planned === socketed) {
						untouched += 1;
						continue;
					}
					upgraded += 1;
					expect(planned).not.toBeNull();
					expect(familyOf(rules, planned as number)).toBe(
						familyOf(rules, socketed),
					);
					expect(tierOf(rules, planned as number)).toBeGreaterThan(
						tierOf(rules, socketed),
					);
				}

				const roomToFill = Array.from(
					{ length: edit.unlockedSockets },
					(_, index) => index,
				).filter((index) => {
					const socketed = current[index] ?? null;
					return (
						socketed === null || !canSocketGear(rules, edit.itemKey, socketed)
					);
				});
				if (roomToFill.length > 0) {
					for (const index of roomToFill) {
						const planned = edit.socketItems[index] ?? null;
						if (planned === null) continue;
						expect(canSocketGear(rules, edit.itemKey, planned)).toBe(true);
						expect(tierOf(rules, planned)).toBe(bestTierOf(rules, planned));
					}
					filled += 1;
				}
			}
		}

		expect(untouched).toBeGreaterThan(0);
		expect(upgraded).toBeGreaterThan(0);
		expect(filled).toBeGreaterThan(0);
	}, 60_000);

	test("the engine takes the plan for a whole storage", async () => {
		const rules = await abyssGearRulesTable();
		const before = await describeInventory(await opened(endgame));
		const [chosen] = equipmentStorages(before)
			.map((inventoryKey) => ({
				inventoryKey,
				plan: maxEquipmentEdits({
					records: before.records,
					inventoryKey,
					rules,
				}),
			}))
			.filter((entry) => entry.plan.edits.length > 0)
			.sort((left, right) => left.plan.edits.length - right.plan.edits.length);
		const storage = defined(chosen, "storage with equipment to raise");

		let bytes = endgame;
		for (const edit of storage.plan.edits) {
			[bytes] = await applyEquipmentChange(bytes, edit);
		}

		const after = await describeInventory(await opened(bytes));
		expect(after.records.length).toBe(before.records.length);
		const landed = byKey(after.records);
		for (const edit of storage.plan.edits) {
			const equipment = defined(
				defined(landed.get(keyOf(edit)), "record").equipment ?? undefined,
				"equipment",
			);
			expect(equipment.refinement).toBe(edit.refinement);
			expect(equipment.unlockedSockets).toBe(edit.unlockedSockets);
			expect(equipment.socketItems).toEqual(edit.socketItems);
		}

		const again = maxEquipmentEdits({
			records: after.records,
			inventoryKey: storage.inventoryKey,
			rules,
		});
		expect(again.edits).toEqual([]);
	}, 120_000);

	test("leaves sockets alone when the item's cap or equip type is unknown", async () => {
		const rules = await abyssGearRulesTable();
		const known = {
			inventoryKey: 2,
			itemNo: 1,
			itemKey: 14510,
			slotNo: 0,
			quantity: 1,
			socketCount: 1,
			filledSockets: 1,
			equipment: {
				refinement: 0,
				canRefine: true,
				refinementLevels: [0, 1, 10],
				unlockedSockets: 1,
				socketCap: null,
				socketItems: [1002785, null, null, null, null],
			},
		};
		const { edits } = maxEquipmentEdits({
			records: [known],
			inventoryKey: 2,
			rules,
		});
		expect(edits).toHaveLength(1);
		expect(edits[0]?.refinement).toBe(10);
		expect(edits[0]?.unlockedSockets).toBe(1);
		expect(edits[0]?.socketItems).toEqual([1002785, null, null, null, null]);

		const unknown = {
			...known,
			itemKey: 999_999_999,
			equipment: { ...known.equipment, socketCap: 1 },
		};
		expect(
			maxEquipmentEdits({ records: [unknown], inventoryKey: 2, rules }).edits,
		).toEqual([]);
	});
});

describe("randomized sockets", () => {
	const bestTiers = async (): Promise<Map<string, number>> => {
		const rules = await abyssGearRulesTable();
		const best = new Map<string, number>();
		for (const entry of Object.values(rules.gear)) {
			const family = entry.internalName.replace(/_(LV\d+|Special)$/i, "");
			best.set(
				family,
				Math.max(best.get(family) ?? 0, tier(entry.internalName)),
			);
		}
		return best;
	};

	test("never sockets a family's lower tier unless it already held it twice", async () => {
		const rules = await abyssGearRulesTable();
		const best = await bestTiers();
		const before = await describeInventory(await opened(endgame));
		const original = byKey(before.records);
		let planned = 0;
		let higherTierFamilies = 0;
		let unexplained = 0;

		for (const inventoryKey of equipmentStorages(before)) {
			let seed = 7;
			const { edits } = maxEquipmentEdits({
				records: before.records,
				inventoryKey,
				rules,
				gear: "random",
				random: () => {
					seed = (seed * 1103515245 + 12345) % 2147483648;
					return seed / 2147483648;
				},
			});
			for (const edit of edits) {
				planned += 1;
				const current =
					defined(original.get(keyOf(edit)), "record").equipment?.socketItems ??
					[];
				const socketsUntouched = edit.socketItems.every(
					(gearKey, index) => gearKey === (current[index] ?? null),
				);
				if (socketsUntouched) continue;
				edit.socketItems.forEach((gearKey, index) => {
					if (gearKey === null) return;
					const member = defined(rules.gear[String(gearKey)], "gear");
					const family = member.internalName.replace(/_(LV\d+|Special)$/i, "");
					const reached = best.get(family) ?? 0;
					const reachedNorm =
						reached === Number.POSITIVE_INFINITY ? 1000 : reached;
					const socketedNorm = tierOf(rules, gearKey);
					if (socketedNorm >= reachedNorm) {
						if (reachedNorm === 1000 || reachedNorm > 1) {
							higherTierFamilies += 1;
						}
						return;
					}
					const sameFamilyHeld = current.filter(
						(held, position) =>
							held !== null &&
							position !== index &&
							familyOf(rules, held) === family,
					).length;
					if (sameFamilyHeld === 0) unexplained += 1;
				});
			}
		}

		expect(planned).toBeGreaterThan(0);
		expect(higherTierFamilies).toBeGreaterThan(0);
		expect(unexplained).toBe(0);
	}, 60_000);

	test("random picks stay compatible, distinct and engine-valid", async () => {
		const rules = await abyssGearRulesTable();
		const before = await describeInventory(await opened(endgame));
		const original = byKey(before.records);
		let checked = 0;

		const storages = equipmentStorages(before);
		for (const inventoryKey of storages) {
			let seed = 42;
			const { edits } = maxEquipmentEdits({
				records: before.records,
				inventoryKey,
				rules,
				gear: "random",
				random: () => {
					seed = (seed * 1103515245 + 12345) % 2147483648;
					return seed / 2147483648;
				},
			});
			for (const edit of edits) {
				checked += 1;
				const current =
					defined(original.get(keyOf(edit)), "record").equipment?.socketItems ??
					[];
				const fitted = edit.socketItems.filter(
					(gearKey): gearKey is number => gearKey !== null,
				);
				for (const gearKey of fitted) {
					expect(canSocketGear(rules, edit.itemKey, gearKey)).toBe(true);
				}
				edit.socketItems.forEach((gearKey, index) => {
					const socketed = current[index] ?? null;
					if (socketed !== null) expect(gearKey).not.toBeNull();
					if (gearKey !== null && edit.socketItems.indexOf(gearKey) !== index) {
						expect(socketed).toBe(gearKey);
					}
				});
			}
		}

		expect(checked).toBeGreaterThan(0);

		const smallest = storages
			.map((inventoryKey) => {
				let seed = 5;
				return {
					edits: maxEquipmentEdits({
						records: before.records,
						inventoryKey,
						rules,
						gear: "random",
						random: () => {
							seed = (seed * 1103515245 + 12345) % 2147483648;
							return seed / 2147483648;
						},
					}).edits,
				};
			})
			.filter((entry) => entry.edits.length > 0)
			.sort((left, right) => left.edits.length - right.edits.length)[0];
		const plan = defined(smallest, "storage with equipment to randomize");
		let bytes: Uint8Array = endgame;
		for (const edit of plan.edits) {
			[bytes] = await applyEquipmentChange(bytes, edit);
		}
		const after = await describeInventory(await opened(bytes));
		const landed = byKey(after.records);
		for (const edit of plan.edits) {
			const equipment = defined(
				defined(landed.get(keyOf(edit)), "record").equipment ?? undefined,
				"equipment",
			);
			expect(equipment.socketItems).toEqual(edit.socketItems);
			expect(equipment.unlockedSockets).toBe(edit.unlockedSockets);
			expect(equipment.refinement).toBe(edit.refinement);
		}
	}, 180_000);

	test("random output varies with the generator", async () => {
		const rules = await abyssGearRulesTable();
		const before = await describeInventory(await opened(endgame));
		const staged = (seed: number) => {
			let state = seed;
			return maxEquipmentEdits({
				records: before.records,
				inventoryKey: 8,
				rules,
				gear: "random",
				random: () => {
					state = (state * 1103515245 + 12345) % 2147483648;
					return state / 2147483648;
				},
			}).edits;
		};
		const first = JSON.stringify(staged(1).map((edit) => edit.socketItems));
		const second = JSON.stringify(staged(99).map((edit) => edit.socketItems));
		expect(first).not.toBe(second);

		const strongest = JSON.stringify(
			maxEquipmentEdits({ records: before.records, inventoryKey: 8, rules })
				.edits,
		);
		const strongestAgain = JSON.stringify(
			maxEquipmentEdits({ records: before.records, inventoryKey: 8, rules })
				.edits,
		);
		expect(strongest).toBe(strongestAgain);
	}, 60_000);

	test("rerolls every unlocked socket, not just the empty ones", async () => {
		const rules = await abyssGearRulesTable();
		const before = await describeInventory(await opened(endgame));
		const original = byKey(before.records);
		let socketsRerolled = 0;
		let filledSockets = 0;
		let heldSockets = 0;

		for (const inventoryKey of equipmentStorages(before)) {
			let seed = 11;
			const { edits } = maxEquipmentEdits({
				records: before.records,
				inventoryKey,
				rules,
				gear: "random",
				random: () => {
					seed = (seed * 1103515245 + 12345) % 2147483648;
					return seed / 2147483648;
				},
			});
			for (const edit of edits) {
				const equipment = defined(
					defined(original.get(keyOf(edit)), "record").equipment ?? undefined,
					"equipment",
				);
				const current = equipment.socketItems;
				for (let index = 0; index < edit.unlockedSockets; index++) {
					filledSockets += 1;
					if (edit.socketItems[index] === null) {
						expect(current[index] ?? null).toBeNull();
					}
					if (current[index] !== null) {
						heldSockets += 1;
						if (edit.socketItems[index] !== current[index]) {
							socketsRerolled += 1;
						}
					}
				}
			}
		}

		expect(heldSockets).toBeGreaterThan(0);
		expect(socketsRerolled).toBeGreaterThan(0);
		expect(filledSockets).toBeGreaterThan(socketsRerolled);
	}, 60_000);

	test("a randomized plan fills every socket the item has", async () => {
		const rules = await abyssGearRulesTable();
		const before = await describeInventory(await opened(endgame));

		for (const inventoryKey of equipmentStorages(before)) {
			let seed = 5;
			const { edits } = maxEquipmentEdits({
				records: before.records,
				inventoryKey,
				rules,
				gear: "random",
				random: () => {
					seed = (seed * 1103515245 + 12345) % 2147483648;
					return seed / 2147483648;
				},
			});
			for (const edit of edits) {
				const held = edit.socketItems
					.slice(0, edit.unlockedSockets)
					.filter((gearKey) => gearKey !== null);
				expect(held.length).toBe(edit.unlockedSockets);
			}
		}
	}, 60_000);

	test("a randomized plan survives the engine", async () => {
		const rules = await abyssGearRulesTable();
		const before = await describeInventory(await opened(endgame));
		const smallest = equipmentStorages(before)
			.map((inventoryKey) => {
				let seed = 17;
				return {
					inventoryKey,
					edits: maxEquipmentEdits({
						records: before.records,
						inventoryKey,
						rules,
						gear: "random",
						random: () => {
							seed = (seed * 1103515245 + 12345) % 2147483648;
							return seed / 2147483648;
						},
					}).edits,
				};
			})
			.filter((entry) => entry.edits.length > 0)
			.sort((left, right) => left.edits.length - right.edits.length)[0];
		const plan = defined(smallest, "storage with sockets to reroll");

		let bytes: Uint8Array = endgame;
		for (const edit of plan.edits) {
			[bytes] = await applyEquipmentChange(bytes, edit);
		}
		const after = await describeInventory(await opened(bytes));
		expect(after.records.length).toBe(before.records.length);
		const landed = byKey(after.records);
		for (const edit of plan.edits) {
			const equipment = defined(
				defined(landed.get(keyOf(edit)), "record").equipment ?? undefined,
				"equipment",
			);
			expect(equipment.socketItems).toEqual(edit.socketItems);
			expect(equipment.unlockedSockets).toBe(edit.unlockedSockets);
			expect(equipment.refinement).toBe(edit.refinement);
		}
	}, 180_000);
});
