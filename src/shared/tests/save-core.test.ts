/**
 * Contracts for the save-editing primitives.
 *
 * These are the functions every codec on the site is written against, so the
 * tests are about behaviour a codec relies on rather than about any one
 * format: that a path addresses what it claims to, that an edit never mutates
 * the document it came from, that a revert truly restores, and that the
 * round-trip check refuses to pass a rebuild that does not read back.
 */
import { describe, expect, test } from "bun:test";
import {
	applyEdits,
	effectiveEdits,
	isEffective,
	previewValue,
	stageEdits,
	withoutPath,
} from "../save/edits";
import {
	collectLeaves,
	formatPath,
	getAtPath,
	type JsonValue,
	setAtPath,
} from "../save/json";
import { describeVerdict, verifyRoundTrip } from "../save/roundtrip";
import type { SaveEdit } from "../save/types";

const SAMPLE: JsonValue = {
	player: { name: "Vex", level: 12, gold: 480 },
	inventory: [
		{ id: "sword", count: 1 },
		{ id: "potion", count: 3 },
	],
	flags: { tutorialDone: true, boss: null },
};

describe("getAtPath", () => {
	test("reads nested object keys and array indices", () => {
		expect(getAtPath(SAMPLE, ["player", "level"])).toBe(12);
		expect(getAtPath(SAMPLE, ["inventory", 1, "count"])).toBe(3);
	});

	test("an empty path is the document itself", () => {
		expect(getAtPath(SAMPLE, [])).toBe(SAMPLE);
	});

	test("a missing key is undefined, not a throw", () => {
		expect(getAtPath(SAMPLE, ["player", "mana"])).toBeUndefined();
		expect(getAtPath(SAMPLE, ["player", "gold", "deeper"])).toBeUndefined();
	});

	test("indexing an object or keying an array does not silently succeed", () => {
		expect(getAtPath(SAMPLE, ["player", 0])).toBeUndefined();
		expect(getAtPath(SAMPLE, ["inventory", "length"])).toBeUndefined();
	});
});

describe("setAtPath", () => {
	test("writes without mutating the original", () => {
		const before = JSON.stringify(SAMPLE);
		const next = setAtPath(SAMPLE, ["player", "gold"], 9999);
		expect(JSON.stringify(SAMPLE)).toBe(before);
		expect(getAtPath(next, ["player", "gold"])).toBe(9999);
	});

	test("replacing a whole array element", () => {
		const next = setAtPath(SAMPLE, ["inventory", 0], {
			id: "axe",
			count: 1,
		});
		expect(getAtPath(next, ["inventory", 0, "id"])).toBe("axe");
		// The sibling entry is untouched, which is the copy-on-write property.
		expect(getAtPath(next, ["inventory", 1, "count"])).toBe(3);
	});

	test("refuses to invent a key the save never had", () => {
		expect(() => setAtPath(SAMPLE, ["player", "mana"], 10)).toThrow(
			/not present/,
		);
	});

	test("refuses an array index the save never had, rather than padding it", () => {
		// The object case above was covered from the start; the array case was not,
		// and it did not throw. `setAtPath` wrote the index anyway, so the engine
		// extended the array and filled the gap with `null` — the exact "invent a
		// key the game never wrote" the function's own doc warns about. Worse, the
		// round-trip check cannot see it: the invented holes are in the document it
		// compares the rebuild against, so a codec that serialises the document
		// directly reports `semantic` and offers the corrupted file.
		const inventory = getAtPath(SAMPLE, ["inventory"]);
		const length = Array.isArray(inventory) ? inventory.length : -1;
		expect(() => setAtPath(SAMPLE, ["inventory", length + 3], null)).toThrow(
			/not present/,
		);
		// Exactly at the end is the same thing: not a path, and an append by another
		// name. Inventing an element that way is still inventing it.
		expect(() => setAtPath(SAMPLE, ["inventory", length], null)).toThrow(
			/not present/,
		);
		// It throws rather than padding, so the original is untouched either way.
		expect(getAtPath(SAMPLE, ["inventory"])).toHaveLength(length);
	});

	test("an empty path replaces the document", () => {
		expect(setAtPath(SAMPLE, [], { fresh: true })).toEqual({ fresh: true });
	});
});

describe("formatPath", () => {
	test("brackets indices so they cannot read as part of a key", () => {
		expect(formatPath(["inventory", 0, "count"])).toBe("inventory[0].count");
		expect(formatPath(["player", "gold"])).toBe("player.gold");
	});
});

