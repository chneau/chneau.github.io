/**
 * Which quest state is the game's, and which is a guess — asserted on the
 * document itself.
 *
 * `quests[].state` was the fact-name heuristic wearing the field name of a
 * fact, and a reader of the JSON — a UI or a person — had no way to tell it from
 * the game's own journal. Two rows in this document now say which is which:
 * `inferredState` (derived from `_done` / `_failed` / `_accepted` suffixes) and
 * `journalStatus` (the game's journal, authoritative).
 *
 * The counts asserted here are measured, not asserted from the task: the journal
 * is a partial view of the quests, so most of what this suite protects is the
 * **absence** — 17 of 43 quest rows on the larger fixture have no journal entry
 * at all, and a `journalStatus` that filled those in from `inferredState` would
 * be indistinguishable from a real reading.
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
	readonly journalStatus: string | undefined;
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
			// `null` is the document's "the journal says nothing", so it has to be
			// distinguished from an absent key rather than lost to `stringAt`.
			journalStatus: stringAt(object, "journalStatus"),
		};
	});
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

				// `null` exactly where the journal has no entry for that quest, and
				// a roll-up name everywhere else.
				const rows = questRows(doc);
				const ids = journalIds(doc);
				expect(ids.length).toBe(fixture.journalQuests);
				const nulls = rows.filter((row) => row.journalStatus === undefined);
				expect(nulls.length).toBe(fixture.unattributed);
				for (const row of nulls) expect(ids).not.toContain(row.id);
				for (const row of rows) {
					if (row.journalStatus === undefined) continue;
					expect(ids).toContain(row.id);
					expect([
						"succeeded",
						"failed",
						"active",
						"inactive",
						"unresolved",
					]).toContain(row.journalStatus);
				}
				// The `null` is a real field in the JSON, not a missing one: absent
				// would render the same as "the journal says nothing".
				for (const row of raw) {
					expect(Object.keys(asObject(row))).toContain("journalStatus");
				}
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
				// `inferredState` and `journalStatus` are held to being pure
				// functions of the bytes like everything else in it.
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
});
