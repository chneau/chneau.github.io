import { describe, expect, test } from "bun:test";
import { decompressContainer } from "../lib/container";
import {
	ATTITUDE_SAMPLE_LIMIT,
	attitudeRows,
	DIALOG_SAMPLE_LIMIT,
	readDialogues,
	resolveCName,
} from "../lib/dialogues";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

/**
 * Pending external-scene dialog references, and the global attitude matrix.
 *
 * Every figure asserted here was **measured on the two committed fixtures**, not
 * carried over from the reference decoder's notes. Where the two disagree with
 * that doc the test states the measured one, because a projection built on the
 * doc's number would fail on the bytes in this repository.
 *
 * Three properties are asserted that a count alone would not catch:
 *
 *  1. **The multi-guid block is read.** A block that declares two dialogs writes
 *     two guids, and the reference reader's fixed 44-byte window dropped the
 *     second. Two different counts describe that, and this comment used to run
 *     them together: **4 blocks carry more than one guid** (so the guid *slots*
 *     exceed the blocks by 4), while the **distinct** guids exceed the blocks by
 *     **3** — 152 blocks, 155 guids — because one dialog is referenced from two
 *     blocks. The assertion below is the distinct one, so it says 3. A reader that
 *     lost the extras would report 152 and 152.
 *  2. **No offset reaches the output.** A document field carrying a byte address
 *     is invalid the moment the save is rebuilt, so the key is asserted absent
 *     rather than left to review.
 *  3. **The cross-reference is total.** Every guid resolves to a `questBlock`,
 *     and the orphan count is asserted as 0 — measured, not assumed from the
 *     reference's seven-save observation.
 */

/**
 * The two fixtures, decompressed, with the counts measured on each.
 *
 * The decompression is inside the loader rather than beside it: `readDialogues`
 * takes the *decompressed* stream, and `readNameTable` does not throw when handed
 * the compressed container — it returns a wrong table, which would make every
 * assertion below fail for a reason that has nothing to do with the reader.
 */
const FIXTURES = [
	{
		name: "8559a",
		load: () => decompressContainer(smallSave()).data,
		blocks: 21,
		multi: 0,
		guids: 21,
		speakers: ["glinsk_barber_01", "sjusta", "q001_inn_peasant_01"],
		firstGuid: "05e243ef6b5dd647a01f78bd391d1a51",
		groups: 927,
		friendly: 321,
		hostile: 326,
		neutral: 280,
		nonNeutral: 647,
	},
	{
		name: "52586",
		load: () => decompressContainer(largeSave()).data,
		blocks: 152,
		multi: 4,
		guids: 155,
		speakers: ["mh301_merc_speaker", "mq1045_enc_02_woman_01", "priscilla"],
		firstGuid: "0eda2772d1513f4a9d53be6b74115e5f",
		groups: 958,
		friendly: 329,
		hostile: 346,
		neutral: 283,
		nonNeutral: 675,
	},
] as const;

