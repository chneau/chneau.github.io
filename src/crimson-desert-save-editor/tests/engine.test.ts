/**
 * Fixture tests for the save engine.
 *
 * These run against the two committed saves in `saves/`. Every edit is checked
 * by re-reading the output rather than by comparing golden bytes: the container
 * is re-encrypted on write, so the plaintext is the only meaningful contract.
 *
 * Run with `bun test` (or `bun run check:test`, the same command with the
 * repository's parallel and timeout settings).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	describeInventory,
	type InventoryDescription,
} from "../lib/save-engine/browser-equipment";
import { applySkills, describeSkills } from "../lib/save-engine/browser-skills";
import { readU16, readU32, writeU16, writeU32 } from "../lib/save-engine/bytes";
import {
	equipmentCatalog,
	insertCatalogEquipment,
	insertCatalogItem,
} from "../lib/save-engine/catalog-equipment";
import {
	applyCharacterEdit,
	applyCharacterPreset,
	type CharacterEntry,
	describeCharacters,
} from "../lib/save-engine/characters";
import {
	applyCompanionRename,
	describeCompanionNames,
} from "../lib/save-engine/companion-names";
import {
	applyCompanionAdditions,
	describeCompanions,
} from "../lib/save-engine/companions";
import type { DecodedSave } from "../lib/save-engine/container";
import { decodeSave, encodeSave } from "../lib/save-engine/container";
import {
	type AbyssGearRulesFile,
	abyssGearRulesTable,
} from "../lib/save-engine/data";
import { defined } from "../lib/save-engine/defined";
import {
	insertDonorEquipmentIntoInventory,
	RUNTIME_RESTRICTED_EQUIPMENT,
} from "../lib/save-engine/donor-equipment-inserter";
import { applyDyeEdit, describeDyes } from "../lib/save-engine/dyes";
import { planSaveEdits, type SaveEdit } from "../lib/save-engine/edits";
import {
	type EquipmentTarget,
	editEnchantLevel,
	editValidSocketCount,
	fillEmptySocket,
	replaceSocketItem,
} from "../lib/save-engine/equipment-editor";
import { readEquipmentLayout } from "../lib/save-engine/equipment-loadout";
import { editInventoryQuantities } from "../lib/save-engine/inventory-editor";
import { insertInventoryItem } from "../lib/save-engine/inventory-inserter";
import {
	findInventoryRecord,
	readInventory,
} from "../lib/save-engine/inventory-reader";
import {
	applyItemCondition,
	describeItemConditions,
} from "../lib/save-engine/item-condition";
import { applyKnowledgeChange } from "../lib/save-engine/knowledge-bulk";
import { readKnowledge } from "../lib/save-engine/knowledge-reader";
import { readRoot } from "../lib/save-engine/object-walk";
import {
	applyQuestEdit,
	applyQuestPreset,
	describeQuests,
	questAvailableState,
	questCompletedState,
} from "../lib/save-engine/quests";
import { assertOnlyChanged } from "../lib/save-engine/raw-diff";
import {
	insertRootFields,
	scalarBytes,
} from "../lib/save-engine/record-field-insert";
import { defaultSocketCaps } from "../lib/save-engine/socket-caps";

const root = join(import.meta.dir, "..");
const fixture = (name: string): Uint8Array =>
	new Uint8Array(readFileSync(join(root, "saves", name)));

const save = fixture("save.save");
const endgame = fixture("endgame.save");

const withSave = async <T>(bytes: Uint8Array, use: (raw: Uint8Array) => T) =>
	use((await decodeSave(bytes)).rawPayload);

/**
 * Fixture reads are memoized by fixture identity: the container decode and
 * the per-feature parses are pure, so every test that only inspects a fixture
 * shares one decode instead of paying it again. Edit outputs are always
 * freshly decoded through `withSave` and are never passed to these helpers.
 */
const openedFixtures = new Map<Uint8Array, Promise<DecodedSave>>();
/** Decodes a fixture once: the decode is pure, so every reader shares it. */
const opened = (fixture: Uint8Array): Promise<DecodedSave> => {
	let decoded = openedFixtures.get(fixture);
	if (decoded === undefined) {
		decoded = decodeSave(fixture);
		openedFixtures.set(fixture, decoded);
	}
	return decoded;
};

const cachedRaw = async (fixture: Uint8Array): Promise<Uint8Array> =>
	(await opened(fixture)).rawPayload;

/** Memoizes a pure `(save) => …` reader by the fixture it was opened from. */
const perFixture = <D>(read: (save: DecodedSave) => Promise<D>) => {
	const memo = new Map<Uint8Array, Promise<D>>();
	return (fixture: Uint8Array): Promise<D> => {
		let result = memo.get(fixture);
		if (result === undefined) {
			result = opened(fixture).then((save) => read(save));
			memo.set(fixture, result);
		}
		return result;
	};
};

const describeSavedInventory = perFixture(describeInventory);
const describeSavedSkills = perFixture(describeSkills);
const describeSavedCompanions = perFixture(describeCompanions);
const describeSavedItemConditions = perFixture(describeItemConditions);
const describeSavedDyes = perFixture(describeDyes);
const describeSavedCharacters = perFixture(describeCharacters);
const describeSavedQuests = perFixture(describeQuests);
const describeSavedCompanionNames = perFixture(describeCompanionNames);
const fixtureInventory = perFixture(async (save) =>
	readInventory(save.rawPayload),
);
const fixtureKnowledge = perFixture(async (save) =>
	readKnowledge(save.rawPayload),
);

describe("bytes", () => {
	test("scalars round-trip", () => {
		const buffer = new Uint8Array(8);
		writeU16(buffer, 1, 0xbeef);
		writeU32(buffer, 3, 0xdeadbeef);
		expect(readU16(buffer, 1)).toBe(0xbeef);
		expect(readU32(buffer, 3)).toBe(0xdeadbeef);
	});
});

describe("raw-diff", () => {
	const range = (start: number, size: number) => ({ start, size });

	test("returns the offsets a local edit changed", () => {
		const before = new Uint8Array([1, 2, 3, 4]);
		const after = new Uint8Array([1, 2, 9, 4]);
		expect(
			assertOnlyChanged(before, after, [range(2, 1)], "Byte edit"),
		).toEqual([2]);
	});

	test("accepts changes spread across several ranges", () => {
		const before = new Uint8Array(8);
		const after = new Uint8Array(8);
		after[1] = 1;
		after[6] = 1;
		expect(
			assertOnlyChanged(
				before,
				after,
				[range(0, 2), range(6, 2)],
				"Batch edit",
			),
		).toEqual([1, 6]);
	});

	test("refuses a change outside the declared ranges", () => {
		const before = new Uint8Array([0, 0, 0, 0]);
		const after = new Uint8Array([0, 0, 1, 0]);
		expect(() =>
			assertOnlyChanged(before, after, [range(0, 1)], "Socket-count edit"),
		).toThrow(/Socket-count edit changed byte 2/);
	});

	test("refuses an edit that resized the payload", () => {
		expect(() =>
			assertOnlyChanged(
				new Uint8Array(4),
				new Uint8Array(5),
				[range(0, 4)],
				"Scalar edit",
			),
		).toThrow(/must not change the raw payload size/);
	});

	test("refuses an edit that changed nothing", () => {
		const bytes = new Uint8Array([7, 7]);
		expect(() =>
			assertOnlyChanged(bytes, bytes.slice(), [range(0, 2)], "Refinement edit"),
		).toThrow(/did not change any bytes/);
	});
});

describe("container", () => {
	test("the fixture decodes and re-encodes to the same payload", async () => {
		const decoded = await decodeSave(save);
		const output = await encodeSave(decoded.rawPayload, decoded.header);
		const reopened = await decodeSave(output);
		expect(reopened.rawPayload).toEqual(decoded.rawPayload);
		expect(reopened.header.version).toBe(decoded.header.version);
	});

	test("the endgame fixture decodes too", async () => {
		const decoded = await decodeSave(endgame);
		expect(decoded.rawPayload.length).toBeGreaterThan(1_000_000);
	});
});

