import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import rawBirthdays from "../birthdays.json";
import type { IcsRecord } from "../ics";

const records = rawBirthdays as IcsRecord[];

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
		const stamps = new Set(records.map((record) => record.date.slice(0, 4)));
		expect(stamps.size).toBeGreaterThan(0);
		const expected = newestStamp(records);
		expect(expected).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		const dates = records.map((record) => record.date).sort();
		expect(dates.at(-1)?.slice(0, 10)).toBe(expected);
	});

	test("is stable when the data is unchanged, so a rebuild is clean", () => {
		expect(newestStamp(records)).toBe(newestStamp(records));
	});

	test("moves when a birthday's date changes, so a real edit is not lost", () => {
		const edited = records.map((record, index) =>
			index === 0 ? { ...record, date: "2099-12-31" } : record,
		);
		expect(newestStamp(edited)).toBe("2099-12-31");
		expect(newestStamp(edited)).not.toBe(newestStamp(records));
	});

	test("falls back to the epoch when there is nothing to stamp", () => {
		expect(new Date(`${newestStamp([])}T00:00:00Z`).getTime()).toBe(0);
	});

	test("the tracked file agrees with the data, so it is not a stale artefact", () => {
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
