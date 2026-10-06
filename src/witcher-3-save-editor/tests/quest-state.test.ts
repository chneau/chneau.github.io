/**
 * Which quest state is the game's, and which is a guess — asserted on the
 * document itself.
 *
 * `quests[].state` was the fact-name heuristic wearing the field name of a
 * fact, and a reader of the JSON — a UI or a person — had no way to tell it from
 * the game's own journal. It is now `inferredState`, and the journal's
 * authoritative answer lives in `journal.quests[]` **only**.
 *
 * There is deliberately no `journalStatus` on a quest row. It was a materialised
 * copy of `journal.quests[].rollup` — the same fact stored twice, which this
 * codebase forbids — and the summary read that copy for one row and the journal's
 * own copy for another, so editing either through the inspector made the two
 * summary rows contradict each other. The join is now computed in `summarise`,
 * and the last test here asserts that editing the journal moves both rows
 * together rather than one of them.
 *
 * The counts asserted here are measured, not asserted from the task: the journal
 * is a partial view of the quests, so most of what this suite protects is the
 * **absence** — 17 of 43 quests on the larger fixture have no journal entry at
 * all, and a join that filled those in from `inferredState` would be
 * indistinguishable from a real reading.
 */
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

/** One `quests[]` row, read through narrowing helpers rather than a cast. */
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

/** The journal's roll-up per quest id, which is the only place it is stored. */
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

/**
 * Quests both readings cover: the journal classified it (so not `unresolved`, and
 * not absent) and the fact side has a row for the same id.
 */
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

/** Quest ids the journal has at least one attributed entry for. */
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
		/** no journal entry: `sq107`, `mq1060`, `q504` */
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

				// The rename is the point of the change: a field called `state` in a
				// saved game reads as the game's state, and no comment travels with
				// the JSON a UI renders.
				const raw = arrayAt(doc, "quests") ?? [];
				for (const row of raw) {
					const object = asObject(row);
					expect(Object.keys(object)).not.toContain("state");
					expect(typeof stringAt(object, "inferredState")).toBe("string");
				}
				expect(raw.length).toBe(fixture.quests);

				// No `journalStatus` on a quest row: the journal's answer is stored
				// once, in `journal.quests[].rollup`, and the join is computed.
				for (const row of raw) {
					expect(Object.keys(asObject(row))).not.toContain("journalStatus");
				}

				// The journal's own branch is where the roll-up lives, and every
				// value in it is one of the five the codec knows.
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

				// The join is over the journal's list, and the fact side covers
				// `comparable` of them. The difference from the journal's total is the
				// journal quests with no fact-side row.
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
				// Existing rows are untouched by this change; asserted against the
				// document's own field so a rewrite of `summarise` cannot quietly
				// drop one.
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
				// The comparison is over the whole serialised document, so
				// `inferredState` is held to being a pure function of the bytes like
				// everything else in it.
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
			// The branch removed outright rather than nulled: the claim under test is
			// what a document *without* it produces, and `journal: null` would be a
			// document this codec never builds.
			const stripped = Object.fromEntries(
				Object.entries(asObject(doc)).filter(([key]) => key !== "journal"),
			);
			const rows = witcher3.summarise(stripped);
			expect(objectAt(stripped, "journal")).toBeUndefined();
			// Omitted rather than zeroed: "0 quests recorded" would be a statement
			// about the player's progress that nothing in this document supports, and
			// the summary already has that rule for `Skill points`.
			expect(rows.some((row) => row.label === "Quests in journal")).toBe(false);
			expect(
				rows.some((row) => row.label === "Journal vs inferred state"),
			).toBe(false);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("editing the journal moves both summary rows together, not one of them", () => {
		// The regression that removing `quests[].journalStatus` fixes. While that
		// field existed, the "succeeded" count read `journal.quests[].rollup` and the
		// disagreement count read the fact-side copy, so changing one made the two
		// rows describe different documents: the first said 17 succeeded while the
		// second still counted against 18-worth of data. Both rows are now computed
		// over `journal.quests`, so one edit has to move both.
		const quests: readonly JsonValue[] = [
			{ id: "q1", inferredState: "in-progress", done: 0, total: 1 },
		];
		const journal = (rollup: string): JsonValue => ({
			entries: 1,
			statuses: [],
			unattributed: { emptyResource: 0, nonQuestResource: 0 },
			questCount: 1,
			quests: [{ id: "q1", rollup, contested: false, statuses: [] }],
			collections: [],
			sample: [],
			sampleTruncated: false,
		});

		// `succeeded` while the heuristic says in progress: one disagreement.
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

		// Flip the journal's roll-up to `active`, which the heuristic also says:
		// both rows must move. Only one did before the fix.
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
		// `"unresolved"` means the journal's own status name was not one this codec
		// knows — absence of a reading, exactly like a missing entry, and not a
		// verdict. Counting it as a disagreement would have overstated the gap on
		// every quest carrying a fifth `JS_*` name that a future build introduces.
		const rows = witcher3.summarise({
			saveVersion: "66/29/164",
			items: [],
			quests: [{ id: "q1", inferredState: "in-progress", done: 0, total: 1 }],
			journal: {
				entries: 1,
				statuses: [],
				unattributed: { emptyResource: 0, nonQuestResource: 0 },
				questCount: 1,
				quests: [{ id: "q1", rollup: "unresolved", contested: false }],
				collections: [],
				sample: [],
				sampleTruncated: false,
			},
		});
		// Recorded, because the journal does have an entry for it.
		expect(rows.find((r) => r.label === "Quests in journal")?.value).toBe(
			"1 recorded, 0 succeeded",
		);
		// But not comparable, so not a disagreement.
		expect(
			rows.find((r) => r.label === "Journal vs inferred state")?.value,
		).toBe("no quest in both readings");
	});
});
