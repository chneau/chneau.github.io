import { describe, expect, test } from "bun:test";
import { arrayAt, getAtPath, isJsonObject, type JsonValue } from "../../shared";
import { numberAt, objectAt } from "../../shared/save/json";
import { witcher3 } from "../lib/format";
import type { ReflectedValue } from "../lib/reflect";
import { experienceToNextLevel, readLevelCurve } from "../lib/stats";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

/**
 * The read-only character sheet: base stats, resistances and the XP curve.
 *
 * Three properties are asserted, and the third is the one that matters most:
 *
 *  1. Each field is **named through the save's own `MANU` table**, because an
 *     enum here is a 1-based index into it and the index differs per build —
 *     `CDS_PhysicalRes` is 90 on one fixture and 240 on the other.
 *  2. The values are the save's own, so a wrong projection fails rather than
 *     looking plausible.
 *  3. **Nothing writes them.** A projection nothing can edit is only safe if no
 *     action stages an edit on it, which is asserted rather than assumed.
 *
 * Experience-to-next-level is deliberately *not* in the document: no byte states
 * it. It is asserted to be derived at summary time instead.
 */

/**
 * The `stats` branch of a decoded document, or `null` when it is absent.
 *
 * A test helper rather than an inline `isJsonObject(x) ? x : null` at three call
 * sites, where the repeated conditional obscured what each assertion was doing.
 * `null` rather than `undefined` because that is what the `arrayAt`/`objectAt`
 * readers already treat as "absent".
 */
const branchOf = (value: JsonValue | undefined): JsonValue =>
	value === undefined || !isJsonObject(value) ? null : value;

/** The two fixtures and the level each is actually at. */
const FIXTURES = [
	{ name: "8559a", load: smallSave, level: 4, expUsed: 3000, expFree: 17 },
	{ name: "52586", load: largeSave, level: 7, expUsed: 6000, expFree: 702 },
] as const;