describe("inventory", () => {
	test("reads every inventory record in the fixture", async () => {
		const records = await fixtureInventory(save);
		expect(records.length).toBe(541);
		for (const record of records) {
			expect(Number.isInteger(record.itemKey)).toBe(true);
			expect(record.inventoryKey).toBeGreaterThan(0);
		}
	});

	test("findInventoryRecord pins a target to exactly one record", async () => {
		const records = await fixtureInventory(save);
		const target = defined(records[0], "first inventory record");
		const address = {
			inventoryKey: target.inventoryKey,
			slotNo: target.slotNo,
			itemKey: target.itemKey,
		};
		expect(findInventoryRecord(records, address)).toBe(target);
		// The same record twice stands in for a genuinely ambiguous target.
		expect(() => findInventoryRecord([...records, target], address)).toThrow(
			/found 2/,
		);
		expect(() =>
			findInventoryRecord(records, { ...address, itemKey: 999_999_999 }),
		).toThrow(/found 0/);
	});

	test("groups records per storage and reports equipment", async () => {
		const description = await describeSavedInventory(save);
		expect(description.records.length).toBe(541);
		expect(description.containerVersion).toBeGreaterThan(0);
		const equipment = description.records.filter((record) => record.equipment);
		expect(equipment.length).toBeGreaterThan(0);
		for (const record of equipment) {
			expect(record.equipment?.refinement).toBeGreaterThanOrEqual(0);
		}
	});

	test("a quantity edit changes only that stack-count field", async () => {
		const records = await fixtureInventory(save);
		const target = records.find((record) => record.stackCount > 1);
		expect(target).toBeDefined();
		if (!target) return;
		const next = target.stackCount + 7;
		const [output, audits] = await editInventoryQuantities(save, [
			[
				{
					inventoryKey: target.inventoryKey,
					slotNo: target.slotNo,
					itemKey: target.itemKey,
				},
				target.stackCount,
				next,
			],
		]);
		const audit = audits[0];
		expect(audit?.output_reopened).toBe(true);
		expect(audit?.raw_payload_reopened_identically).toBe(true);
		const before = await fixtureInventory(save);
		const after = await withSave(output, readInventory);
		expect(after.length).toBe(before.length);
		const changed = after.filter((record, index) => {
			const previous = before[index];
			return previous && record.stackCount !== previous.stackCount;
		});
		expect(changed.length).toBe(1);
		expect(changed[0]?.stackCount).toBe(next);
		expect(changed[0]?.itemKey).toBe(target.itemKey);
	});

	test("refuses an edit whose expected quantity does not match", async () => {
		const records = await fixtureInventory(save);
		const target = records.find((record) => record.stackCount > 1);
		expect(target).toBeDefined();
		if (!target) return;
		await expect(
			editInventoryQuantities(save, [
				[
					{
						inventoryKey: target.inventoryKey,
						slotNo: target.slotNo,
						itemKey: target.itemKey,
					},
					target.stackCount + 1,
					target.stackCount + 2,
				],
			]),
		).rejects.toThrow(/Expected current quantity/);
	});

	test("inserts one stackable item", async () => {
		const records = await fixtureInventory(save);
		const template = records.find((record) => record.stackCount > 1);
		expect(template).toBeDefined();
		if (!template) return;
		const present = new Set(
			records
				.filter((record) => record.inventoryKey === template.inventoryKey)
				.map((record) => record.itemKey),
		);
		const newItemKey = [50001, 50002, 50003, 50004, 50005].find(
			(key) => !present.has(key),
		);
		expect(newItemKey).toBeDefined();
		if (newItemKey === undefined) return;
		const [output, audit] = await insertInventoryItem(save, {
			inventoryKey: template.inventoryKey,
			templateItemKey: template.itemKey,
			newItemKey,
			quantity: 3,
		});
		expect(audit.new_item_key).toBe(newItemKey);
		expect(audit.inventory_count_after).toBe(records.length + 1);
		expect(audit.preexisting_records_preserved).toBe(true);
		const after = await withSave(output, readInventory);
		expect(after.length).toBe(records.length + 1);
		const added = after.find(
			(record) =>
				record.itemKey === newItemKey &&
				record.inventoryKey === template.inventoryKey,
		);
		expect(added?.stackCount).toBe(3);
	});
});

describe("knowledge and skills", () => {
	test("describes the skill entries behind the tree", async () => {
		const skills = await describeSavedSkills(save);
		expect(skills.error).toBeNull();
		expect(skills.skillTotal).toBe(221);
		expect(skills.entries.length).toBe(221);
		expect(skills.entries.every((entry) => entry.key > 0)).toBe(true);
		for (const mode of ["skills", "knowledge", "stats"] as const) {
			expect(skills.modes[mode].mode).toBe(mode);
			expect(skills.modes[mode].targets).toBeGreaterThan(0);
		}
	});

	test("unlocking the skill tree learns the entries at reference level", async () => {
		const before = await fixtureKnowledge(save);
		const [output, audit] = await applySkills(save, { mode: "skills" });
		expect(audit.mode).toBe("skills");
		expect(audit.keys_before).toBe(before.length);
		expect(Number(audit.keys_after)).toBeGreaterThan(before.length);
		const after = await withSave(output, readKnowledge);
		const levels = new Map(after.map((record) => [record.key, record.level]));
		const description = await describeSavedSkills(save);
		let checked = 0;
		for (const entry of description.entries) {
			if (entry.referenceLevel === null) continue;
			expect(levels.get(entry.key)).toBe(entry.referenceLevel);
			checked += 1;
		}
		expect(checked).toBeGreaterThan(200);
		// Unrelated knowledge is untouched by this mode.
		const beforeLevels = new Map(
			before.map((record) => [record.key, record.level]),
		);
		for (const record of after) {
			const original = beforeLevels.get(record.key);
			if (original === undefined) continue;
			const entry = description.entries.find(
				(candidate) => candidate.key === record.key,
			);
			if (entry) continue;
			expect(record.level).toBe(original);
		}
	});

	test("a no-op knowledge change returns the source bytes untouched", async () => {
		const [output, audit] = await applyKnowledgeChange(save, { targets: [] });
		expect(audit.changed).toBe(false);
		expect(output).toBe(save);
	});
});

describe("companions", () => {
	test("describes the roster", async () => {
		const roster = await describeSavedCompanions(save);
		expect(roster.error).toBeNull();
		expect(roster.records.length).toBeGreaterThan(0);
		for (const record of roster.records) {
			expect(record.characterKey).toBeGreaterThan(0);
			expect(typeof record.selected).toBe("boolean");
		}
	});

	test("adds one unequipped pet", async () => {
		const catalog = (await import("../lib/generated/companion-catalog.json"))
			.default as { entries: Record<string, { category: string }> };
		const roster = await describeSavedCompanions(save);
		const pet = roster.availableKeys.find(
			(key) => catalog.entries[String(key)]?.category === "pets",
		);
		expect(pet).toBeDefined();
		if (pet === undefined) return;
		const [output, audit] = await applyCompanionAdditions(save, [
			{ type: "addCompanion", characterKey: pet },
		]);
		expect(audit.addedCompanions).toBe(1);
		const after = await describeCompanions(await opened(output));
		expect(after.records.length).toBe(roster.records.length + 1);
		expect(after.records.some((record) => record.characterKey === pet)).toBe(
			true,
		);
	});

	test("endgame saves list their roster but offer no additions", async () => {
		const roster = await describeSavedCompanions(endgame);
		expect(roster.error).toBeNull();
		expect(roster.records.length).toBe(246);
		// No template matches that save's format, so nothing is offered...
		expect(roster.availableKeys).toEqual([]);

		// ...and an addable companion the player does not own yet is refused by
		// the format guard rather than written with a bad schema.
		const catalog = (await import("../lib/generated/companion-catalog.json"))
			.default as {
			entries: Record<string, { addable?: boolean; ownershipGroup?: string }>;
		};
		const ownedGroups = new Set(
			roster.records.map((record) => {
				const entry = catalog.entries[String(record.characterKey)];
				return entry?.ownershipGroup ?? `character:${record.characterKey}`;
			}),
		);
		const candidate = Object.entries(catalog.entries).find(
			([key, entry]) =>
				entry.addable &&
				!ownedGroups.has(entry.ownershipGroup ?? `character:${key}`),
		);
		expect(candidate).toBeDefined();
		if (!candidate) return;
		await expect(
			applyCompanionAdditions(endgame, [
				{ type: "addCompanion", characterKey: Number(candidate[0]) },
			]),
		).rejects.toThrow(/unsupported companion format/);
	});
});

