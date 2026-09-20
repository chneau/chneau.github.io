/**
 * The staged-list rules.
 *
 * What one download will apply is decided here, and every rule is a pure
 * function of the list, so none of this needs a save: a section replaces its
 * own entries, one progression change is in effect per download, and a
 * companion is staged only when the roster can take it.
 *
 * Run with `bun test` (or `bun run check:test`).
 */

import { describe, expect, test } from "bun:test";
import type {
	CompanionCatalog,
	CompanionEdit,
	CompanionSummary,
} from "../lib/companions";
import type {
	EquipmentDetails,
	EquipmentEdit,
	InsertEquipmentEdit,
} from "../lib/equipment";
import type { SkillEdit } from "../lib/skills";
import {
	queuedCompanions,
	replaceSection,
	stageCompanion,
	stageEquipment,
	stageProgression,
} from "../lib/staged-edit-list";
import type { SaveEdit } from "../lib/staged-edits";

const quantityEdit = (slotNo: number): SaveEdit => ({
	type: "quantity",
	inventoryKey: 2,
	slotNo,
	itemKey: 100,
	itemName: "measured item",
	expectedQuantity: 1,
	newQuantity: 2,
});

const equipmentEdit = (slotNo: number, refinement: number): EquipmentEdit => ({
	type: "equipment",
	inventoryKey: 2,
	slotNo,
	itemKey: 100,
	itemName: "measured equipment",
	refinement,
	unlockedSockets: 0,
	socketItems: [null, null, null, null, null],
});

const gear: EquipmentDetails = {
	refinement: 0,
	canRefine: true,
	refinementLevels: [0],
	unlockedSockets: 0,
	socketCap: 5,
	socketItems: [null, null, null, null, null],
};

const insertEquipmentEdit = (itemKey: number): InsertEquipmentEdit => ({
	type: "insertEquipment",
	inventoryKey: 2,
	itemKey,
	itemName: "added gear",
	refinement: 0,
	unlockedSockets: 0,
	socketItems: [null, null, null, null, null],
	equipment: gear,
});

const skillEdit = (mode: SkillEdit["mode"]): SkillEdit => ({
	type: "skills",
	mode,
	label: "Measured progression",
	targets: 10,
	injected: 1,
	patched: 9,
	relearned: 0,
});

const companionEdit = (characterKey: number): CompanionEdit => ({
	type: "addCompanion",
	characterKey,
	name: `Companion ${characterKey}`,
	category: "pets",
});

const workerEdit = (quantity: number): CompanionEdit => ({
	type: "addRoboWorkers",
	quantity,
	name: "Robo Worker",
	category: "camp",
});

const roster = (
	overrides: Partial<CompanionSummary> = {},
): CompanionSummary => ({
	records: [],
	roboWorkers: 0,
	maxRoboWorkers: 500,
	remainingWorkers: 500,
	availableKeys: [],
	workersSupported: true,
	error: null,
	...overrides,
});

const catalogOf = (keys: number[]): CompanionCatalog => ({
	entries: Object.fromEntries(
		keys.map((key): [string, CompanionCatalog["entries"][string]] => [
			String(key),
			{ name: `Companion ${key}`, category: "pets", addable: true },
		]),
	),
});

const ownedRecord = (
	characterKey: number,
): CompanionSummary["records"][number] => ({
	characterKey,
	id: `id-${characterKey}`,
	name: `Companion ${characterKey}`,
	species: "measured",
	category: "pets",
	selected: false,
	assigned: false,
	robot: false,
});

describe("the staged list", () => {
	test("a section replaces its own entries and leaves the rest", () => {
		const kept = quantityEdit(1);
		const stale = equipmentEdit(3, 1);
		const fresh = equipmentEdit(9, 2);
		const replaced = replaceSection(
			[kept, stale],
			(edit) => edit.type === "equipment",
			[fresh],
		);
		expect(replaced).toEqual([kept, fresh]);
	});

	test("re-staging one record's equipment revises it instead of stacking", () => {
		const first = equipmentEdit(3, 1);
		const other = equipmentEdit(4, 1);
		const revised = equipmentEdit(3, 5);
		expect(stageEquipment([first, other], revised)).toEqual([other, revised]);
	});

	test("an equipment insertion is matched on its item, having no Slot yet", () => {
		const pulse = insertEquipmentEdit(700);
		const ring = insertEquipmentEdit(701);
		expect(stageEquipment([pulse, ring], insertEquipmentEdit(700))).toEqual([
			ring,
			insertEquipmentEdit(700),
		]);
	});

	test("one progression change is in effect per download", () => {
		const staged = skillEdit("skills");
		const next = skillEdit("stats");
		expect(stageProgression([quantityEdit(1), staged], next)).toEqual([
			quantityEdit(1),
			next,
		]);
	});

	test("the queued companions are the companion edits alone", () => {
		expect(
			queuedCompanions([
				quantityEdit(1),
				companionEdit(7),
				workerEdit(3),
				skillEdit("stats"),
			]),
		).toEqual([companionEdit(7), workerEdit(3)]);
	});

	test("a companion is staged when the roster can take it", () => {
		const edit = companionEdit(7);
		const staged = stageCompanion([], edit, {
			summary: roster({ availableKeys: [7] }),
			catalog: catalogOf([7]),
		});
		expect(staged).toEqual([edit]);
	});

	test("a companion the roster cannot take leaves the list alone", () => {
		const edit = companionEdit(7);
		const current = [quantityEdit(1)];
		const take = { catalog: catalogOf([7]) };
		// Owned already.
		expect(
			stageCompanion(current, edit, {
				...take,
				summary: roster({
					availableKeys: [7],
					records: [ownedRecord(7)],
				}),
			}),
		).toEqual(current);
		// Queued already.
		expect(
			stageCompanion([...current, companionEdit(7)], edit, {
				...take,
				summary: roster({ availableKeys: [7] }),
			}),
		).toEqual([...current, companionEdit(7)]);
		// Not one this save can add.
		expect(
			stageCompanion(current, edit, {
				...take,
				summary: roster({ availableKeys: [8] }),
			}),
		).toEqual(current);
		// No catalog to read it against.
		expect(
			stageCompanion(current, edit, {
				catalog: null,
				summary: roster({ availableKeys: [7] }),
			}),
		).toEqual(current);
	});

	test("a worker batch is counted against the cap and what is queued", () => {
		const edit = workerEdit(2);
		const current = [quantityEdit(1)];
		// One worker short of the cap, so two do not fit.
		expect(
			stageCompanion(current, edit, {
				summary: roster({ roboWorkers: 499 }),
				catalog: null,
			}),
		).toEqual(current);
		// The queued batch already took the last place.
		expect(
			stageCompanion([...current, workerEdit(1)], edit, {
				summary: roster({ roboWorkers: 498 }),
				catalog: null,
			}),
		).toEqual([...current, workerEdit(1)]);
		// Two places left, so it lands.
		expect(
			stageCompanion(current, edit, {
				summary: roster({ roboWorkers: 498 }),
				catalog: null,
			}),
		).toEqual([...current, edit]);
	});
});
