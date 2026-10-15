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
			expect(journal.statuses).toEqual([
				{ status: "JS_Success", entries: 155 },
				{ status: "JS_Active", entries: 139 },
				{ status: "JS_Inactive", entries: 2 },
			]);
			expect(statusCount(journal, "JS_Failed")).toBe(0);
			expect(statusCount(journal, "JS_Unresolved")).toBe(0);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"the 52586 save has a fourth status the 8559a table does not",
		() => {
			const journal = journalOf(largeSave);
			expect(journal.entries).toBe(972);
			expect(journal.statuses).toEqual([
				{ status: "JS_Active", entries: 587 },
				{ status: "JS_Success", entries: 354 },
				{ status: "JS_Inactive", entries: 24 },
				{ status: "JS_Failed", entries: 7 },
			]);
			expect(statusCount(journal, "JS_Unresolved")).toBe(0);
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
			expect(small.unattributed.emptyResource).toBe(202);
			expect(small.unattributed.nonQuestResource).toBe(83);
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
			expect(journal.sample.length).toBe(11);
			expect(journal.sample.every((row) => row.questId !== undefined)).toBe(
				true,
			);
			expect(journal.unattributed.emptyResource).toBe(202);
			for (const row of journal.sample) {
				expect(journal.quests.some((q) => q.id === row.questId)).toBe(true);
			}
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
				const mq0003 = quest(journal, "mq0003");
				expect(mq0003.entries).toBe(2);
				expect(mq0003.statuses).toEqual([
					{ status: "JS_Success", entries: 1 },
					{ status: "JS_Active", entries: 1 },
				]);
				expect(mq0003.contested).toBe(true);
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
			for (const q of journal.quests) {
				if (q.title !== undefined) expect(q.title).not.toBe(q.id);
			}
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
			expect(large.quests.some((q) => q.id.startsWith("JH"))).toBe(false);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"the sample is drawn from attributed entries, and the cap never engages",
		() => {
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

				expect(journal.sample.every((row) => row.questId !== undefined)).toBe(
					true,
				);
				for (const row of journal.sample) {
					expect(journal.quests.some((q) => q.id === row.questId)).toBe(true);
				}

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
				const walk = (value: unknown, path: string): void => {
					if (typeof value === "number") {
						expect(value).toBeLessThan(1_000_000);
						return;
					}
					if (Array.isArray(value)) {
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
			const data = decompressContainer(largeSave()).data;
			const names = readNameTable(data).names;
			const plain = readJournal(data);
			const shared = readJournal(data, { names });
			expect(shared).toEqual(plain);
		},
		FIXTURE_TIMEOUT_MS,
	);
});