type DescribedRecord = InventoryDescription["records"][number];
type EquipmentRecord = DescribedRecord & {
	equipment: NonNullable<DescribedRecord["equipment"]>;
};
const equipmentRecords = (records: DescribedRecord[]): EquipmentRecord[] =>
	records.filter(
		(record): record is EquipmentRecord => record.equipment !== null,
	);

const targetOf = (record: DescribedRecord): EquipmentTarget => ({
	inventoryKey: record.inventoryKey,
	slotNo: record.slotNo,
	itemKey: record.itemKey,
});

const findDescribed = (
	records: DescribedRecord[],
	target: EquipmentTarget,
): DescribedRecord | undefined =>
	records.find(
		(record) =>
			record.inventoryKey === target.inventoryKey &&
			record.slotNo === target.slotNo &&
			record.itemKey === target.itemKey,
	);

/** Gear keys the compatibility rules allow on this equipment. */
const compatibleGear = (
	rules: AbyssGearRulesFile,
	equipmentKey: number,
): number[] => {
	const equipType = rules.equipmentTypes[String(equipmentKey)];
	if (equipType === undefined) return [];
	const wanted = Number(equipType);
	return Object.entries(rules.gear)
		.filter(([, gear]) => gear.allowedEquipTypes.includes(wanted))
		.map(([key]) => Number(key))
		.sort((a, b) => a - b);
};

/** Everything the shared transaction lifecycle must report on every edit. */
const verificationHolds = (audit: Record<string, unknown>): void => {
	expect(audit.output_reopened).toBe(true);
	expect(audit.raw_payload_reopened_identically).toBe(true);
	expect(String(audit.output_sha256)).toMatch(/^[0-9a-f]{64}$/);
};

/** Refinements of every equipment record except `target`, for comparisons. */
const otherEquipment = (
	records: DescribedRecord[],
	target: EquipmentTarget,
): string =>
	JSON.stringify(
		equipmentRecords(records)
			.filter(
				(record) =>
					record.inventoryKey !== target.inventoryKey ||
					record.slotNo !== target.slotNo ||
					record.itemKey !== target.itemKey,
			)
			.map((record) => [
				record.inventoryKey,
				record.slotNo,
				record.itemKey,
				record.equipment.refinement,
			])
			.sort(),
	);

/** A socket the engine will accept a replacement in, with gear it allows. */
const swappableSocket = (
	before: InventoryDescription,
	rules: AbyssGearRulesFile,
	caps: Awaited<ReturnType<typeof defaultSocketCaps>>,
): {
	record: EquipmentRecord;
	index: number;
	socketItem: number;
	gearKey: number;
} | null => {
	for (const record of equipmentRecords(before.records)) {
		const cap = caps.get(record.itemKey)?.maxSockets;
		if (cap === undefined) continue;
		const index = record.equipment.socketItems.findIndex(
			(item, position) => item !== null && position < cap,
		);
		if (index < 0) continue;
		const socketItem = record.equipment.socketItems[index];
		if (socketItem === null || socketItem === undefined) continue;
		const gearKey = compatibleGear(rules, record.itemKey).find(
			(key) => !record.equipment.socketItems.includes(key),
		);
		if (gearKey === undefined) continue;
		return { record, index, socketItem, gearKey };
	}
	return null;
};

