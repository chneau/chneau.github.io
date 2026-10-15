import { describe, expect, test } from "bun:test";
import {
	arrayAt,
	isJsonObject,
	type JsonValue,
	verifyRoundTrip,
} from "../../shared";
import { objectAt, stringAt } from "../../shared/save/json";
import { witcher3 } from "../lib/format";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

type QuestRow = {
	readonly id: string;
	readonly inferredState: string | undefined;
};

const asObject = (value: JsonValue): { readonly [key: string]: JsonValue } => {
	if (!isJsonObject(value)) throw new Error("expected a JSON object");
	return value;
};

const questRows = (doc: JsonValue): readonly QuestRow[] => {
	const rows = arrayAt(doc, "quests") ?? [];
	return rows.map((row) => {
		const object = asObject(row);
		return {
			id: stringAt(object, "id") ?? "",
			inferredState: stringAt(object, "inferredState"),
		};
	});
};

const rollupById = (doc: JsonValue): ReadonlyMap<string, string> => {
	const entries = (arrayAt(objectAt(doc, "journal"), "quests") ?? [])
		.map((row) => {
			const object = asObject(row);
			const id = stringAt(object, "id");
			const rollup = stringAt(object, "rollup");
			return id === undefined || rollup === undefined
				? undefined
				: ([id, rollup] as const);
		})
		.filter((entry): entry is readonly [string, string] => entry !== undefined);
	return new Map(entries);
};

const comparableCount = (doc: JsonValue): number => {
	const inferred = new Map(
		questRows(doc).map((row) => [row.id, row.inferredState]),
	);
	let count = 0;
	for (const [id, rollup] of rollupById(doc)) {
		if (rollup === "unresolved") continue;
		if (inferred.get(id) !== undefined) count += 1;
	}
	return count;
};

const summaryValue = (doc: JsonValue, label: string): string | undefined =>
	witcher3
		.summarise(doc)
		.find((row) => row.label === label)
		?.value.toString();

const journalIds = (doc: JsonValue): readonly string[] =>
	(arrayAt(objectAt(doc, "journal"), "quests") ?? [])
		.map((row) => stringAt(row, "id"))
		.filter((id): id is string => id !== undefined);

const FIXTURES = [
	{
		name: "8559a",
		load: smallSave,
		quests: 10,
		journalQuests: 8,
		unattributed: 3,
		succeeded: 7,
		disagreements: 2,
		comparable: 7,
	},
	{
		name: "52586",
		load: largeSave,
		quests: 43,
		journalQuests: 29,
		unattributed: 17,
		succeeded: 18,
		disagreements: 7,
		comparable: 26,
	},
] as const;

