import { describe, expect, test } from "bun:test";
import TIMETABLE from "../data/timetable.json";
import { TrainServicesSchema } from "../data/types";

/**
 * The timetable boundary.
 *
 * `timetable.json` is generated and 325 records deep, and everything downstream
 * trusts its shape: `resolveServiceAtTime` interpolates along
 * `pathCoordinates`, the category counters index by `category`, search reads
 * `s.name` and `s.calls[].stationId`, and the canvas draws the polyline. It was a
 * bare `as TrainService[]` at the import site, so none of that was checked.
 *
 * These assert the two directions: the committed file really does satisfy the
 * schema, and the schema really does reject what it claims to.
 */

/** A deep copy, so a mutation cannot leak into the imported module. */
const mutated = (): Record<string, unknown>[] =>
	structuredClone(TIMETABLE) as Record<string, unknown>[];

describe("the committed timetable", () => {
	test("satisfies the schema it is now parsed with", () => {
		const result = TrainServicesSchema.safeParse(TIMETABLE);
		expect(result.success).toBe(true);
		// Non-vacuity: an empty or tiny fixture would pass the same assertion.
		expect(TIMETABLE.length).toBeGreaterThan(100);
	});

	test("rejects an unknown category", () => {
		// The failure a rename would produce. With the old cast, `categoryColors`
		// lookup would have returned undefined and the tile would have rendered
		// with no colour rather than failing.
		const rows = mutated();
		rows[0]!.category = "NotACategory";
		expect(TrainServicesSchema.safeParse(rows).success).toBe(false);
	});

	test("rejects a duplicated service id", () => {
		// `store.ts` resolves a deep link with `find`, which takes the first match
		// and reports nothing, so a duplicate id silently points a shared link at
		// the wrong service.
		const rows = mutated();
		rows[1]!.id = rows[0]?.id;
		const result = TrainServicesSchema.safeParse(rows);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toContain("duplicate service id");
		}
	});

	test("rejects a coordinate that is not a two-number tuple", () => {
		// `pathCoordinates` is read as `[lon, lat]` by the interpolator and
		// indexed at both ends, so a string or a triple is not a shape it survives.
		const rows = mutated();
		(rows[0]!.pathCoordinates as unknown[]) = [["a", "b"]];
		expect(TrainServicesSchema.safeParse(rows).success).toBe(false);
	});

	test("accepts a null arrival offset, which a terminus has", () => {
		// The first call of a service has `arrivalOffset: null`, so a schema that
		// demanded a number here would reject the whole file.
		const rows = mutated();
		const calls = rows[0]?.calls as Record<string, unknown>[];
		expect(calls.some((call) => call.arrivalOffset === null)).toBe(true);
		expect(TrainServicesSchema.safeParse(rows).success).toBe(true);
	});
});