describe("pending external-scene dialogs", () => {
	for (const fixture of FIXTURES) {
		test(
			`reads every block and every guid on ${fixture.name}`,
			() => {
				const { dialogs } = readDialogues(fixture.load());
				expect(dialogs.blockCount).toBe(fixture.blocks);
				expect(dialogs.blocksWithMultipleGuids).toBe(fixture.multi);
				// The point of the multi-guid handling: distinct guids strictly
				// exceed blocks on 52586, by one per extra guid in those 4 blocks.
				expect(dialogs.guidCount).toBe(fixture.guids);
				expect(dialogs.blockCount).toBe(dialogs.blocksReferencedByQuestBlock);
				expect(dialogs.orphanGuidCount).toBe(0);
			},
			FIXTURE_TIMEOUT_MS,
		);

		test(
			`names speakers through the save's own table on ${fixture.name}`,
			() => {
				const { dialogs } = readDialogues(fixture.load());
				expect(dialogs.sample.slice(0, 3).map((row) => row.speaker)).toEqual([
					...fixture.speakers,
				]);
				// A CName is a 1-based index into this save's MANU, so the same
				// speaker is a different number on each build: `priscilla` is 3275
				// on 52586 and absent from the small save's table entirely.
				expect(dialogs.sample.every((row) => row.speaker !== null)).toBe(true);
			},
			FIXTURE_TIMEOUT_MS,
		);

		test(
			`renders guids as 32 hex digits and cross-references every one on ${fixture.name}`,
			() => {
				const { dialogs } = readDialogues(fixture.load());
				expect(dialogs.sample[0]?.guid).toBe(fixture.firstGuid);
				for (const row of dialogs.sample) {
					expect(row.guid).toMatch(/^[0-9a-f]{32}$/);
					expect(row.hasQuestBlockReference).toBe(true);
				}
			},
			FIXTURE_TIMEOUT_MS,
		);

		test(
			`caps the sample without truncating the counts on ${fixture.name}`,
			() => {
				const { dialogs } = readDialogues(fixture.load());
				// The cap binds only where the table is longer than it: the small
				// save's 21 guids fit whole, so its sample is not padded and not
				// truncated either.
				expect(dialogs.sample).toHaveLength(
					Math.min(DIALOG_SAMPLE_LIMIT, dialogs.guidCount),
				);
				// The dropped rows are still counted: a capped list that reported
				// its own length as the total would under-report the save.
				expect(dialogs.sample.length).toBeLessThanOrEqual(dialogs.guidCount);
				expect(dialogs.guidCount).toBe(fixture.guids);
			},
			FIXTURE_TIMEOUT_MS,
		);

		test(
			`carries no offset into the document on ${fixture.name}`,
			() => {
				const { dialogs, attitudes } = readDialogues(fixture.load());
				const serialised = JSON.stringify({ dialogs, attitudes });
				expect(serialised).not.toContain("offset");
				expect(serialised).not.toContain("spanEnd");
				// A byte address would show up as a large bare integer; the only
				// numbers this module emits are counts, `dialogsCount`, and hex.
				for (const row of dialogs.sample) {
					expect(Object.keys(row).sort()).toEqual([
						"dialogsCount",
						"guid",
						"hasQuestBlockReference",
						"speaker",
					]);
				}
			},
			FIXTURE_TIMEOUT_MS,
		);
	}
});

