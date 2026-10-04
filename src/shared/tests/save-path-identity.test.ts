import { describe, expect, test } from "bun:test";
import {
	applyEdits,
	editId,
	pathKey,
	stageEdits,
	withoutPath,
} from "../save/edits";
import type { JsonValue, SavePath } from "../save/json";
import { formatPath } from "../save/json";
import type { SaveEdit } from "../save/types";

/**
 * One identity for a save path.
 *
 * `editId`, `withoutPath` and `stageEdits` compare paths structurally. The
 * `stagedPaths` set in `useSaveDocument` used `formatPath` — the *rendered* form
 * — and the inspector looked its `staged` and `editing` flags up with it. So the
 * app had two different answers to "is this path staged?", and they disagreed
 * whenever the rendered form was ambiguous.
 *
 * These tests pin the property that makes `pathKey` the right function for
 * identity: it distinguishes paths that render identically.
 */

const edit = (path: SavePath, after: JsonValue): SaveEdit => ({
	id: editId(path, after),
	label: formatPath(path),
	path,
	before: null,
	after,
});

/** A path containing a dot, and the two-segment path it renders like. */
const DOTTED_KEY: SavePath = ["a.b"];
const DOTTED_SEGMENTS: SavePath = ["a", "b"];

/** A key containing brackets, and the indexed path it renders like. */
const BRACKETED_KEY: SavePath = ["a[0]"];
const INDEXED: SavePath = ["a", 0];

describe("pathKey is an identity, formatPath is a rendering", () => {
	test("the two render identically", () => {
		// This is the whole problem, stated as a fact about the renderer rather
		// than as a suspicion: nothing here is wrong yet.
		expect(formatPath(DOTTED_KEY)).toBe(formatPath(DOTTED_SEGMENTS));
		expect(formatPath(BRACKETED_KEY)).toBe(formatPath(INDEXED));
	});

	test("but they are different keys", () => {
		expect(pathKey(DOTTED_KEY)).not.toBe(pathKey(DOTTED_SEGMENTS));
		expect(pathKey(BRACKETED_KEY)).not.toBe(pathKey(INDEXED));
	});

	test("an ordinary path is stable and unique", () => {
		expect(pathKey(["player", "gold"])).toBe(pathKey(["player", "gold"]));
		expect(pathKey(["player", "gold"])).not.toBe(pathKey(["player", "silver"]));
		// Order matters: these are different fields.
		expect(pathKey(["a", "b"])).not.toBe(pathKey(["b", "a"]));
	});
});

describe("editId", () => {
	test("is derived from the path and the value", () => {
		expect(editId(["gold"], 5)).toBe(editId(["gold"], 5));
		expect(editId(["gold"], 5)).not.toBe(editId(["gold"], 6));
		expect(editId(["gold"], 5)).not.toBe(editId(["silver"], 5));
	});

	test("separates two paths that render the same", () => {
		// The collision a display-derived id would have had.
		expect(editId(DOTTED_KEY, 1)).not.toBe(editId(DOTTED_SEGMENTS, 1));
	});
});

describe("stageEdits", () => {
	test("replaces an edit at the same path", () => {
		const staged = stageEdits([edit(["gold"], 1)], [edit(["gold"], 9)]);
		expect(staged).toHaveLength(1);
		expect(staged[0]?.after).toBe(9);
	});

	test("keeps two paths that render identically", () => {
		// Before this was fixed, keying by the rendered path would have collapsed
		// these into one edit and lost whichever was staged second.
		const staged = stageEdits(
			[edit(DOTTED_KEY, 1)],
			[edit(DOTTED_SEGMENTS, 2)],
		);
		expect(staged).toHaveLength(2);
	});
});

describe("withoutPath", () => {
	test("removes only the named path", () => {
		const edits = [edit(["gold"], 1), edit(["silver"], 2)];
		expect(withoutPath(edits, ["gold"])).toHaveLength(1);
		expect(withoutPath(edits, ["silver"])[0]?.path).toEqual(["gold"]);
	});

	test("does not remove a path that merely renders the same", () => {
		const edits = [edit(DOTTED_KEY, 1), edit(DOTTED_SEGMENTS, 2)];
		expect(withoutPath(edits, DOTTED_SEGMENTS)).toHaveLength(1);
		expect(withoutPath(edits, DOTTED_SEGMENTS)[0]?.path).toEqual(DOTTED_KEY);
	});
});

describe("applyEdits still agrees", () => {
	test("two edits at distinct-but-similar paths both apply", () => {
		// The end-to-end shape: if identity collapsed these, one would silently
		// overwrite the other on the way into the document.
		const before: JsonValue = { "a.b": 1, a: { b: 2 } };
		const applied = applyEdits(before, [
			edit(DOTTED_KEY, 10),
			edit(DOTTED_SEGMENTS, 20),
		]) as Record<string, unknown>;
		expect(applied["a.b"]).toBe(10);
		expect((applied.a as Record<string, unknown>).b).toBe(20);
	});
});
