import { describe, expect, test } from "bun:test";
import { parseBirthdaysJson } from "../manage-import";

/**
 * `parseBirthdaysJson` has three outcomes and one failure message cannot serve
 * all of them: the file was not JSON at all, or it was JSON the schema rejects.
 * The caller shows the user a notification from `reason`, so if "unreadable"
 * ever swallowed a schema failure — or the other way round — a mistyped hand-
 * edited file would be reported as corrupt instead of as wrong.
 *
 * The success path is asserted too, because deduplication happens inside the
 * parse: a file that collapses to one record must say so (`duplicateCount`)
 * rather than silently importing half of itself.
 */

const ada = { name: "Ada", date: "1815-12-10", kind: "♀️" } as const;
const alan = { name: "Alan", date: "1912-06-23", kind: "♂️" } as const;

describe("parseBirthdaysJson", () => {
	test("malformed JSON is unreadable, not invalid", () => {
		// A truncated file: the browser reads bytes, not JSON.
		expect(parseBirthdaysJson('[{"name": "Ada", "date":')).toEqual({
			ok: false,
			reason: "unreadable",
		});
	});

	test("an empty string is unreadable rather than an empty list", () => {
		expect(parseBirthdaysJson("")).toEqual({ ok: false, reason: "unreadable" });
	});

	test("JSON of the wrong shape is invalid", () => {
		expect(parseBirthdaysJson("not json at all")).toEqual({
			ok: false,
			reason: "unreadable",
		});
	});

	test("a record missing `name` is invalid, not unreadable", () => {
		const text = JSON.stringify([{ date: "1815-12-10", kind: "♀️" }]);
		expect(parseBirthdaysJson(text)).toEqual({ ok: false, reason: "invalid" });
	});

	test("one bad record invalidates the whole array", () => {
		// Zod validates the array as a whole, so a single malformed entry is a
		// schema failure and nothing is imported — not a partial import.
		const text = JSON.stringify([ada, { name: "Alan", date: "not-a-date" }]);
		expect(parseBirthdaysJson(text)).toEqual({ ok: false, reason: "invalid" });
	});

	test("valid JSON that is not an array is invalid", () => {
		expect(parseBirthdaysJson(JSON.stringify({ ada }))).toEqual({
			ok: false,
			reason: "invalid",
		});
	});

	test("a clean array imports every record with no duplicates", () => {
		const text = JSON.stringify([ada, alan]);
		expect(parseBirthdaysJson(text)).toEqual({
			ok: true,
			records: [ada, alan],
			duplicateCount: 0,
		});
	});

	test("an empty array is a valid import of nothing", () => {
		expect(parseBirthdaysJson("[]")).toEqual({
			ok: true,
			records: [],
			duplicateCount: 0,
		});
	});

	test("two records with one identity collapse to one and count one duplicate", () => {
		// Identity is the `(name, date)` pair, so even a differing `kind` — a
		// hand-edited twin — is the same birthday.
		const twin = { ...ada, kind: "♂️" } as const;
		const text = JSON.stringify([ada, twin, alan]);
		expect(parseBirthdaysJson(text)).toEqual({
			ok: true,
			records: [ada, alan],
			duplicateCount: 1,
		});
	});

	test("the first record of a repeated identity is the one kept", () => {
		// `dedupeRecords` keeps the first occurrence, so the surviving `kind`
		// tells the two orderings apart.
		const twin = { ...ada, kind: "♂️" } as const;
		const kept = parseBirthdaysJson(JSON.stringify([ada, twin]));
		expect(kept.ok).toBe(true);
		if (kept.ok) expect(kept.records[0]?.kind).toBe("♀️");
	});

	test("the three outcomes stay distinguishable from one text each", () => {
		// The property the notification depends on: one malformed byte, one
		// schema violation and one repeated identity produce three different
		// results rather than one "import failed" branch.
		const outcomes = [
			parseBirthdaysJson("{"),
			parseBirthdaysJson(JSON.stringify([{ date: "1815-12-10" }])),
			parseBirthdaysJson(JSON.stringify([ada, ada])),
		];
		expect(outcomes.map((outcome) => outcome.ok)).toEqual([false, false, true]);
		expect(
			outcomes.map((outcome) => (outcome.ok ? "ok" : outcome.reason)),
		).toEqual(["unreadable", "invalid", "ok"]);
	});
});
