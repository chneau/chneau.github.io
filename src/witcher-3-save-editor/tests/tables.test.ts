import { describe, expect, test } from "bun:test";
import {
	getAtPath,
	isJsonObject,
	type JsonValue,
	setAtPath,
	verifyRoundTrip,
} from "../../shared";
import { witcher3 } from "../lib/format";
import { FIXTURE_TIMEOUT_MS, largeSave } from "./fixtures";

const itemsOf = (doc: JsonValue): readonly JsonValue[] => {
	const items = getAtPath(doc, ["items"]);
	if (!Array.isArray(items)) throw new Error("the fixture has no inventory");
	return items;
};

const mutationsOf = (doc: JsonValue): readonly JsonValue[] => {
	const mutations = getAtPath(doc, ["mutations"]);
	if (!Array.isArray(mutations))
		throw new Error("the fixture has no mutations");
	return mutations;
};

describe("the table views", () => {
	test("offer the inventory, mutations and skills arrays", () => {
		const tables = witcher3.tables ?? [];
		expect(tables.map((table) => table.id)).toEqual([
			"inventory",
			"mutations",
			"skills",
		]);
		const inventory = tables.find((table) => table.id === "inventory");
		expect(inventory?.path).toEqual(["items"]);
		expect(inventory?.columns.map((column) => column.label)).toEqual([
			"Item",
			"Quantity",
			"Wear %",
			"Slot",
		]);
		const mutations = tables.find((table) => table.id === "mutations");
		expect(mutations?.path).toEqual(["mutations"]);
		expect(
			mutations?.columns.some(
				(column) => column.path.join(".") === "progress.overallProgress",
			),
		).toBe(true);
	});

	test(
		"repair stages only the items that record wear",
		async () => {
			const doc = await witcher3.decode(largeSave());
			const action = witcher3.actions.find(
				(entry) => entry.id === "equipment-repair",
			);
			if (action === undefined) throw new Error("no repair action");
			const edits = action.plan(doc);
			expect(edits.length).toBeGreaterThan(0);
			for (const edit of edits) {
				expect(edit.path[0]).toBe("items");
				expect(edit.path[2]).toBe("durability");
				expect(edit.after).toBe(100);
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"writes wear back to an item that records it",
		async () => {
			const bytes = largeSave();
			const doc = await witcher3.decode(bytes);
			const items = itemsOf(doc);
			const index = items.findIndex(
				(row) =>
					isJsonObject(row) &&
					typeof row.durability === "number" &&
					row.durability < 100,
			);
			if (index < 0) throw new Error("the fixture has no worn item");
			const edited = setAtPath(doc, ["items", index, "durability"], 100);
			const verdict = await verifyRoundTrip(witcher3, bytes, edited, true);
			expect(verdict.kind).toBe("semantic");
			const rebuilt = await witcher3.encode(edited);
			const reread = await witcher3.decode(rebuilt);
			expect(getAtPath(reread, ["items", index, "durability"])).toBe(100);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"writes a mutation's overall progress back",
		async () => {
			const bytes = largeSave();
			const doc = await witcher3.decode(bytes);
			const mutations = mutationsOf(doc);
			const index = mutations.findIndex((row) => {
				if (!isJsonObject(row)) return false;
				const progress = row.progress;
				return (
					progress !== undefined &&
					isJsonObject(progress) &&
					typeof progress.overallProgress === "number" &&
					progress.overallProgress < 100
				);
			});
			if (index < 0) throw new Error("the fixture has no unfinished mutation");
			const path = ["mutations", index, "progress", "overallProgress"] as const;
			const edited = setAtPath(doc, path, 100);
			const verdict = await verifyRoundTrip(witcher3, bytes, edited, true);
			expect(verdict.kind).toBe("semantic");
			const rebuilt = await witcher3.encode(edited);
			const reread = await witcher3.decode(rebuilt);
			expect(getAtPath(reread, path)).toBe(100);
		},
		FIXTURE_TIMEOUT_MS,
	);
});
