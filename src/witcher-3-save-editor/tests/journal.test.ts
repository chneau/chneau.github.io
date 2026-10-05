/**
 * The journal read, asserted against both fixtures.
 *
 * Every figure below was measured by walking these two saves; where a number
 * quotes the brief rather than a walk it says so in the assertion's comment.
 *
 * The load-bearing assertions are the ones a *plausible* wrong reader would
 * fail: the entry count (not a declared count), the unattributable entries
 * (not attributed to some quest), the per-build fourth status appearing as its
 * own row, and the multi-status quests keeping both statuses visible rather than
 * collapsing to one label.
 */

import { describe, expect, test } from "bun:test";
import { decompressContainer } from "../lib/container";
import {
	JOURNAL_SAMPLE_LIMIT,
	readJournal,
	type SaveJournal,
} from "../lib/journal";
import { readNameTable } from "../lib/names";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

const journalOf = (load: () => Uint8Array): SaveJournal =>
	readJournal(decompressContainer(load()).data);

const statusCount = (journal: SaveJournal, status: string): number =>
	journal.statuses.find((row) => row.status === status)?.entries ?? 0;

const quest = (journal: SaveJournal, id: string) => {
	const found = journal.quests.find((q) => q.id === id);
	if (found === undefined) {
		throw new Error(`${id} has no journal entry on this save`);
	}
	return found;
};