describe("collectLeaves", () => {
	test("finds every scalar, including null and false", () => {
		const paths = collectLeaves(SAMPLE).map((leaf) => formatPath(leaf.path));
		expect(paths).toContain("flags.tutorialDone");
		expect(paths).toContain("flags.boss");
		expect(paths).toContain("inventory[1].count");
	});

	test("refuses to descend past the depth cap", () => {
		// A save is data from someone's disk, so a recursive walk must not be
		// able to be made to blow the stack.
		let deep: JsonValue = 1;
		for (let index = 0; index < 200; index += 1) deep = { next: deep };
		expect(() => collectLeaves(deep, 8)).not.toThrow();
		expect(collectLeaves(deep, 8)).toHaveLength(0);
	});
});

const editAt = (
	path: readonly (string | number)[],
	after: JsonValue,
): SaveEdit => ({
	id: `${JSON.stringify(path)}=${JSON.stringify(after)}`,
	label: formatPath(path),
	path,
	before: getAtPath(SAMPLE, path) ?? null,
	after,
});

describe("edits", () => {
	const gold = editAt(["player", "gold"], 9999);
	const level = editAt(["player", "level"], 99);

	test("apply in the order they were staged", () => {
		const result = applyEdits(SAMPLE, [gold, level]);
		expect(getAtPath(result, ["player", "gold"])).toBe(9999);
		expect(getAtPath(result, ["player", "level"])).toBe(99);
	});

	test("staging the same path twice replaces rather than stacks", () => {
		const once = stageEdits([], [gold]);
		const twice = stageEdits(once, [editAt(["player", "gold"], 1)]);
		expect(twice).toHaveLength(1);
		expect(getAtPath(applyEdits(SAMPLE, twice), ["player", "gold"])).toBe(1);
	});

	test("reverting a path restores the value the save held", () => {
		// Two edits to one field: reverting must land on the original, not on
		// the intermediate value.
		const first = editAt(["player", "gold"], 100);
		const second = editAt(["player", "gold"], 200);
		const kept = withoutPath([first, second], ["player", "gold"]);
		expect(getAtPath(applyEdits(SAMPLE, kept), ["player", "gold"])).toBe(480);
	});

	test("an edit that changes nothing is not effective", () => {
		const noop = editAt(["player", "level"], 12);
		expect(isEffective(noop, SAMPLE)).toBe(false);
		expect(effectiveEdits([gold, noop], SAMPLE)).toHaveLength(1);
	});

	test("previewValue stays short for large values", () => {
		expect(previewValue("x".repeat(500))).toContain("…");
		expect(previewValue([1, 2, 3])).toBe("[3 items]");
		expect(previewValue({ a: 1 })).toBe("{1 field}");
	});
});

describe("verifyRoundTrip", () => {
	const identity = {
		decode: async (bytes: Uint8Array) =>
			JSON.parse(new TextDecoder().decode(bytes)) as JsonValue,
		encode: async (doc: JsonValue) =>
			new TextEncoder().encode(JSON.stringify(doc)),
	};

	test("an untouched save that rebuilds exactly is reported as identical", async () => {
		const bytes = new TextEncoder().encode(JSON.stringify(SAMPLE));
		const verdict = await verifyRoundTrip(identity, bytes, SAMPLE, false);
		expect(verdict.kind).toBe("identical");
	});

	test("a rebuild that decodes to different values is refused", async () => {
		// Encodes something that decodes cleanly but to the wrong document —
		// the exact defect a save editor must never hand over.
		const lying = {
			decode: identity.decode,
			encode: async () => new TextEncoder().encode('{"tampered":true}'),
		};
		const bytes = new TextEncoder().encode(JSON.stringify(SAMPLE));
		const verdict = await verifyRoundTrip(lying, bytes, SAMPLE, true);
		expect(verdict.kind).toBe("failed");
		if (verdict.kind === "failed") {
			expect(describeVerdict(verdict)).toMatch(/read back differently/);
		}
	});

	test("a rebuild that will not even decode is refused with the reason", async () => {
		const broken = {
			decode: async () => {
				throw new Error("bad magic");
			},
			encode: identity.encode,
		};
		const bytes = new TextEncoder().encode(JSON.stringify(SAMPLE));
		const verdict = await verifyRoundTrip(broken, bytes, SAMPLE, true);
		expect(verdict.kind).toBe("failed");
		if (verdict.kind === "failed") {
			expect(verdict.reason).toContain("bad magic");
		}
	});

	test("a semantically-equal but byte-different rebuild is allowed", async () => {
		const reordered = {
			decode: identity.decode,
			// Same document, different serialisation — a legitimate outcome once
			// anything has actually been edited.
			encode: async (doc: JsonValue) =>
				new TextEncoder().encode(JSON.stringify(doc, null, 1)),
		};
		const bytes = new TextEncoder().encode(JSON.stringify(SAMPLE));
		const verdict = await verifyRoundTrip(reordered, bytes, SAMPLE, true);
		expect(verdict.kind).toBe("semantic");
	});
});
