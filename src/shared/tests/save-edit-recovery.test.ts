import { describe, expect, test } from "bun:test";
import { applyEdits, applyEditsSafely } from "../save/edits";
import type { JsonValue } from "../save/json";
import type { SaveEdit } from "../save/types";

const edit = (path: SaveEdit["path"], after: JsonValue): SaveEdit => ({
	id: `${path.join(".")}=${JSON.stringify(after)}`,
	label: `set ${path.join(".")}`,
	path,
	before: null,
	after,
});

const DOC = { player: { name: "Ada", level: 1 }, version: 3 } as const;

describe("applyEditsSafely", () => {
	test("folds every applicable edit in staging order", () => {
		const { doc, failed } = applyEditsSafely(DOC, [
			edit(["player", "level"], 2),
			edit(["player", "level"], 7),
		]);
		expect(failed).toEqual([]);
		expect((doc as { player: { level: number } }).player.level).toBe(7);
	});

	test("reports an edit whose path this save does not carry, and keeps the rest", () => {
		const { doc, failed } = applyEditsSafely(DOC, [
			edit(["perks", "fire"], 3),
			edit(["player", "level"], 9),
		]);
		expect(failed).toHaveLength(1);
		expect(failed[0]?.path).toEqual(["perks", "fire"]);
		expect(doc).toBeTruthy();
		expect((doc as { player: { level: number } }).player.level).toBe(9);
	});

	test("reports a path that walks through a non-object", () => {
		const { failed } = applyEditsSafely(DOC, [edit(["version", "major"], 2)]);
		expect(failed).toHaveLength(1);
	});

	test("applyEdits keeps its old signature and ignores unapplicable edits", () => {
		expect(applyEdits(DOC, [edit(["player", "level"], 4)])).toEqual({
			...DOC,
			player: { name: "Ada", level: 4 },
		});
		expect(applyEdits(DOC, [edit(["nope"], 1)])).toEqual(DOC);
	});
});
