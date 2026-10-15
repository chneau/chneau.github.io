import { describe, expect, test } from "bun:test";
import { parseBirthdaysJson } from "../manage-import";

const ada = { name: "Ada", date: "1815-12-10", kind: "♀️" } as const;
const alan = { name: "Alan", date: "1912-06-23", kind: "♂️" } as const;

describe("parseBirthdaysJson", () => {
	test("malformed JSON is unreadable, not invalid", () => {
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
		const twin = { ...ada, kind: "♂️" } as const;
		const text = JSON.stringify([ada, twin, alan]);
		expect(parseBirthdaysJson(text)).toEqual({
			ok: true,
			records: [ada, alan],
			duplicateCount: 1,
		});
	});

	test("the first record of a repeated identity is the one kept", () => {
		const twin = { ...ada, kind: "♂️" } as const;
		const kept = parseBirthdaysJson(JSON.stringify([ada, twin]));
		expect(kept.ok).toBe(true);
		if (kept.ok) expect(kept.records[0]?.kind).toBe("♀️");
	});

	test("the three outcomes stay distinguishable from one text each", () => {
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