describe("journal — the game's own quest record", () => {
	test(
		"the 8559a save's entry count and status rows, measured",
		() => {
			const journal = journalOf(smallSave);
			expect(journal.entries).toBe(296);
			// 155 + 139 + 2 = 296: the rows partition the entries rather than
			// sampling them, which is the check that no fourth name is being
			// folded away.
			expect(journal.statuses).toEqual([
				{ status: "JS_Success", entries: 155 },
				{ status: "JS_Active", entries: 139 },
				{ status: "JS_Inactive", entries: 2 },
			]);
			// This build's MANU has no JS_Failed at all, so the row cannot
			// exist here. Asserting its absence is the same assertion as the
			// 52586 presence: indices are per-build and neither list is fixed.
			expect(statusCount(journal, "JS_Failed")).toBe(0);
			// No status failed to resolve on either fixture: every `status`
			// index landed on a name in this save's own table. Were it otherwise
			// the row would read `JS_Unresolved` rather than vanish, and this
			// assertion is what says it never does.
			expect(statusCount(journal, "JS_Unresolved")).toBe(0);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"the 52586 save has a fourth status the 8559a table does not",
		() => {
			const journal = journalOf(largeSave);
			expect(journal.entries).toBe(972);
			// 354 + 587 + 24 + 7 = 972. `JS_Failed` is the fourth name; a reader
			// with three hardcoded fields loses those 7 entries silently, and
			// this row is what proves they are still counted.
			expect(journal.statuses).toEqual([
				{ status: "JS_Active", entries: 587 },
				{ status: "JS_Success", entries: 354 },
				{ status: "JS_Inactive", entries: 24 },
				{ status: "JS_Failed", entries: 7 },
			]);
			expect(statusCount(journal, "JS_Unresolved")).toBe(0);
			// Every one of those 7 `JS_Failed` entries is unattributable, so the
			// fourth status appears in the aggregate and in no quest at all. A
			// reader that only ever saw per-quest statuses would conclude this
			// build has no failed quest, which is not what the bytes say.
			const failed = journal.quests.filter((q) =>
				q.statuses.some((s) => s.status === "JS_Failed"),
			);
			expect(failed).toEqual([]);
			expect(journal.quests.some((q) => q.rollup === "failed")).toBe(false);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"the status rows sum to the entry count on both saves",
		() => {
			for (const load of [smallSave, largeSave]) {
				const journal = journalOf(load);
				const summed = journal.statuses.reduce(
					(total, row) => total + row.entries,
					0,
				);
				expect(summed).toBe(journal.entries);
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"most entries are unattributable and are not spread across quests",
		() => {
			const small = journalOf(smallSave);
			// Measured by walking the spans.
			expect(small.unattributed.emptyResource).toBe(202);
			expect(small.unattributed.nonQuestResource).toBe(83);
			// 11 entries attributed to 8 quests: the unattributable 285 must not
			// appear anywhere in the per-quest roll-up.
			const attributed = small.quests.reduce((n, q) => n + q.entries, 0);
			expect(attributed).toBe(11);
			expect(attributed).toBe(
				small.entries -
					small.unattributed.emptyResource -
					small.unattributed.nonQuestResource,
			);

			const large = journalOf(largeSave);
			expect(large.unattributed.emptyResource).toBe(650);
			expect(large.unattributed.nonQuestResource).toBe(285);
			expect(large.quests.reduce((n, q) => n + q.entries, 0)).toBe(37);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"an empty-head entry contributes a count, not a quest",
		() => {
			const journal = journalOf(smallSave);
			// 11 attributed entries on 8559a, all of which fit under the cap, so
			// the sample holds every one of them and each names a real quest.
			expect(journal.sample.length).toBe(11);
			expect(journal.sample.every((row) => row.questId !== undefined)).toBe(
				true,
			);
			// The empty-head path is reached at all: 202 of 296 entries carry no
			// resource, and they are counted rather than attributed.
			expect(journal.unattributed.emptyResource).toBe(202);
			for (const row of journal.sample) {
				expect(journal.quests.some((q) => q.id === row.questId)).toBe(true);
			}
			// `q309` is the one quest on 8559a the fact database never mentions,
			// and the one quest carrying `JS_Inactive`. It only exists here
			// because the journal is read directly.
			const q309 = quest(journal, "q309");
			expect(q309.statuses).toEqual([{ status: "JS_Inactive", entries: 1 }]);
			expect(q309.rollup).toBe("inactive");
			expect(q309.contested).toBe(false);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"a quest holding two statuses keeps both and is flagged contested",
		() => {
			for (const load of [smallSave, largeSave]) {
				const journal = journalOf(load);
				// `mq0003` is JS_Success *and* JS_Active on both saves: the game
				// holds an open entry for a quest it also records as succeeded.
				const mq0003 = quest(journal, "mq0003");
				expect(mq0003.entries).toBe(2);
				expect(mq0003.statuses).toEqual([
					{ status: "JS_Success", entries: 1 },
					{ status: "JS_Active", entries: 1 },
				]);
				expect(mq0003.contested).toBe(true);
				// The roll-up picks JS_Success by precedence; the flag is what
				// stops a caller reading that as "the game considers it closed".
				expect(mq0003.rollup).toBe("succeeded");

				const uncontested = quest(journal, "mq0001");
				expect(uncontested.statuses).toEqual([
					{ status: "JS_Success", entries: 1 },
				]);
				expect(uncontested.contested).toBe(false);
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"a repeated-status quest aggregates rather than repeating the row",
		() => {
			const journal = journalOf(largeSave);
			// Three entries, one status: the count is per-status, so this is one
			// row of 3 and not three rows of 1.
			const q002 = quest(journal, "q002");
			expect(q002.entries).toBe(3);
			expect(q002.statuses).toEqual([{ status: "JS_Success", entries: 3 }]);
			expect(q002.rollup).toBe("succeeded");
			expect(q002.contested).toBe(false);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"titles resolve through the catalogue or come back undefined",
		() => {
			const journal = journalOf(largeSave);
			expect(quest(journal, "mq0001").title).toBe("Missing in Action");
			// No `id` is ever echoed back as its own title: an unresolved title
			// is `undefined`, so a caller cannot mistake the id for a title.
			for (const q of journal.quests) {
				if (q.title !== undefined) expect(q.title).not.toBe(q.id);
			}
			// Measured: all 29 journal ids on this save resolve, while 10 of the
			// 43 *fact*-side ids do not. The journal side is the better covered of
			// the two, which is worth stating rather than leaving implied.
			expect(journal.quests.filter((q) => q.title === undefined)).toEqual([]);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"the unnamed guid collections are counted, not interpreted",
		() => {
			const small = journalOf(smallSave);
			const large = journalOf(largeSave);
			expect(small.collections.map((c) => c.name)).toEqual([
				"JHuntingClues",
				"JMonsterKnown",
				"JEntryAdvancedInfo",
			]);
			// Measured, per node name. Nothing here claims what a member *means*:
			// the collections carry counts and names and nothing else. Note that
			// the three do not share a shape — `JHuntingClues` holds `JHuntingClue`
			// records wrapping a `JHuntingQuestGuid`, while the other two hold bare
			// `*Guid` nodes — which is why this is grouped by name rather than
			// collapsed into one `guids` number.
			expect(small.collections).toEqual([
				{
					name: "JHuntingClues",
					nodes: 1,
					members: [
						{ name: "Size", count: 2 },
						{ name: "JHuntingClue", count: 1 },
						{ name: "JHuntingQuestGuid", count: 1 },
					],
				},
				{
					name: "JMonsterKnown",
					nodes: 1,
					members: [
						{ name: "guid", count: 1 },
						{ name: "JMonsterKnownGuid", count: 1 },
						{ name: "Size", count: 1 },
					],
				},
				{
					name: "JEntryAdvancedInfo",
					nodes: 1,
					members: [
						{ name: "guid", count: 11 },
						{ name: "JEntryAdvancedInfoGuid", count: 11 },
						{ name: "Size", count: 1 },
					],
				},
			]);
			expect(large.collections).toEqual([
				{
					name: "JHuntingClues",
					nodes: 1,
					members: [
						{ name: "Size", count: 20 },
						{ name: "JHuntingClue", count: 19 },
						{ name: "JHuntingQuestGuid", count: 19 },
					],
				},
				{
					name: "JMonsterKnown",
					nodes: 1,
					members: [
						{ name: "guid", count: 3 },
						{ name: "JMonsterKnownGuid", count: 3 },
						{ name: "Size", count: 1 },
					],
				},
				{
					name: "JEntryAdvancedInfo",
					nodes: 1,
					members: [
						{ name: "guid", count: 22 },
						{ name: "JEntryAdvancedInfoGuid", count: 22 },
						{ name: "Size", count: 1 },
					],
				},
			]);
			// And they are not quests: a collection contributes no quest row.
			expect(large.questCount).toBe(large.quests.length);
			expect(large.quests.some((q) => q.id.startsWith("JH"))).toBe(false);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"the sample is drawn from attributed entries, and the cap never engages",
		() => {
			// Measured, and worth stating plainly: neither fixture has more
			// attributed entries than the cap — 11 on `8559a`, 37 on `52586`
			// against a cap of 40 — so on both saves `sample` is the complete
			// attributed list and `sampleTruncated` is `false`. The cap is a
			// guard for a save holding more quests than these two do, not
			// behaviour either fixture exhibits, and this test says so rather
			// than implying a cut that never happens.
			for (const [load, expected] of [
				[smallSave, 11],
				[largeSave, 37],
			] as const) {
				const journal = journalOf(load);
				const attributed = journal.quests.reduce((n, q) => n + q.entries, 0);
				expect(attributed).toBe(expected);
				expect(attributed <= JOURNAL_SAMPLE_LIMIT).toBe(true);
				expect(journal.sample.length).toBe(attributed);
				expect(journal.sampleTruncated).toBe(false);

				// Every sampled row names a quest that exists, which is the point
				// of excluding the unattributable ones: 39 of the first 40 entries
				// of the walk are empty-head, so a sample over all entries would
				// be 97% rows with no id.
				expect(journal.sample.every((row) => row.questId !== undefined)).toBe(
					true,
				);
				for (const row of journal.sample) {
					expect(journal.quests.some((q) => q.id === row.questId)).toBe(true);
				}

				// And the unattributable entries are accounted for, not discarded:
				// the three partition `entries`.
				expect(journal.entries).toBe(
					attributed +
						journal.unattributed.emptyResource +
						journal.unattributed.nonQuestResource,
				);
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"nothing returned is a byte offset",
		() => {
			for (const load of [smallSave, largeSave]) {
				const journal = journalOf(load);
				// The save is megabytes long, so a leaked offset would be a
				// five- or six-digit number. Asserting the absence of every
				// offset-shaped key is the check that holds whatever the shape
				// of the result grows to.
				const walk = (value: unknown, path: string): void => {
					if (typeof value === "number") {
						expect(value).toBeLessThan(1_000_000);
						return;
					}
					if (Array.isArray(value)) {
						// A block-bodied arrow, not a concise one: `forEach` ignores a
						// return value, and an implicit `return walk(...)` reads as if it
						// mattered. `for…of` with `entries()` says the same thing and has
						// no return value to ignore.
						for (const [index, item] of value.entries()) {
							walk(item, `${path}[${index}]`);
						}
						return;
					}
					if (typeof value === "object" && value !== null) {
						for (const [key, child] of Object.entries(value)) {
							expect(key.toLowerCase()).not.toContain("offset");
							expect(key.toLowerCase()).not.toBe("size");
							expect(key.toLowerCase()).not.toContain("span");
							walk(child, `${path}.${key}`);
						}
					}
				};
				walk(journal, "journal");
				// And the offsets of the two fixtures themselves, so the bound
				// above is meaningful rather than vacuous.
				expect(decompressContainer(load()).data.length).toBeGreaterThan(
					1_000_000,
				);
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"precomputed names and roots give the same reading",
		() => {
			// `readObjectTree` takes only `data`, so a caller with a tree cannot
			// pass it to any other reader. This is the assertion that
			// `JournalSource` is a cost option and not a behaviour one.
			const data = decompressContainer(largeSave()).data;
			const names = readNameTable(data).names;
			const plain = readJournal(data);
			const shared = readJournal(data, { names });
			expect(shared).toEqual(plain);
		},
		FIXTURE_TIMEOUT_MS,
	);
});