describe("the character sheet", () => {
	test(
		"names every resistance through the save's own name table",
		async () => {
			// The same resistance carries a different `MANU` index on each build, so
			// a reader that resolved an enum by ordinal would name most of these
			// wrongly on one of the two saves.
			for (const { name, load } of FIXTURES) {
				const resistances = objectAt(await witcher3.decode(load()), "stats");
				const rows = arrayAt(branchOf(resistances), "resistances");
				const named = (rows ?? [])
					.filter(isJsonObject)
					.map((row) => String(row.name));
				expect({
					name,
					count: rows?.length,
					firstThree: named.slice(0, 3),
					unnamed: named.filter((entry) => entry === "null" || entry === "")
						.length,
				}).toEqual({
					name,
					// Fourteen `ECharacterDefenseStats` members on both fixtures.
					count: 14,
					firstThree: ["CDS_PhysicalRes", "CDS_BleedingRes", "CDS_PoisonRes"],
					unnamed: 0,
				});
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"reports each resistance's fraction and the points behind it",
		async () => {
			// `percent` is what the character resists with; `points` is the
			// allocation feeding it. Both are reported because the save does not say
			// which one the HUD would show for a given damage type.
			const doc = await witcher3.decode(largeSave());
			const stats = objectAt(doc, "stats");
			const rows = arrayAt(branchOf(stats), "resistances");
			const rowNamed = (name: string): Record<string, unknown> | undefined => {
				const found = (rows ?? [])
					.filter(isJsonObject)
					.find((row) => row.name === name);
				return found === undefined ? undefined : { ...found };
			};
			// Read as the raw JSON the document holds, not through `numberAt`, which
			// reports a `null` as `undefined` — a distinction this test is about.
			expect(rowNamed("CDS_SlashingRes")).toEqual({
				name: "CDS_SlashingRes",
				// 0.3 as the reflected text renders it: the float is stored, so the
				// value is 0.30000001192092896 and rounding here would hide which.
				percent: 0.30000001192092896,
				// This save's `points` struct carries `valueMultiplicative=1` alone,
				// with no `valueBase`. Absent rather than 1, which would be a number
				// nothing in the record states.
				points: null,
			});
			// A resistance with nothing invested in it: absent, not zero.
			expect(rowNamed("CDS_ForceRes")).toEqual({
				name: "CDS_ForceRes",
				percent: null,
				points: null,
			});
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"carries the whole XP curve, keyed by the level each row describes",
		async () => {
			// The curve's first row is a sentinel (`number = -1`), so the rows are
			// *not* in level order and a lookup by index is off by one. The rows are
			// projected in the save's own order and identified by their own number.
			const doc = await witcher3.decode(largeSave());
			const stats = objectAt(doc, "stats");
			const rows = arrayAt(branchOf(stats), "levelCurve");
			expect({
				count: rows?.length,
				first: rows?.[0],
				second: rows?.[1],
				third: rows?.[2],
			}).toEqual({
				// 51 rows on both fixtures.
				count: 51,
				first: {
					level: -1,
					requiredTotalExp: -1,
					addedSkillPoints: 1,
					// The sentinel's whole point: it is the per-level increment for
					// levels *above* the table, which is what makes a New Game+
					// character's "XP to next level" derivable at all.
					requiredExp: 2000,
				},
				// No `requiredTotalExp` on this row in this save: a field at its
				// default is not written to the stream, so it is reported absent.
				second: {
					level: 1,
					requiredTotalExp: null,
					addedSkillPoints: null,
					requiredExp: null,
				},
				third: {
					level: 2,
					requiredTotalExp: 1000,
					addedSkillPoints: 1,
					requiredExp: 1,
				},
			});
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"derives experience-to-next-level in the summary, not in the document",
		async () => {
			// The point of this test is where the figure lives. No byte in the file
			// states "298 XP to level 8", so storing it would give the round-trip
			// check a field to compare against itself; it is computed in `summarise`
			// from the curve and the two counters.
			for (const { name, load, level, expUsed, expFree } of FIXTURES) {
				const doc = await witcher3.decode(load());
				expect({
					name,
					// Absent from the document entirely.
					inDocument: getAtPath(doc, ["stats", "toNextLevel"]) !== undefined,
					row: witcher3
						.summarise(doc)
						.find((entry) => entry.label === "To next level")?.value,
				}).toEqual({
					name,
					inDocument: false,
					// The curve adds 1000 per level on both fixtures, so what remains
					// is 1000 less the banked amount.
					row: `${1000 - expFree} XP`,
				});
				// The identity the arithmetic rests on, read out of the **document**
				// rather than from the fixture table: the experience counter's `used`
				// equals the curve's cumulative requirement for the character's own
				// level. This line used to be
				// `expect({ name, expUsed, level }).toEqual({ name, expUsed, level })`
				// — the same object on both sides, which is a test that cannot fail
				// and therefore tested nothing while claiming to check exactly this.
				const curve = (
					arrayAt(objectAt(doc, "stats"), "levelCurve") ?? []
				).filter(isJsonObject);
				const levelFromDocument = numberAt(doc, "level");
				const usedFromDocument = numberAt(objectAt(doc, "experience"), "used");
				const row = curve.find(
					(entry) => numberAt(entry, "level") === levelFromDocument,
				);
				expect({
					name,
					level: levelFromDocument,
					used: usedFromDocument,
					requiredTotalExp: numberAt(row ?? null, "requiredTotalExp"),
				}).toEqual({
					name,
					level,
					used: expUsed,
					requiredTotalExp: expUsed,
				});
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("refuses to derive the figure when the curve and the counter disagree", () => {
		// Unit-level, because no committed save is in this state — and the point
		// is that the check is *made* rather than assumed. A curve whose
		// `requiredTotalExp` does not match the experience counter means the
		// relation below does not hold, and a guess would be worse than nothing.
		// Wrapped the way the reader expects: `readLevelCurve` takes the *level
		// manager* and looks up its `levelDefinitions` member, so a bare array
		// here would find nothing and the test would pass for the wrong reason.
		const scalar = (text: string): ReflectedValue => ({
			kind: "scalar",
			type: "Int32",
			width: 4,
			text,
		});
		const row = (level: string, total: string): ReflectedValue => ({
			kind: "struct",
			type: "SLevelDefinition",
			width: 0,
			text: "",
			fields: [
				{ name: "number", offset: 0, value: scalar(level) },
				{ name: "requiredTotalExp", offset: 0, value: scalar(total) },
			],
		});
		const curve = readLevelCurve({
			kind: "struct",
			type: "W3LevelManager",
			width: 0,
			text: "",
			fields: [
				{
					name: "levelDefinitions",
					offset: 0,
					value: {
						kind: "array",
						type: "array:2,0,SLevelDefinition",
						width: 0,
						text: "",
						count: 2,
						items: [row("7", "6000"), row("8", "7000")],
					},
				},
			],
		});
		expect({
			// The lookup is by each row's own `number`, so a two-row curve
			// positioned off-by-one would still resolve level 7 correctly.
			levels: curve.map((entry) => entry.level),
			agrees: experienceToNextLevel(curve, 7, { free: 702, used: 6000 }),
			disagrees: experienceToNextLevel(curve, 7, { free: 702, used: 1234 }),
			noExperience: experienceToNextLevel(curve, 7, null),
			noLevel: experienceToNextLevel(curve, null, { free: 702, used: 6000 }),
			offTheEnd: experienceToNextLevel(curve, 999, { free: 0, used: 0 }),
		}).toEqual({
			levels: [7, 8],
			agrees: 298,
			// `used` is not the level's requirement, so the identity fails and
			// nothing is claimed.
			disagrees: null,
			noExperience: null,
			noLevel: null,
			offTheEnd: null,
		});
	});

	test(
		"is read-only: no quick action writes any part of it",
		async () => {
			// The property that makes it safe to show. A projection nothing may edit
			// is only safe if *nothing* can edit it — the inspector stages an edit on
			// any leaf it renders, so the guarantee has to be that the writer ignores
			// these paths, and that is checked by asking every action what it stages.
			for (const { name, load } of FIXTURES) {
				const doc = await witcher3.decode(load());
				const staged = witcher3.actions.flatMap((action) =>
					action.plan(doc).map((entry) => ({
						action: action.id,
						path: entry.path,
					})),
				);
				expect({
					name,
					// `level` is a top-level field and *is* writable; the sheet is not.
					touchingStats: staged.filter((entry) => entry.path[0] === "stats"),
				}).toEqual({ name, touchingStats: [] });
			}
		},
		FIXTURE_TIMEOUT_MS,
	);
});
