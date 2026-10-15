import { describe, expect, test } from "bun:test";
import TIMETABLE from "../data/timetable.json";
import { TrainServicesSchema } from "../data/types";

const mutated = (): Record<string, unknown>[] =>
	structuredClone(TIMETABLE) as Record<string, unknown>[];

const firstRow = (rows: Record<string, unknown>[]): Record<string, unknown> => {
	const row = rows[0];
	if (row === undefined) {
		throw new Error("the timetable fixture has no first row to mutate");
	}
	return row;
};

const secondRow = (
	rows: Record<string, unknown>[],
): Record<string, unknown> => {
	const row = rows[1];
	if (row === undefined) {
		throw new Error("the timetable fixture has no second row to mutate");
	}
	return row;
};

describe("the committed timetable", () => {
	test("satisfies the schema it is now parsed with", () => {
		const result = TrainServicesSchema.safeParse(TIMETABLE);
		expect(result.success).toBe(true);
		expect(TIMETABLE.length).toBeGreaterThan(100);
	});

	test("rejects an unknown category", () => {
		const rows = mutated();
		firstRow(rows).category = "NotACategory";
		expect(TrainServicesSchema.safeParse(rows).success).toBe(false);
	});

	test("rejects a duplicated service id", () => {
		const rows = mutated();
		secondRow(rows).id = firstRow(rows).id;
		const result = TrainServicesSchema.safeParse(rows);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toContain("duplicate service id");
		}
	});

	test("rejects a coordinate that is not a two-number tuple", () => {
		const rows = mutated();
		(firstRow(rows).pathCoordinates as unknown[]) = [["a", "b"]];
		expect(TrainServicesSchema.safeParse(rows).success).toBe(false);
	});

	test("accepts a null arrival offset, which a terminus has", () => {
		const rows = mutated();
		const calls = rows[0]?.calls as Record<string, unknown>[];
		expect(calls.some((call) => call.arrivalOffset === null)).toBe(true);
		expect(TrainServicesSchema.safeParse(rows).success).toBe(true);
	});
});
