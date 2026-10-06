import { describe, expect, test } from "bun:test";
import { isJsonObject, type JsonValue, verifyRoundTrip } from "../../shared";
import {
	arrayAt,
	collectLeaves,
	numberAt,
	objectAt,
} from "../../shared/save/json";
import { witcher3 } from "../lib/format";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

/**
 * The four read-only features ported from the reference decoder, as one contract.
 *
 * Their own suites assert each module's numbers against the bytes. What is checked
 * *here* is the property that only exists once they are in the projection, and
 * which any of them could break without noticing:
 *
 *  1. **The rebuild reads back.** The workbench proves a save by encoding it,
 *     decoding the result and comparing the *whole* serialised document. Four new
 *     branches is four more chances for a field to be a function of something other
 *     than the bytes, and this is the check that catches it.
 *  2. **Nothing writes them.** The inspector stages an edit on any leaf it renders,
 *     so a read-only projection is only safe if no action and no encoder path
 *     touches it. Asked of every action, on both fixtures.
 *  3. **No offset leaks.** Asserted by name, because a stored address would be
 *     wrong for any other save of the same build.
 */

const FIXTURES = [
	{ name: "8559a", load: smallSave },
	{ name: "52586", load: largeSave },
] as const;

/** The branch at `key`, or `null` when the document lacks it. */
const branchOf = (doc: JsonValue, key: string): JsonValue => {
	const branch = objectAt(doc, key);
	return branch === undefined || !isJsonObject(branch) ? null : branch;
};

describe("the read-only ported features", () => {
	test(
		"survive a rebuild on both fixtures",
		async () => {
			for (const { name, load } of FIXTURES) {
				const file = load();
				const doc = await witcher3.decode(file);
				const verdict = await verifyRoundTrip(witcher3, file, doc, false);
				expect({ name, kind: verdict.kind }).toEqual({
					name,
					// `semantic`, never `identical`: re-encoding does not reproduce the
					// game's own LZ4 output, which ADR-0007 records.
					kind: "semantic",
				});
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"are populated with this save's own figures",
		async () => {
			for (const { name, load } of FIXTURES) {
				const doc = await witcher3.decode(load());
				expect({
					name,
					dialogBlocks: numberAt(branchOf(doc, "dialogues"), "blockCount"),
					attitudeRows: numberAt(branchOf(doc, "attitudes"), "groupCount"),
					booksRead: numberAt(
						branchOf(branchOf(doc, "unlocks"), "booksRead"),
						"count",
					),
					entities: numberAt(branchOf(doc, "entities"), "entities"),
					journalEntries: numberAt(branchOf(doc, "journal"), "entries"),
					// `journal.quests.length`, not a `questCount` field: there is no
					// such field, because it was a copy of this length.
					journalQuests: arrayAt(branchOf(doc, "journal"), "quests")?.length,
					questStepQuests: arrayAt(doc, "questSteps")?.length,
				}).toEqual({
					name,
					dialogBlocks: name === "8559a" ? 21 : 152,
					attitudeRows: name === "8559a" ? 927 : 958,
					booksRead: name === "8559a" ? 11 : 108,
					entities: name === "8559a" ? 640 : 6525,
					journalEntries: name === "8559a" ? 296 : 972,
					journalQuests: name === "8559a" ? 8 : 29,
					questStepQuests: name === "8559a" ? 10 : 43,
				});
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"are read-only: no quick action writes into any of them",
		async () => {
			for (const { name, load } of FIXTURES) {
				const doc = await witcher3.decode(load());
				const branches = [
					"dialogues",
					"attitudes",
					"unlocks",
					"entities",
					"questSteps",
					"stats",
				];
				const touching = witcher3.actions.flatMap((action) =>
					action
						.plan(doc)
						.map((edit) => edit.path[0])
						.filter((segment) => branches.includes(String(segment)))
						.map((segment) => `${action.id} -> ${String(segment)}`),
				);
				expect({ name, touching }).toEqual({ name, touching: [] });
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"carry no byte offset, and do not echo an unresolved quest id as a title",
		async () => {
			// The second half is the honesty rule: `questTitle` returns `undefined`
			// for 10 of 43 quest ids on the large fixture, and the projection must
			// render `null` there. A UI that cannot tell "no title known" from "the
			// title is mq1036" shows the id as though the game had written it.
			const doc = await witcher3.decode(largeSave());

			// No address reaches the document. Walked leaf by leaf rather than
			// searching the serialised text for digit runs: a blanket 7-digit pattern
			// over the JSON also matches digits *inside strings* — twelve of them here
			// — and reports a leak that does not exist. Every number at or above a
			// million is listed, so the one legitimate value shows up as itself
			// instead of being excused by a threshold.
			const large = collectLeaves(doc).filter(
				(leaf) => typeof leaf.value === "number" && leaf.value >= 1_000_000,
			);
			expect({
				large: large.map(
					(leaf) => `${leaf.path.join(".")}=${String(leaf.value)}`,
				),
			}).toEqual({
				// Both are **sizes**, not positions, and both are deliberate: the
				// decompressed payload length and the chunk unit a resizing edit
				// re-splits by. A byte offset in this format is a seven-digit address
				// like 3,640,999 or 12,932,081, and none appears.
				large: [
					"container.payloadBytes=5108325",
					"container.chunkBytes=1048576",
				],
			});

			const steps = (arrayAt(doc, "questSteps") ?? []).filter(isJsonObject);
			expect({
				nullTitles: steps.filter((quest) => quest.title === null).length,
				// A title that is neither a string nor `null` would mean the
				// projection let an `undefined` through into the document.
				otherTitles: steps.filter(
					(quest) => typeof quest.title !== "string" && quest.title !== null,
				).length,
			}).toEqual({ nullTitles: 10, otherTitles: 0 });
		},
		FIXTURE_TIMEOUT_MS,
	);
});