describe("the multi-guid block", () => {
	test(
		"keeps the second guid of a block that declares two dialogs",
		() => {
			const { dialogs } = readDialogues(decompressContainer(largeSave()).data);
			const pairs = dialogs.sample.filter((row) => row.dialogsCount === 2);
			// The first multi-guid block on 52586 carries these two ids and
			// declares 2. A reader with the reference's fixed 44-byte window sees
			// only the first, and `guidCount` would be 152 rather than 155.
			expect(pairs.length).toBeGreaterThan(0);
			for (const row of pairs) expect(row.dialogsCount).toBe(2);
			expect(
				dialogs.sample.some(
					(row) => row.guid === "192ba9bb039bf049a76b1f650bb11048",
				),
			).toBe(true);
			expect(
				dialogs.sample.some(
					(row) => row.guid === "0123a0f078bc434d8088e91e26d96635",
				),
			).toBe(true);
			// Both come from the same block, so both are referenced and both count.
			expect(pairs.every((row) => row.hasQuestBlockReference)).toBe(true);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"finds none on the small save, whose 21 blocks are all 44 bytes",
		() => {
			const { dialogs } = readDialogues(decompressContainer(smallSave()).data);
			expect(dialogs.blocksWithMultipleGuids).toBe(0);
			expect(dialogs.guidCount).toBe(dialogs.blockCount);
			expect(dialogs.sample.every((row) => row.dialogsCount === 1)).toBe(true);
		},
		FIXTURE_TIMEOUT_MS,
	);
});

describe("a CName that does not resolve", () => {
	// The `speaker does not resolve` path cannot be reached from either fixture:
	// every one of the 173 measured blocks names a speaker in its own build's
	// table. It is asserted on the rule itself rather than left untested, because
	// the rule is what makes the `null` in the row type honest.
	test("is null for the empty slot and for an index past the table", () => {
		const names = ["first", "second"];
		expect(resolveCName(names, new Uint8Array([0, 0]))).toBeNull();
		expect(resolveCName(names, new Uint8Array([0x10, 0x00]))).toBeNull();
		expect(resolveCName(names, new Uint8Array([9, 0]))).toBeNull();
	});

	test("resolves a 1-based index little-endian", () => {
		const names = ["first", "second"];
		expect(resolveCName(names, new Uint8Array([2, 0]))).toBe("second");
		expect(resolveCName(names, new Uint8Array([1, 0]))).toBe("first");
	});

	test("is null for a value too short to be a CName", () => {
		expect(resolveCName(["first"], new Uint8Array([2]))).toBeNull();
		expect(resolveCName(["first"], new Uint8Array([]))).toBeNull();
	});
});

describe("the global attitude-group matrix", () => {
	for (const fixture of FIXTURES) {
		test(
			`counts every triple and every attitude value on ${fixture.name}`,
			() => {
				const { attitudes } = readDialogues(fixture.load());
				expect(attitudes.groupCount).toBe(fixture.groups);
				expect(attitudes.unresolvedRowCount).toBe(0);
				// Exactly three values, which is what re-reflecting the column as
				// CNames buys: read as the declared enum it is three integers.
				expect(attitudes.valueCounts).toEqual([
					{ attitude: "AIA_Friendly", count: fixture.friendly },
					{ attitude: "AIA_Hostile", count: fixture.hostile },
					{ attitude: "AIA_Neutral", count: fixture.neutral },
				]);
				expect(
					attitudes.valueCounts.reduce((sum, entry) => sum + entry.count, 0),
				).toBe(fixture.groups);
				expect(attitudes.nonNeutralCount).toBe(fixture.nonNeutral);
				expect(attitudes.nonNeutralCount).toBe(
					fixture.groups - fixture.neutral,
				);
			},
			FIXTURE_TIMEOUT_MS,
		);

		test(
			`reports the parent forest and the empty actor override on ${fixture.name}`,
			() => {
				const { attitudes } = readDialogues(fixture.load());
				// 194 keys on both builds: the save carries the groups this
				// playthrough used, out of 866 in the game's CSV.
				expect(attitudes.parentGroupCount).toBe(194);
				expect(attitudes.distinctParentCount).toBe(31);
				// `actorAttitudes` — the per-actor override — declares zero rows.
				expect(attitudes.actorAttitudeCount).toBe(0);
			},
			FIXTURE_TIMEOUT_MS,
		);

		test(
			`samples only non-neutral pairs, capped, on ${fixture.name}`,
			() => {
				const { attitudes } = readDialogues(fixture.load());
				expect(attitudes.sample).toHaveLength(ATTITUDE_SAMPLE_LIMIT);
				expect(
					attitudes.sample.every((row) => row.attitude !== "AIA_Neutral"),
				).toBe(true);
				expect(attitudes.sample.slice(0, 2)).toEqual([
					{
						group: "sergeant",
						against: "barons_men",
						attitude: "AIA_Friendly",
					},
					{
						group: "sergeant",
						against: "player",
						attitude: "AIA_Friendly",
					},
				]);
				expect(attitudes.sample.every((row) => row.group !== null)).toBe(true);
			},
			FIXTURE_TIMEOUT_MS,
		);
	}

	test(
		"is a group-to-group table, not a per-NPC attitude",
		() => {
			const { attitudes } = readDialogues(
				decompressContainer(smallSave()).data,
			);
			// The distinction is worth a test because getting it wrong is the
			// likeliest way this module is mislabelled downstream: the columns
			// are group names on both sides, and no row is keyed by an entity.
			for (const row of attitudes.sample) {
				expect(typeof row.group).toBe("string");
				expect(typeof row.against).toBe("string");
			}
			// No column names an actor, a tag or a GUID — the table is group×group.
			expect(Object.keys(attitudes).sort()).toEqual([
				"actorAttitudeCount",
				"distinctParentCount",
				"groupCount",
				"nonNeutralCount",
				"parentGroupCount",
				"sample",
				"unresolvedRowCount",
				"valueCounts",
			]);
		},
		FIXTURE_TIMEOUT_MS,
	);
});

/**
 * The attitude columns' counting rules, driven from constructed columns.
 *
 * Both are unreachable from the committed saves — every measured save has three
 * equal-length columns and no unresolved value — and both were wrong before they
 * were separated from the reading:
 *
 *  - the zip was bounded by the **shortest** column, so rows a longer column
 *    carried were dropped from every count instead of being reported unresolved,
 *    contradicting the function's own doc comment.
 *  - a row whose attitude CName did not resolve was counted as **non-neutral**
 *    and emitted into `sample` with `attitude: null`, though `nonNeutralCount`
 *    means rows carrying a name other than `AIA_Neutral`.
 *
 * These are the only tests that cover either, which is why the accounting was
 * extracted into a function that takes three arrays rather than a save.
 */
describe("the attitude columns' accounting", () => {
	const NEUTRAL = "AIA_Neutral";

	test("runs to the longest column and reports the shortfall as unresolved", () => {
		// Column two stops one row early and the values column one row later, so
		// three rows are short somewhere and the old `Math.min` would have counted
		// two of them at all.
		const tallied = attitudeRows(
			["g1", "g2", "g3"],
			["h1", "h2"],
			["AIA_Friendly", "AIA_Hostile", "AIA_Neutral"],
		);
		expect({
			groupCount: tallied.groupCount,
			unresolved: tallied.unresolvedRowCount,
			// Every row carries a resolved attitude, so all three are non-neutral
			// bar the one that names `AIA_Neutral` itself.
			nonNeutral: tallied.nonNeutralCount,
			values: tallied.valueCounts,
		}).toEqual({
			groupCount: 3,
			unresolved: 1,
			nonNeutral: 2,
			values: [
				{ attitude: "AIA_Friendly", count: 1 },
				{ attitude: "AIA_Hostile", count: 1 },
				{ attitude: "AIA_Neutral", count: 1 },
			],
		});
		// The two rows with a resolved name are sampled; the third is neutral.
		expect(tallied.sample).toEqual([
			{ group: "g1", against: "h1", attitude: "AIA_Friendly" },
			{ group: "g2", against: "h2", attitude: "AIA_Hostile" },
		]);
	});

	test("does not count an unresolved attitude as non-neutral", () => {
		// The values column is longer than the two name columns and the first entry
		// is `null` — the shape a `CName(0)` takes. Only the second row carries a
		// real non-neutral name.
		const tallied = attitudeRows(
			["g1", "g2"],
			["h1", "h2"],
			[null, "AIA_Hostile", "AIA_Friendly"],
		);
		expect({
			nonNeutral: tallied.nonNeutralCount,
			unresolved: tallied.unresolvedRowCount,
			// A null is tallied under a placeholder so the histogram still accounts
			// for the row, rather than being dropped from it.
			values: tallied.valueCounts,
		}).toEqual({
			nonNeutral: 2,
			// Row 1's attitude is null, and row 3 has no names.
			unresolved: 2,
			values: [
				{ attitude: "<unresolved>", count: 1 },
				{ attitude: "AIA_Friendly", count: 1 },
				{ attitude: "AIA_Hostile", count: 1 },
			],
		});
		// The null-attitude row is absent from the sample — it has no name to show.
		// The third row is sampled even though its *names* are missing, because
		// `nonNeutralCount` is a statement about the attitude column: a row that
		// carries a real attitude name is non-neutral, and its missing counterparts
		// are what `unresolvedRowCount` reports.
		expect(tallied.sample).toEqual([
			{ group: "g2", against: "h2", attitude: "AIA_Hostile" },
			{ group: null, against: null, attitude: "AIA_Friendly" },
		]);
	});

	test("a neutral row is counted but never sampled", () => {
		const tallied = attitudeRows(
			["g1", "g2"],
			["h1", "h2"],
			[NEUTRAL, "AIA_Friendly"],
		);
		expect({
			groupCount: tallied.groupCount,
			unresolved: tallied.unresolvedRowCount,
			nonNeutral: tallied.nonNeutralCount,
			sample: tallied.sample,
		}).toEqual({
			groupCount: 2,
			unresolved: 0,
			nonNeutral: 1,
			sample: [{ group: "g2", against: "h2", attitude: "AIA_Friendly" }],
		});
	});
});
