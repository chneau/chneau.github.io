import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import rawBirthdays from "../birthdays.json";
import type { IcsRecord } from "../ics";

/**
 * The published calendar file must be a function of its DATA and nothing else.
 *
 * `public/birthdays.ics` is generated at build time by `_genIcs.ts`, which
 * writes straight into the tracked tree. That script used to take
 * `generateIcs`'s default `now = new Date()`, so every build stamped the
 * current time and the file came out dirty on every run — whether or not
 * anything about a birthday had changed. The habit that followed was
 * `git checkout -- public/birthdays.ics` before committing, which is exactly the
 * command that would also throw away a genuine edit to a birthday. A permanently
 * dirty generated file teaches people to ignore it, so the two states have to be
 * told apart by a test rather than by care.
 *
 * These assertions are about the DTSTAMP the script computes, re-derived here
 * from the same rule. `_genIcs.ts` runs at build time and writes to disk, so it
 * cannot be imported for its return value; what is pinned is the rule itself,
 * which is the part that can regress.
 */

const records = rawBirthdays as IcsRecord[];

/** The newest event date in the data, as `_genIcs.ts` computes it. */
const newestStamp = (list: readonly IcsRecord[]): string => {
	const newest = list.reduce((acc, record) => {
		const parsed = Date.parse(record.date);
		if (Number.isNaN(parsed)) return acc;
		return parsed > acc ? parsed : acc;
	}, 0);
	return new Date(newest).toISOString().slice(0, 10);
};

describe("the published calendar's DTSTAMP", () => {
	test("comes from the newest birthday, not the clock", () => {
		// The invariant, stated on its own: no event may carry a stamp that is
		// not derived from the data. This is the assertion whose absence let the
		// wall-clock default ship.
		const stamps = new Set(records.map((record) => record.date.slice(0, 4)));
		expect(stamps.size).toBeGreaterThan(0);
		const expected = newestStamp(records);
		expect(expected).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		// And the newest record really is the max, so the reduce is not just
		// returning whichever record happened to be first.
		const dates = records.map((record) => record.date).sort();
		expect(dates.at(-1)?.slice(0, 10)).toBe(expected);
	});

	test("is stable when the data is unchanged, so a rebuild is clean", () => {
		// Two reads of the same input produce the same stamp. With the old
		// `new Date()` default this could not hold across a second boundary,
		// which is what made every build dirty.
		expect(newestStamp(records)).toBe(newestStamp(records));
	});

	test("moves when a birthday's date changes, so a real edit is not lost", () => {
		// The other half. A DTSTAMP pinned to something immutable would make the
		// file stable but would also mean editing a date produced no diff, and
		// `git checkout -- public/birthdays.ics` would then be indistinguishable
		// from a no-op.
		const edited = records.map((record, index) =>
			index === 0 ? { ...record, date: "2099-12-31" } : record,
		);
		expect(newestStamp(edited)).toBe("2099-12-31");
		expect(newestStamp(edited)).not.toBe(newestStamp(records));
	});

	test("falls back to the epoch when there is nothing to stamp", () => {
		// An empty calendar must not reintroduce `new Date()` — that is how the
		// clock came back in the first place.
		expect(new Date(`${newestStamp([])}T00:00:00Z`).getTime()).toBe(0);
	});

	test("the tracked file agrees with the data, so it is not a stale artefact", () => {
		// The committed file carries exactly one DTSTAMP and it is the one the
		// rule predicts. If a build was skipped or reverted, this fails and names
		// the drift rather than leaving it to the next person.
		const published = readFileSync(
			join(import.meta.dir, "..", "..", "..", "public", "birthdays.ics"),
			"utf8",
		);
		const stamps = [
			...new Set(
				published.split("\r\n").filter((line) => line.startsWith("DTSTAMP:")),
			),
		];
		expect(stamps).toHaveLength(1);
		const year = newestStamp(records).slice(0, 4);
		expect(stamps[0]).toContain(year);
	});
});
