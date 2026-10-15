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
				expect(dialogs.sample).toHaveLength(
					Math.min(DIALOG_SAMPLE_LIMIT, dialogs.guidCount),
				);
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
				expect(attitudes.parentGroupCount).toBe(194);
				expect(attitudes.distinctParentCount).toBe(31);
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
			for (const row of attitudes.sample) {
				expect(typeof row.group).toBe("string");
				expect(typeof row.against).toBe("string");
			}
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

describe("the attitude columns' accounting", () => {
	const NEUTRAL = "AIA_Neutral";

	test("runs to the longest column and reports the shortfall as unresolved", () => {
		const tallied = attitudeRows(
			["g1", "g2", "g3"],
			["h1", "h2"],
			["AIA_Friendly", "AIA_Hostile", "AIA_Neutral"],
		);
		expect({
			groupCount: tallied.groupCount,
			unresolved: tallied.unresolvedRowCount,
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
		expect(tallied.sample).toEqual([
			{ group: "g1", against: "h1", attitude: "AIA_Friendly" },
			{ group: "g2", against: "h2", attitude: "AIA_Hostile" },
		]);
	});

	test("does not count an unresolved attitude as non-neutral", () => {
		const tallied = attitudeRows(
			["g1", "g2"],
			["h1", "h2"],
			[null, "AIA_Hostile", "AIA_Friendly"],
		);
		expect({
			nonNeutral: tallied.nonNeutralCount,
			unresolved: tallied.unresolvedRowCount,
			values: tallied.valueCounts,
		}).toEqual({
			nonNeutral: 2,
			unresolved: 2,
			values: [
				{ attitude: "<unresolved>", count: 1 },
				{ attitude: "AIA_Friendly", count: 1 },
				{ attitude: "AIA_Hostile", count: 1 },
			],
		});
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