describe("equipment", () => {
	test("a refinement edit changes only the chosen record's level", async () => {
		const before = await describeSavedInventory(save);
		const chosen = equipmentRecords(before.records).find(
			(record) =>
				record.equipment.canRefine &&
				record.equipment.refinementLevels.some(
					(level) => level !== record.equipment.refinement,
				),
		);
		expect(chosen).toBeDefined();
		if (!chosen) return;
		const target = targetOf(chosen);
		const level = chosen.equipment.refinementLevels
			.filter((candidate) => candidate !== chosen.equipment.refinement)
			.sort((a, b) => b - a)[0];
		expect(level).toBeDefined();
		if (level === undefined) return;

		const [output, audit] = await editEnchantLevel(
			save,
			target,
			chosen.equipment.refinement,
			level,
		);
		verificationHolds(audit);
		expect(audit.edit).toBe("enchant_level");
		expect(audit.old_level).toBe(chosen.equipment.refinement);
		expect(audit.new_level).toBe(level);

		const after = await describeInventory(await opened(output));
		expect(after.records.length).toBe(before.records.length);
		expect(findDescribed(after.records, target)?.equipment?.refinement).toBe(
			level,
		);
		expect(otherEquipment(after.records, target)).toBe(
			otherEquipment(before.records, target),
		);

		// A stale expected level is still refused rather than overwritten.
		await expect(
			editEnchantLevel(save, target, chosen.equipment.refinement + 1, level),
		).rejects.toThrow(/Expected enchant level/);
	});

	test("an unlock edit raises the count and leaves socket contents alone", async () => {
		const caps = await defaultSocketCaps();
		const before = await describeSavedInventory(save);
		const chosen = equipmentRecords(before.records).find((record) => {
			const cap = caps.get(record.itemKey)?.maxSockets;
			return (
				cap !== undefined &&
				record.equipment.unlockedSockets < cap &&
				record.equipment.unlockedSockets + 1 <=
					record.equipment.socketItems.length
			);
		});
		expect(chosen).toBeDefined();
		if (!chosen) return;
		const target = targetOf(chosen);
		const unlocked = chosen.equipment.unlockedSockets;

		const [output, audit] = await editValidSocketCount(
			save,
			target,
			unlocked,
			unlocked + 1,
		);
		verificationHolds(audit);
		expect(audit.edit).toBe("valid_socket_count");
		expect(audit.old_valid_socket_count).toBe(unlocked);
		expect(audit.new_valid_socket_count).toBe(unlocked + 1);
		expect(audit.socket_contents_preserved).toBe(true);

		const after = await describeInventory(await opened(output));
		expect(after.records.length).toBe(before.records.length);
		const record = findDescribed(after.records, target);
		expect(record?.equipment?.unlockedSockets).toBe(unlocked + 1);
		expect(record?.equipment?.socketItems).toEqual(
			chosen.equipment.socketItems,
		);

		// The gameplay cap is enforced, not just the serialized five slots.
		const cap = defined(caps.get(chosen.itemKey), "socket cap").maxSockets;
		await expect(
			editValidSocketCount(save, target, unlocked, cap + 1),
		).rejects.toThrow(/exceeds this item's verified gameplay maximum/);
	});

	test("a socket swap replaces one gear item and leaves the others", async () => {
		const rules = await abyssGearRulesTable();
		const caps = await defaultSocketCaps();
		const before = await describeSavedInventory(endgame);
		const candidate = swappableSocket(before, rules, caps);
		expect(candidate).not.toBeNull();
		if (!candidate) return;
		const { record, index, socketItem: current, gearKey } = candidate;
		const target = targetOf(record);

		const [output, audit] = await replaceSocketItem(
			endgame,
			target,
			index,
			current,
			gearKey,
		);
		verificationHolds(audit);
		expect(audit.edit).toBe("socket_item");
		expect(audit.old_socket_item_key).toBe(current);
		expect(audit.new_socket_item_key).toBe(gearKey);

		const after = await describeInventory(await opened(output));
		expect(after.records.length).toBe(before.records.length);
		const sockets = findDescribed(after.records, target)?.equipment
			?.socketItems;
		expect(sockets?.[index]).toBe(gearKey);
		expect(sockets?.filter((_, other) => other !== index)).toEqual(
			record.equipment.socketItems.filter((_, other) => other !== index),
		);

		// The stale socket item is refused too.
		await expect(
			replaceSocketItem(endgame, target, index, gearKey + 1, current),
		).rejects.toThrow(/Expected socket item/);
	});

	test("a socket swap refuses to duplicate gear already socketed", async () => {
		const rules = await abyssGearRulesTable();
		const before = await describeSavedInventory(endgame);
		const chosen = equipmentRecords(before.records).find((record) => {
			const filled = record.equipment.socketItems.filter(
				(item): item is number => item !== null,
			);
			const second = filled[1];
			return (
				second !== undefined &&
				compatibleGear(rules, record.itemKey).includes(second)
			);
		});
		expect(chosen).toBeDefined();
		if (!chosen) return;
		const filled = chosen.equipment.socketItems.filter(
			(item): item is number => item !== null,
		);
		const first = defined(filled[0], "first socket item");
		const second = defined(filled[1], "second socket item");
		const index = chosen.equipment.socketItems.indexOf(first);

		await expect(
			replaceSocketItem(endgame, targetOf(chosen), index, first, second),
		).rejects.toThrow(/duplicate socket item/);
	});

	test("filling an unlocked empty socket adds exactly that gear item", async () => {
		const rules = await abyssGearRulesTable();
		const caps = await defaultSocketCaps();
		const before = await describeSavedInventory(endgame);
		const candidate = equipmentRecords(before.records)
			.map((record) => {
				const cap = caps.get(record.itemKey)?.maxSockets;
				if (cap === undefined) return null;
				const index = record.equipment.socketItems.findIndex(
					(item, position) =>
						item === null &&
						position < record.equipment.unlockedSockets &&
						position < cap,
				);
				if (index < 0) return null;
				const gearKey = compatibleGear(rules, record.itemKey).find(
					(key) => !record.equipment.socketItems.includes(key),
				);
				if (gearKey === undefined) return null;
				return { record, index, gearKey };
			})
			.find((entry) => entry !== null);
		expect(candidate).not.toBeNull();
		if (!candidate) return;
		const { record, index, gearKey } = candidate;
		const target = targetOf(record);
		const unlocked = record.equipment.unlockedSockets;

		const [output, audit] = await fillEmptySocket(
			endgame,
			target,
			index,
			gearKey,
		);
		verificationHolds(audit);
		expect(audit.edit).toBe("fill_empty_socket");
		expect(audit.new_socket_item_key).toBe(gearKey);
		expect(audit.valid_socket_count_preserved).toBe(unlocked);

		const after = await describeInventory(await opened(output));
		expect(after.records.length).toBe(before.records.length);
		const filled = findDescribed(after.records, target);
		expect(filled?.equipment?.socketItems[index]).toBe(gearKey);
		expect(filled?.equipment?.unlockedSockets).toBe(unlocked);
		expect(filled?.equipment?.socketItems).toEqual(
			record.equipment.socketItems.map((item, position) =>
				position === index ? gearKey : item,
			),
		);

		// Gear already socketed elsewhere in the same item is refused.
		const duplicate = record.equipment.socketItems
			.filter((item): item is number => item !== null)
			.find((key) => compatibleGear(rules, record.itemKey).includes(key));
		expect(duplicate).toBeDefined();
		if (duplicate !== undefined) {
			await expect(
				fillEmptySocket(endgame, target, index, duplicate),
			).rejects.toThrow(/duplicate socket item/);
		}
	});

	test("catalog insertion grows the inventory by one record", async () => {
		const catalog = await equipmentCatalog();
		const before = await describeSavedInventory(save);
		const present = new Set(
			before.records
				.filter((record) => record.inventoryKey === 2)
				.map((record) => record.itemKey),
		);
		const candidate = Object.entries(catalog).find(
			([key, entry]) =>
				entry.characterEquipment &&
				!entry.blockedInGameData &&
				!present.has(Number(key)),
		);
		expect(candidate).toBeDefined();
		if (!candidate) return;
		const itemKey = Number(candidate[0]);
		const levels = catalog[String(itemKey)]?.refinementLevels ?? [0];
		const refinement = levels.filter((level) => level > 0)[0] ?? levels[0] ?? 0;

		const [output, audit] = await insertCatalogEquipment(save, {
			itemKey,
			inventoryKey: 2,
			refinement,
		});
		verificationHolds(audit);
		expect(audit.edit).toBe("insert_catalog_equipment");
		expect(audit.item_key).toBe(itemKey);
		expect(audit.preexisting_records_preserved).toBe(true);
		expect(audit.active_equipment_preserved).toBe(true);

		const after = await describeInventory(await opened(output));
		expect(after.records.length).toBe(before.records.length + 1);
		const inserted = after.records.find(
			(record) => record.inventoryKey === 2 && record.itemKey === itemKey,
		);
		expect(inserted).toBeDefined();
		expect(inserted?.equipment?.refinement).toBe(refinement);
		// Everything that was already there kept its identity and slot.
		expect(
			otherEquipment(after.records, targetOf(defined(inserted, "inserted"))),
		).toBe(
			otherEquipment(before.records, targetOf(defined(inserted, "inserted"))),
		);

		await expect(
			insertCatalogEquipment(output, { itemKey, inventoryKey: 2, refinement }),
		).rejects.toThrow(/already exists/);
	});

	test("each catalog path refuses the other kind of item", async () => {
		const catalog = await equipmentCatalog();
		const character = Object.entries(catalog).find(
			([, entry]) => entry.characterEquipment,
		);
		const plain = Object.entries(catalog).find(
			([, entry]) => !entry.characterEquipment,
		);
		expect(character).toBeDefined();
		expect(plain).toBeDefined();
		if (!character || !plain) return;

		await expect(
			insertCatalogEquipment(save, { itemKey: Number(plain[0]) }),
		).rejects.toThrow(/not supported character equipment/);
		await expect(
			insertCatalogItem(save, { itemKey: Number(character[0]) }),
		).rejects.toThrow(/character gear uses Equipment/);
	});
});

/** Equipped records the donor path will accept for `inventoryKey`. */
const cleanDonors = async (bytes: Uint8Array, inventoryKey = 2) => {
	const raw = await cachedRaw(bytes);
	const present = new Set(
		readInventory(raw)
			.filter((record) => record.inventoryKey === inventoryKey)
			.map((record) => record.itemKey),
	);
	return {
		raw,
		records: readEquipmentLayout(raw).records.filter(
			(record) =>
				record.dyes.length === 0 &&
				record.values._transferredItemKey === record.itemKey &&
				!(record.itemKey in RUNTIME_RESTRICTED_EQUIPMENT) &&
				!present.has(record.itemKey),
		),
	};
};

/** What the equipped loadout holds, ignoring where it sits in the payload. */
const loadoutSignature = (raw: Uint8Array): string =>
	JSON.stringify(
		readEquipmentLayout(raw).records.map((record) => [
			record.slotNo,
			record.itemNo,
			record.itemKey,
			record.stackCount,
			record.values._enchantLevel ?? null,
			record.sockets.map((socket) => [socket.itemKey, socket.currentEndurance]),
		]),
	);

/** Knowledge contents, again without the absolute offsets of the records. */
const knowledgeSignature = (raw: Uint8Array): string =>
	JSON.stringify(
		readKnowledge(raw).map((record) => [
			record.key,
			record.level,
			record.learnedFieldTime,
			record.isNew,
		]),
	);

// Minimal shapes for planning tests: the values only matter where a run is
// actually executed.
const quantityEdit = (slot: number): SaveEdit => ({
	type: "quantity",
	inventoryKey: 2,
	slotNo: slot,
	itemKey: 1000 + slot,
	expectedQuantity: 1,
	newQuantity: 2,
});

const insertEdit = (templateItemKey: number): SaveEdit => ({
	type: "insertItem",
	inventoryKey: 2,
	templateItemKey,
	itemKey: templateItemKey + 1,
	quantity: 1,
});

const equipmentEdit = (slot: number): SaveEdit => ({
	type: "equipment",
	inventoryKey: 2,
	slotNo: slot,
	itemKey: 1000,
	refinement: 0,
	unlockedSockets: 1,
	socketItems: [null, null, null, null, null],
});

const catalogEdit = (itemKey: number): SaveEdit => ({
	type: "insertCatalogItem",
	inventoryKey: 2,
	itemKey,
	quantity: 1,
});

const skillsEdit = (): SaveEdit => ({ type: "skills", mode: "stats" });

const companionEdit = (characterKey: number): SaveEdit => ({
	type: "addCompanion",
	characterKey,
});

const workerEdit = (quantity: number): SaveEdit => ({
	type: "addRoboWorkers",
	quantity,
});

describe("edit plan", () => {
	test("neighbouring edits that share an applier become one run", () => {
		const runs = planSaveEdits([
			quantityEdit(1),
			quantityEdit(2),
			insertEdit(50001),
			equipmentEdit(0),
			catalogEdit(8501),
			skillsEdit(),
			companionEdit(30001),
			workerEdit(3),
		]);

		expect(runs.map((run) => run.size)).toEqual([2, 1, 2, 1, 2]);
		expect(runs.map((run) => run.label)).toEqual([
			"Applying and validating quantities",
			"Applying and validating change",
			"Applying and validating change",
			"Applying and validating change",
			"Adding and validating companions",
		]);
	});

	test("only neighbours group: the same type split apart starts a new run", () => {
		const split = planSaveEdits([
			insertEdit(50001),
			skillsEdit(),
			insertEdit(50002),
		]);
		expect(split.map((run) => run.size)).toEqual([1, 1, 1]);

		// Different types are still one run when one applier owns both.
		const shared = planSaveEdits([equipmentEdit(0), catalogEdit(8501)]);
		expect(shared.map((run) => run.size)).toEqual([2]);
	});

	test("runs keep the staged order, not the registry order", () => {
		const runs = planSaveEdits([
			skillsEdit(),
			quantityEdit(1),
			companionEdit(30001),
		]);
		expect(runs.map((run) => run.label)).toEqual([
			"Applying and validating change",
			"Applying and validating quantities",
			"Adding and validating companions",
		]);
	});

	test("no staged edits means no runs", () => {
		expect(planSaveEdits([])).toEqual([]);
	});

	test("an edit the engine cannot apply is reported with its type", () => {
		const unknown = { type: "nonsense" } as unknown as SaveEdit;
		expect(() => planSaveEdits([unknown])).toThrow(
			/Unsupported edit type: nonsense/,
		);
		// Known edits before it are planned, then planning stops at the unknown one.
		expect(() => planSaveEdits([quantityEdit(1), unknown])).toThrow(
			/Unsupported edit type: nonsense/,
		);
	});

	test("each run reads the previous run's output", async () => {
		const records = await fixtureInventory(save);
		const target = records.find((record) => record.stackCount > 1);
		expect(target).toBeDefined();
		if (!target) return;
		const present = new Set(
			records
				.filter((record) => record.inventoryKey === target.inventoryKey)
				.map((record) => record.itemKey),
		);
		const newItemKey = [50001, 50002, 50003, 50004, 50005].find(
			(key) => !present.has(key),
		);
		expect(newItemKey).toBeDefined();
		if (newItemKey === undefined) return;
		const next = target.stackCount + 4;

		const runs = planSaveEdits([
			{
				type: "quantity",
				inventoryKey: target.inventoryKey,
				slotNo: target.slotNo,
				itemKey: target.itemKey,
				expectedQuantity: target.stackCount,
				newQuantity: next,
			},
			{
				type: "insertItem",
				inventoryKey: target.inventoryKey,
				templateItemKey: target.itemKey,
				itemKey: newItemKey,
				quantity: 2,
			},
		]);
		expect(runs.map((run) => run.size)).toEqual([1, 1]);

		let current = save;
		for (const run of runs) {
			const [output, audits] = await run.run(current, async () => {});
			expect(audits.length).toBe(run.size);
			current = output;
		}

		const after = await withSave(current, readInventory);
		expect(after.length).toBe(records.length + 1);
		const edited = after.find(
			(record) =>
				record.inventoryKey === target.inventoryKey &&
				record.slotNo === target.slotNo &&
				record.itemKey === target.itemKey,
		);
		expect(edited?.stackCount).toBe(next);
		expect(
			after.find(
				(record) =>
					record.itemKey === newItemKey &&
					record.inventoryKey === target.inventoryKey,
			)?.stackCount,
		).toBe(2);
	});
});

describe("donor insertion", () => {
	test("copying an equipped item adds it to the inventory", async () => {
		const { raw, records } = await cleanDonors(save);
		const donor = records[0];
		expect(donor).toBeDefined();
		if (!donor) return;
		const before = readInventory(raw);

		const [output, audit] = await insertDonorEquipmentIntoInventory(
			save,
			save,
			{
				donorSlot: donor.slotNo,
			},
		);
		verificationHolds(audit);
		expect(audit.edit).toBe("insert_donor_equipment_into_inventory");
		expect(audit.donor_slot).toBe(donor.slotNo);
		expect(audit.item_key).toBe(donor.itemKey);
		expect(audit.inventory_count_before).toBe(before.length);
		expect(audit.inventory_count_after).toBe(before.length + 1);
		expect(audit.active_equipment_preserved).toBe(true);
		expect(audit.knowledge_preserved).toBe(true);
		expect(audit.schema_unchanged).toBe(true);
		expect(audit.dyes_removed).toBe(0);

		const reopened = (await decodeSave(output)).rawPayload;
		const after = readInventory(reopened);
		expect(after.length).toBe(before.length + 1);
		const inserted = after.find(
			(record) => record.inventoryKey === 2 && record.itemKey === donor.itemKey,
		);
		expect(inserted).toBeDefined();
		expect(inserted?.itemNo).toBe(Number(audit.new_item_no));
		expect(inserted?.slotNo).toBe(Number(audit.new_inventory_slot));
		expect(inserted?.stackCount).toBe(1);
		expect(Number(inserted?.values._enchantLevel ?? 0)).toBe(
			Number(donor.values._enchantLevel ?? 0),
		);
		// The loadout it was copied from, and the knowledge tree, are untouched.
		expect(loadoutSignature(reopened)).toBe(loadoutSignature(raw));
		expect(knowledgeSignature(reopened)).toBe(knowledgeSignature(raw));

		// The same item cannot be inserted into the same inventory twice.
		await expect(
			insertDonorEquipmentIntoInventory(output, output, {
				donorSlot: donor.slotNo,
			}),
		).rejects.toThrow(/already contains the donor item/);
	});

	test("a targeted donor carries its refinement and sockets across", async () => {
		const { records } = await cleanDonors(endgame);
		const donor = records
			.filter(
				(record) =>
					record.sockets.filter((socket) => socket.itemKey !== null).length > 0,
			)
			.sort(
				(a, b) =>
					b.sockets.filter((socket) => socket.itemKey !== null).length -
					a.sockets.filter((socket) => socket.itemKey !== null).length,
			)[0];
		expect(donor).toBeDefined();
		if (!donor) return;
		const donorSockets = donor.sockets.map((socket) => socket.itemKey);
		const donorEndurance = donor.sockets.map(
			(socket) => socket.currentEndurance,
		);
		expect(donorSockets.filter((item) => item !== null).length).toBeGreaterThan(
			1,
		);

		const [output, audit] = await insertDonorEquipmentIntoInventory(
			endgame,
			endgame,
			{ donorSlot: donor.slotNo },
		);
		verificationHolds(audit);
		expect(audit.socket_count).toBe(donor.sockets.length);
		expect(audit.filled_sockets).toEqual(
			donorSockets.filter((item) => item !== null),
		);
		expect(audit.refinement).toBe(donor.values._enchantLevel);

		const after = readInventory((await decodeSave(output)).rawPayload);
		const inserted = after.find(
			(record) => record.inventoryKey === 2 && record.itemKey === donor.itemKey,
		);
		expect(inserted).toBeDefined();
		expect(inserted?.sockets.map((socket) => socket.itemKey)).toEqual(
			donorSockets,
		);
		expect(inserted?.sockets.map((socket) => socket.currentEndurance)).toEqual(
			donorEndurance,
		);
	});

	// The successful preserve path re-encrypts and re-verifies the 9 MB
	// endgame payload, which alone costs most of a second under parallel load;
	// give the whole test headroom over the 5 s default.
	test("a dyed donor needs its dyes preserved on purpose", async () => {
		const raw = await cachedRaw(endgame);
		const donor = readEquipmentLayout(raw).records.find(
			(record) => record.dyes.length > 0,
		);
		expect(donor).toBeDefined();
		if (!donor) return;
		const options = { donorSlot: donor.slotNo };

		// Accepting the copy silently would drop the dye data.
		await expect(
			insertDonorEquipmentIntoInventory(endgame, endgame, options),
		).rejects.toThrow(/contains dye data/);
		// Stripping is gated behind an explicit experimental opt-in.
		await expect(
			insertDonorEquipmentIntoInventory(endgame, endgame, {
				...options,
				stripDyes: true,
			}),
		).rejects.toThrow(/Dye stripping is disabled/);
		await expect(
			insertDonorEquipmentIntoInventory(endgame, endgame, {
				...options,
				stripDyes: true,
				preserveDyes: true,
			}),
		).rejects.toThrow(/mutually exclusive/);

		const [output, audit] = await insertDonorEquipmentIntoInventory(
			endgame,
			endgame,
			{ ...options, preserveDyes: true },
		);
		verificationHolds(audit);
		expect(audit.dyes_preserved).toBe(donor.dyes.length);
		expect(audit.dyes_removed).toBe(0);
		expect(audit.item_key).toBe(donor.itemKey);

		const after = readInventory((await decodeSave(output)).rawPayload);
		expect(
			after.some(
				(record) =>
					record.inventoryKey === 2 && record.itemKey === donor.itemKey,
			),
		).toBe(true);
	}, 20_000);
});

describe("item condition", () => {
	const key = (entry: {
		inventoryKey: number;
		slotNo: number;
		itemKey: number;
	}) => `${entry.inventoryKey}:${entry.slotNo}:${entry.itemKey}`;

	test("sets endurance and sharpness on one item and leaves the rest", async () => {
		const described = await describeSavedItemConditions(save);
		expect(described.error).toBeNull();
		const entry = described.entries.find(
			(candidate) => candidate.condition.sharpness !== null,
		);
		expect(entry).toBeDefined();
		if (!entry) return;
		const [output, audit] = await applyItemCondition(save, {
			type: "condition",
			inventoryKey: entry.inventoryKey,
			slotNo: entry.slotNo,
			itemKey: entry.itemKey,
			itemName: "fixture item",
			endurance: 4242,
			sharpness: 7,
			chargedUses: null,
		});
		verificationHolds(audit);

		const before = new Map(
			described.entries.map((row) => [key(row), row.condition]),
		);
		const after = await describeItemConditions(await opened(output));
		const edited = after.entries.find((row) => key(row) === key(entry));
		expect(edited?.condition.endurance).toBe(4242);
		expect(edited?.condition.sharpness).toBe(7);
		expect(edited?.condition.chargedUses).toBe(entry.condition.chargedUses);
		for (const row of after.entries) {
			if (key(row) === key(entry)) continue;
			expect(row.condition).toEqual(
				defined(before.get(key(row)), "condition before the edit"),
			);
		}
	});

	test("sets the charges left on a useable item", async () => {
		const described = await describeSavedItemConditions(save);
		const entry = described.entries.find(
			(candidate) => candidate.condition.chargedUses !== null,
		);
		expect(entry).toBeDefined();
		if (!entry) return;
		const [output, audit] = await applyItemCondition(save, {
			type: "condition",
			inventoryKey: entry.inventoryKey,
			slotNo: entry.slotNo,
			itemKey: entry.itemKey,
			itemName: "fixture item",
			endurance: null,
			sharpness: null,
			chargedUses: 42,
		});
		verificationHolds(audit);
		expect(audit.fields_written).toEqual(["_chargedUseableCount"]);
		const after = await describeItemConditions(await opened(output));
		expect(
			after.entries.find((row) => key(row) === key(entry))?.condition
				.chargedUses,
		).toBe(42);
	});

	test("refuses a field the record does not store", async () => {
		const described = await describeSavedItemConditions(save);
		const entry = described.entries.find(
			(candidate) =>
				candidate.condition.endurance !== null &&
				candidate.condition.sharpness === null,
		);
		expect(entry).toBeDefined();
		if (!entry) return;
		await expect(
			applyItemCondition(save, {
				type: "condition",
				inventoryKey: entry.inventoryKey,
				slotNo: entry.slotNo,
				itemKey: entry.itemKey,
				itemName: "fixture item",
				endurance: null,
				sharpness: 5,
				chargedUses: null,
			}),
		).rejects.toThrow(/does not store sharpness/);
	});

	test("refuses an edit that would change nothing", async () => {
		const described = await describeSavedItemConditions(save);
		const entry = described.entries.find(
			(candidate) => candidate.condition.endurance !== null,
		);
		expect(entry).toBeDefined();
		if (!entry || entry.condition.endurance === null) return;
		await expect(
			applyItemCondition(save, {
				type: "condition",
				inventoryKey: entry.inventoryKey,
				slotNo: entry.slotNo,
				itemKey: entry.itemKey,
				itemName: "fixture item",
				endurance: entry.condition.endurance,
				sharpness: null,
				chargedUses: null,
			}),
		).rejects.toThrow(/already stored/);
	});
});

describe("dyes", () => {
	const partSummary = (slot: {
		red: { value: number } | null;
		green: { value: number } | null;
		blue: { value: number } | null;
		alpha: { value: number } | null;
		grime: { value: number } | null;
		colorGroup: { value: number } | null;
		material: { value: number } | null;
	}) => [
		slot.red?.value ?? null,
		slot.green?.value ?? null,
		slot.blue?.value ?? null,
		slot.alpha?.value ?? null,
		slot.grime?.value ?? null,
		slot.colorGroup?.value ?? null,
		slot.material?.value ?? null,
	];

	test("recolours one part of one item and nothing else", async () => {
		const described = await describeSavedDyes(endgame);
		expect(described.error).toBeNull();
		const item = described.items.find((candidate) =>
			candidate.slots.some((slot) => slot.red && slot.green && slot.blue),
		);
		expect(item).toBeDefined();
		if (!item) return;
		const index = item.slots.findIndex(
			(slot) => slot.red && slot.green && slot.blue,
		);
		const [output, audit] = await applyDyeEdit(endgame, {
			type: "dye",
			itemNo: item.itemNo,
			itemKey: item.itemKey,
			slotNo: item.slotNo,
			slotIndices: [index],
			label: "fixture dye",
			red: 1,
			green: 2,
			blue: 3,
			alpha: null,
			grime: null,
			colorGroup: null,
			material: null,
		});
		verificationHolds(audit);

		const after = await describeDyes(await opened(output));
		const edited = after.items.find(
			(candidate) => candidate.itemNo === item.itemNo,
		);
		expect(edited).toBeDefined();
		expect(edited?.slots[index]?.red?.value).toBe(1);
		expect(edited?.slots[index]?.green?.value).toBe(2);
		expect(edited?.slots[index]?.blue?.value).toBe(3);
		expect(edited?.slots[index]?.alpha?.value).toBe(
			item.slots[index]?.alpha?.value,
		);
		expect(
			edited?.slots
				.filter((_slot, position) => position !== index)
				.map(partSummary),
		).toEqual(
			item.slots
				.filter((_slot, position) => position !== index)
				.map(partSummary),
		);
		for (const other of after.items) {
			if (other.itemNo === item.itemNo) continue;
			const original = described.items.find(
				(candidate) => candidate.itemNo === other.itemNo,
			);
			expect(other.slots.map(partSummary)).toEqual(
				original?.slots.map(partSummary) ?? [],
			);
		}
	});

	test("changes every part of one item in one edit", async () => {
		const described = await describeSavedDyes(endgame);
		const item = described.items.find((candidate) =>
			candidate.slots.some((slot) => slot.alpha),
		);
		expect(item).toBeDefined();
		if (!item) return;
		const [output, audit] = await applyDyeEdit(endgame, {
			type: "dye",
			itemNo: item.itemNo,
			itemKey: item.itemKey,
			slotNo: item.slotNo,
			slotIndices: null,
			label: "fixture dye",
			red: null,
			green: null,
			blue: null,
			alpha: 128,
			grime: null,
			colorGroup: null,
			material: null,
		});
		verificationHolds(audit);
		expect(audit.parts_changed).toBe(item.slots.length);
		const after = await describeDyes(await opened(output));
		const edited = after.items.find(
			(candidate) => candidate.itemNo === item.itemNo,
		);
		for (const slot of edited?.slots ?? []) {
			if (slot.alpha) expect(slot.alpha.value).toBe(128);
		}
	});

	test("refuses a channel the part does not store", async () => {
		const described = await describeSavedDyes(endgame);
		const item = described.items.find((candidate) =>
			candidate.slots.some((slot) => slot.red === null),
		);
		expect(item).toBeDefined();
		if (!item) return;
		const index = item.slots.findIndex((slot) => slot.red === null);
		await expect(
			applyDyeEdit(endgame, {
				type: "dye",
				itemNo: item.itemNo,
				itemKey: item.itemKey,
				slotNo: item.slotNo,
				slotIndices: [index],
				label: "fixture dye",
				red: 10,
				green: null,
				blue: null,
				alpha: null,
				grime: null,
				colorGroup: null,
				material: null,
			}),
		).rejects.toThrow(/does not store dyeColorR/);
	});

	test("a save whose gear was never dyed has no dye data", async () => {
		const described = await describeSavedDyes(save);
		expect(described.error).toBeNull();
		expect(described.items).toEqual([]);
		expect(described.colorGroups.length).toBeGreaterThan(0);
	});
});

describe("levels", () => {
	const summary = (entry: CharacterEntry) => [
		entry.level,
		entry.maxLevel,
		entry.experience,
		entry.threatRewarded,
		entry.memoryRewarded,
	];

	test("sets the player level and leaves every other row alone", async () => {
		const before = await describeSavedCharacters(save);
		const player = before.entries.find((entry) => entry.kind === "player");
		expect(player).toBeDefined();
		if (!player) return;
		const [output, audit] = await applyCharacterEdit(save, {
			type: "character",
			id: player.id,
			label: "fixture level",
			level: 42,
			maxLevel: null,
			experience: null,
			threatRewarded: null,
			memoryRewarded: null,
		});
		verificationHolds(audit);
		const after = await describeCharacters(await opened(output));
		expect(after.entries.find((entry) => entry.id === player.id)?.level).toBe(
			42,
		);
		for (const entry of after.entries) {
			if (entry.id === player.id) continue;
			expect(summary(entry)).toEqual(
				summary(
					before.entries.find((row) => row.id === entry.id) as CharacterEntry,
				),
			);
		}
	});

	test("creates the player's experience, which the save never stored", async () => {
		const before = await describeSavedCharacters(save);
		const player = before.entries.find((entry) => entry.kind === "player");
		expect(player).toBeDefined();
		if (!player) return;
		expect(player.experience).toBeNull();
		expect(player.creatable).toContain("experience");

		const [output, audit] = await applyCharacterEdit(save, {
			type: "character",
			id: player.id,
			label: "fixture level",
			level: null,
			maxLevel: null,
			experience: 1234567,
			threatRewarded: null,
			memoryRewarded: null,
		});
		verificationHolds(audit);
		expect(audit.fields_created).toBe(1);

		const after = await describeCharacters(await opened(output));
		const edited = after.entries.find((entry) => entry.id === player.id);
		expect(edited?.experience).toBe(1234567);
		expect(edited?.level).toBe(player.level);
		// Once the field is there the row neither needs nor offers a creation.
		expect(edited?.creatable).toEqual([]);
		for (const entry of after.entries) {
			if (entry.id === player.id) continue;
			expect(summary(entry)).toEqual(
				summary(
					before.entries.find((row) => row.id === entry.id) as CharacterEntry,
				),
			);
		}
	});

	test("writes the experience field once the first edit created it", async () => {
		const before = await describeSavedCharacters(save);
		const player = before.entries.find((entry) => entry.kind === "player");
		expect(player).toBeDefined();
		if (!player) return;
		const [created] = await applyCharacterEdit(save, {
			type: "character",
			id: player.id,
			label: "fixture level",
			level: null,
			maxLevel: null,
			experience: 1,
			threatRewarded: null,
			memoryRewarded: null,
		});

		const [output, audit] = await applyCharacterEdit(created, {
			type: "character",
			id: player.id,
			label: "fixture level",
			level: null,
			maxLevel: null,
			experience: 4242,
			threatRewarded: null,
			memoryRewarded: null,
		});
		verificationHolds(audit);
		expect(audit.fields_created).toBe(0);
		const after = await describeCharacters(await opened(output));
		expect(
			after.entries.find((entry) => entry.id === player.id)?.experience,
		).toBe(4242);
	});

	test("refuses a field the row does not track at all", async () => {
		const before = await describeSavedCharacters(save);
		const player = before.entries.find((entry) => entry.kind === "player");
		expect(player).toBeDefined();
		if (!player) return;
		expect(player.creatable).not.toContain("maxLevel");
		await expect(
			applyCharacterEdit(save, {
				type: "character",
				id: player.id,
				label: "fixture level",
				level: null,
				maxLevel: 10,
				experience: null,
				threatRewarded: null,
				memoryRewarded: null,
			}),
		).rejects.toThrow(/maxLevel is not stored for/);
	});

	test("creates the reward flags a bond has never stored", async () => {
		const before = await describeSavedCharacters(save);
		const bond = before.entries.find(
			(entry) => entry.kind === "bond" && entry.threatRewarded === null,
		);
		expect(bond).toBeDefined();
		if (!bond) return;
		const [output, audit] = await applyCharacterEdit(save, {
			type: "character",
			id: bond.id,
			label: "fixture bond",
			level: 7,
			maxLevel: null,
			experience: 900,
			threatRewarded: true,
			memoryRewarded: true,
		});
		verificationHolds(audit);
		expect(audit.fields_created).toBe(2);
		const after = await describeCharacters(await opened(output));
		const edited = after.entries.find((entry) => entry.id === bond.id);
		expect(edited?.level).toBe(7);
		expect(edited?.experience).toBe(900);
		expect(edited?.threatRewarded).toBe(true);
		expect(edited?.memoryRewarded).toBe(true);
	});

	test("marks every bond reward, creating the fields that are missing", async () => {
		const before = await describeSavedCharacters(save);
		const bonds = before.entries.filter((entry) => entry.kind === "bond");
		expect(bonds.length).toBeGreaterThan(0);
		const [output, audit] = await applyCharacterPreset(save, {
			type: "characterPreset",
			preset: "bondRewards",
			label: "fixture preset",
		});
		verificationHolds(audit);
		expect(audit.fields_created).toBeGreaterThan(0);
		const after = await describeCharacters(await opened(output));
		for (const entry of after.entries) {
			if (entry.kind !== "bond") continue;
			expect(entry.threatRewarded).toBe(true);
			expect(entry.memoryRewarded).toBe(true);
		}
		for (const entry of after.entries) {
			if (entry.kind === "bond") continue;
			expect(summary(entry)).toEqual(
				summary(
					before.entries.find((row) => row.id === entry.id) as CharacterEntry,
				),
			);
		}
	});

	test("sets every progression row's level and highest reached", async () => {
		const before = await describeSavedCharacters(save);
		const regions = before.entries.filter((entry) => entry.kind === "region");
		expect(regions.length).toBeGreaterThan(0);
		const [output, audit] = await applyCharacterPreset(save, {
			type: "characterPreset",
			preset: "regionLevels",
			label: "fixture preset",
			level: 80,
		});
		verificationHolds(audit);
		const after = await describeCharacters(await opened(output));
		for (const entry of after.entries) {
			if (entry.kind !== "region") continue;
			if (entry.maxLevel !== null) expect(entry.maxLevel).toBe(80);
			if (entry.level !== null) expect(entry.level).toBe(80);
		}
	});
});

describe("root scalars", () => {
	test("creates an omitted root field that is not the experience", async () => {
		const raw = await cachedRaw(save);
		const before = readRoot(raw, "CharacterStatusSaveData");
		expect(before.values._remainSkillPoint).toBeUndefined();
		const definition = defined(
			before.type.fields.find((field) => field.name === "_remainSkillPoint"),
			"_remainSkillPoint definition",
		);
		expect(definition.metaSize).toBe(2);

		const inserted = insertRootFields(raw, {
			rootType: "CharacterStatusSaveData",
			fields: [{ fieldName: "_remainSkillPoint", bytes: scalarBytes(2, 321) }],
		});
		expect(inserted.fieldsCreated).toBe(1);
		expect(inserted.payload.length).toBe(raw.length + 2);

		const after = readRoot(inserted.payload, "CharacterStatusSaveData");
		expect(after.values._remainSkillPoint).toBe(321);
		// The block grew in the middle, so every field it already had still reads
		// the same value at its new offset.
		for (const [name, value] of Object.entries(before.values)) {
			expect(after.values[name]).toBe(value);
		}
	});

	test("refuses a field the type does not declare", async () => {
		const raw = await cachedRaw(save);
		expect(() =>
			insertRootFields(raw, {
				rootType: "CharacterStatusSaveData",
				fields: [{ fieldName: "_notAField", bytes: scalarBytes(4, 1) }],
			}),
		).toThrow(/_notAField is not a field of/);
	});
});

describe("quests", () => {
	test("completes one quest", async () => {
		const before = await describeSavedQuests(save);
		expect(before.error).toBeNull();
		const entry = before.entries.find(
			(candidate) =>
				candidate.kind === "quest" &&
				candidate.editable &&
				candidate.state !== questCompletedState,
		);
		expect(entry).toBeDefined();
		if (!entry) return;
		const [output, audit] = await applyQuestEdit(save, {
			type: "quest",
			ids: [entry.id],
			state: questCompletedState,
			label: "fixture quest",
		});
		verificationHolds(audit);
		const after = await describeQuests(await opened(output));
		expect(after.entries.find((row) => row.id === entry.id)?.state).toBe(
			questCompletedState,
		);
		expect(after.completed.quest).toBe(before.completed.quest + 1);
	});

	test("resetting a row clears the completion time it recorded", async () => {
		const before = await describeSavedQuests(save);
		const entry = before.entries.find(
			(candidate) =>
				candidate.kind === "stage" &&
				candidate.editable &&
				candidate.state === questCompletedState &&
				(candidate.completedTime ?? 0) > 0,
		);
		expect(entry).toBeDefined();
		if (!entry) return;
		const [output, audit] = await applyQuestEdit(save, {
			type: "quest",
			ids: [entry.id],
			state: questAvailableState,
			label: "fixture reset",
		});
		verificationHolds(audit);
		const after = await describeQuests(await opened(output));
		const edited = after.entries.find((row) => row.id === entry.id);
		expect(edited?.state).toBe(questAvailableState);
		expect(edited?.completedTime).toBe(0);
		expect(audit.fields_written).toBeGreaterThan(1);
	});

	test("completing every quest leaves the other tables alone", async () => {
		const before = await describeSavedQuests(save);
		const [output, audit] = await applyQuestPreset(save, {
			type: "questPreset",
			preset: "completeAll",
			kinds: ["quest"],
			label: "fixture preset",
		});
		verificationHolds(audit);
		const after = await describeQuests(await opened(output));
		expect(after.completed.quest).toBe(after.counts.quest);
		expect(after.completed.mission).toBe(before.completed.mission);
		expect(after.completed.stage).toBe(before.completed.stage);
		expect(after.completed.gauge).toBe(before.completed.gauge);
	});

	test("refuses a row whose record stores no state", async () => {
		const before = await describeSavedQuests(save);
		const entry = before.entries.find((candidate) => !candidate.editable);
		expect(entry).toBeDefined();
		if (!entry) return;
		await expect(
			applyQuestEdit(save, {
				type: "quest",
				ids: [entry.id],
				state: questCompletedState,
				label: "fixture quest",
			}),
		).rejects.toThrow(/does not store a state/);
	});
});

describe("companion names", () => {
	test("names a companion that the save has never named", async () => {
		const before = await describeSavedCompanionNames(save);
		expect(before.error).toBeNull();
		const row = before.rows.find((candidate) => candidate.customName === null);
		expect(row).toBeDefined();
		if (!row) return;
		const [output, audit] = await applyCompanionRename(save, {
			type: "renameCompanion",
			mercenaryNo: row.mercenaryNo,
			characterKey: row.characterKey,
			name: "Old Bess",
			label: "fixture rename",
		});
		verificationHolds(audit);
		expect(audit.field_created).toBe(true);
		const after = await describeCompanionNames(await opened(output));
		expect(
			after.rows.find((entry) => entry.mercenaryNo === row.mercenaryNo)
				?.customName,
		).toBe("Old Bess");
		for (const entry of after.rows) {
			if (entry.mercenaryNo === row.mercenaryNo) continue;
			expect(entry.customName).toBe(
				before.rows.find(
					(candidate) => candidate.mercenaryNo === entry.mercenaryNo,
				)?.customName ?? null,
			);
		}
	});

	test("replaces a longer name with a shorter one", async () => {
		const target = (await describeSavedCompanionNames(save)).rows[0];
		expect(target).toBeDefined();
		if (!target) return;
		const [named] = await applyCompanionRename(save, {
			type: "renameCompanion",
			mercenaryNo: target.mercenaryNo,
			characterKey: target.characterKey,
			name: "Bartholomew The Third",
			label: "fixture rename",
		});
		const [output, audit] = await applyCompanionRename(named, {
			type: "renameCompanion",
			mercenaryNo: target.mercenaryNo,
			characterKey: target.characterKey,
			name: "Bo",
			label: "fixture rename",
		});
		verificationHolds(audit);
		expect(audit.field_created).toBe(false);
		expect(audit.bytes_added).toBeLessThan(0);
		const after = await describeCompanionNames(await opened(output));
		expect(
			after.rows.find((entry) => entry.mercenaryNo === target.mercenaryNo)
				?.customName,
		).toBe("Bo");
	});

	test("refuses a stale target and an over-long name", async () => {
		const before = await describeSavedCompanionNames(save);
		const row = before.rows[0];
		expect(row).toBeDefined();
		if (!row) return;
		await expect(
			applyCompanionRename(save, {
				type: "renameCompanion",
				mercenaryNo: row.mercenaryNo,
				characterKey: row.characterKey + 1,
				name: "Mismatch",
				label: "fixture rename",
			}),
		).rejects.toThrow(/no roster entry/);
		await expect(
			applyCompanionRename(save, {
				type: "renameCompanion",
				mercenaryNo: row.mercenaryNo,
				characterKey: row.characterKey,
				name: "x".repeat(64),
				label: "fixture rename",
			}),
		).rejects.toThrow(/at most/);
		await expect(
			applyCompanionRename(save, {
				type: "renameCompanion",
				mercenaryNo: row.mercenaryNo,
				characterKey: row.characterKey,
				name: "   ",
				label: "fixture rename",
			}),
		).rejects.toThrow(/cannot be empty/);
	});
});