describe("quest state in the document", () => {
	for (const fixture of FIXTURES) {
		test(
			`${fixture.name}: the heuristic is named as inferred and the journal is joined to it`,
			async () => {
				const doc = await witcher3.decode(fixture.load());

				const raw = arrayAt(doc, "quests") ?? [];
				for (const row of raw) {
					const object = asObject(row);
					expect(Object.keys(object)).not.toContain("state");
					expect(typeof stringAt(object, "inferredState")).toBe("string");
				}
				expect(raw.length).toBe(fixture.quests);

				for (const row of raw) {
					expect(Object.keys(asObject(row))).not.toContain("journalStatus");
				}

				const rollups = [...rollupById(doc).values()];
				expect(rollups.length).toBe(fixture.journalQuests);
				for (const rollup of rollups) {
					expect([
						"succeeded",
						"failed",
						"active",
						"inactive",
						"unresolved",
					]).toContain(rollup);
				}

				expect(comparableCount(doc)).toBe(fixture.comparable);
				expect(journalIds(doc).length).toBe(fixture.journalQuests);
				expect(fixture.journalQuests - fixture.comparable).toBeLessThanOrEqual(
					fixture.unattributed,
				);
			},
			FIXTURE_TIMEOUT_MS,
		);

		test(
			`${fixture.name}: the summary carries this save's own journal figures`,
			async () => {
				const doc = await witcher3.decode(fixture.load());
				expect(summaryValue(doc, "Quests in journal")).toBe(
					`${fixture.journalQuests} recorded, ${fixture.succeeded} succeeded`,
				);
				expect(summaryValue(doc, "Journal vs inferred state")).toBe(
					`disagree on ${fixture.disagreements} of ${fixture.comparable}`,
				);
				expect(summaryValue(doc, "Save version")).toBe(
					stringAt(doc, "saveVersion"),
				);
			},
			FIXTURE_TIMEOUT_MS,
		);

		test(
			`${fixture.name}: the rebuild round-trips, new fields included`,
			async () => {
				const file = fixture.load();
				const doc = await witcher3.decode(file);
				const verdict = await verifyRoundTrip(witcher3, file, doc, false);
				expect(verdict.kind).toBe("semantic");
			},
			FIXTURE_TIMEOUT_MS,
		);

		test(
			`${fixture.name}: no quick action stages an edit into the quest data`,
			async () => {
				const doc = await witcher3.decode(fixture.load());
				for (const action of witcher3.actions) {
					for (const staged of action.plan(doc)) {
						expect(staged.path[0]).not.toBe("quests");
						expect(staged.path[0]).not.toBe("journal");
						expect(staged.path[0]).not.toBe("questSteps");
					}
				}
			},
			FIXTURE_TIMEOUT_MS,
		);
	}

	test(
		"a document with no journal branch gets no quest rows at all",
		async () => {
			const doc = await witcher3.decode(smallSave());
			const stripped = Object.fromEntries(
				Object.entries(asObject(doc)).filter(([key]) => key !== "journal"),
			);
			const rows = witcher3.summarise(stripped);
			expect(objectAt(stripped, "journal")).toBeUndefined();
			expect(rows.some((row) => row.label === "Quests in journal")).toBe(false);
			expect(
				rows.some((row) => row.label === "Journal vs inferred state"),
			).toBe(false);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("editing the journal moves both summary rows together, not one of them", () => {
		const quests: readonly JsonValue[] = [
			{ id: "q1", inferredState: "in-progress", done: 0, total: 1 },
		];
		const journal = (rollup: string): JsonValue => ({
			entries: 1,
			statuses: [],
			unattributed: { emptyResource: 0, nonQuestResource: 0 },
			quests: [{ id: "q1", rollup, contested: false, statuses: [] }],
			collections: [],
			sample: [],
			sampleTruncated: false,
		});

		const succeeded = witcher3.summarise({
			saveVersion: "66/29/164",
			items: [],
			quests,
			journal: journal("succeeded"),
		});
		expect(succeeded.find((r) => r.label === "Quests in journal")?.value).toBe(
			"1 recorded, 1 succeeded",
		);
		expect(
			succeeded.find((r) => r.label === "Journal vs inferred state")?.value,
		).toBe("disagree on 1 of 1");

		const active = witcher3.summarise({
			saveVersion: "66/29/164",
			items: [],
			quests,
			journal: journal("active"),
		});
		expect(active.find((r) => r.label === "Quests in journal")?.value).toBe(
			"1 recorded, 0 succeeded",
		);
		expect(
			active.find((r) => r.label === "Journal vs inferred state")?.value,
		).toBe("agree on all 1");
	});

	test("an unclassifiable journal roll-up is not a disagreement", () => {
		const rows = witcher3.summarise({
			saveVersion: "66/29/164",
			items: [],
			quests: [{ id: "q1", inferredState: "in-progress", done: 0, total: 1 }],
			journal: {
				entries: 1,
				statuses: [],
				unattributed: { emptyResource: 0, nonQuestResource: 0 },
				quests: [{ id: "q1", rollup: "unresolved", contested: false }],
				collections: [],
				sample: [],
				sampleTruncated: false,
			},
		});
		expect(rows.find((r) => r.label === "Quests in journal")?.value).toBe(
			"1 recorded, 0 succeeded",
		);
		expect(
			rows.find((r) => r.label === "Journal vs inferred state")?.value,
		).toBe("no quest in both readings");
	});
});
