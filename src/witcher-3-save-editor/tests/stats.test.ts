import { describe, expect, test } from "bun:test";
import { arrayAt, getAtPath, isJsonObject, type JsonValue } from "../../shared";
import { numberAt, objectAt } from "../../shared/save/json";
import { witcher3 } from "../lib/format";
import type { ReflectedValue } from "../lib/reflect";
import { experienceToNextLevel, readLevelCurve } from "../lib/stats";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

const branchOf = (value: JsonValue | undefined): JsonValue =>
	value === undefined || !isJsonObject(value) ? null : value;

const FIXTURES = [
	{ name: "8559a", load: smallSave, level: 4, expUsed: 3000, expFree: 17 },
	{ name: "52586", load: largeSave, level: 7, expUsed: 6000, expFree: 702 },
] as const;

describe("the character sheet", () => {
	test(
		"names every resistance through the save's own name table",
		async () => {
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
			const doc = await witcher3.decode(largeSave());
			const stats = objectAt(doc, "stats");
			const rows = arrayAt(branchOf(stats), "resistances");
			const rowNamed = (name: string): Record<string, unknown> | undefined => {
				const found = (rows ?? [])
					.filter(isJsonObject)
					.find((row) => row.name === name);
				return found === undefined ? undefined : { ...found };
			};
			expect(rowNamed("CDS_SlashingRes")).toEqual({
				name: "CDS_SlashingRes",
				percent: 0.30000001192092896,
				points: null,
			});
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
			const doc = await witcher3.decode(largeSave());
			const stats = objectAt(doc, "stats");
			const rows = arrayAt(branchOf(stats), "levelCurve");
			expect({
				count: rows?.length,
				first: rows?.[0],
				second: rows?.[1],
				third: rows?.[2],
			}).toEqual({
				count: 51,
				first: {
					level: -1,
					requiredTotalExp: -1,
					addedSkillPoints: 1,
					requiredExp: 2000,
				},
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
			for (const { name, load, level, expUsed, expFree } of FIXTURES) {
				const doc = await witcher3.decode(load());
				expect({
					name,
					inDocument: getAtPath(doc, ["stats", "toNextLevel"]) !== undefined,
					row: witcher3
						.summarise(doc)
						.find((entry) => entry.label === "To next level")?.value,
				}).toEqual({
					name,
					inDocument: false,
					row: `${1000 - expFree} XP`,
				});
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
			levels: curve.map((entry) => entry.level),
			agrees: experienceToNextLevel(curve, 7, { free: 702, used: 6000 }),
			disagrees: experienceToNextLevel(curve, 7, { free: 702, used: 1234 }),
			noExperience: experienceToNextLevel(curve, 7, null),
			noLevel: experienceToNextLevel(curve, null, { free: 702, used: 6000 }),
			offTheEnd: experienceToNextLevel(curve, 999, { free: 0, used: 0 }),
		}).toEqual({
			levels: [7, 8],
			agrees: 298,
			disagrees: null,
			noExperience: null,
			noLevel: null,
			offTheEnd: null,
		});
	});

	test(
		"is read-only: no quick action writes any part of it",
		async () => {
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
					touchingStats: staged.filter((entry) => entry.path[0] === "stats"),
				}).toEqual({ name, touchingStats: [] });
			}
		},
		FIXTURE_TIMEOUT_MS,
	);
});
