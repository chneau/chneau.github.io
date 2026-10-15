import { describe, expect, test } from "bun:test";
import { decompressContainer } from "../lib/container";
import { readEntityFlags } from "../lib/entities";
import { readNameTable } from "../lib/names";
import { parseTokens, type Token } from "../lib/tokens";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

type Fingerprint = {
	readonly tokens: number;
	readonly offsetSum: number;
	readonly coveredBytes: number;
	readonly skippedBytes: number;
	readonly withValue: number;
	readonly withoutValue: number;
	readonly tags: Readonly<Record<string, number>>;
};

const fingerprint = (
	tokens: readonly Token[],
	covered: number,
	skipped: number,
): Fingerprint => {
	let offsetSum = 0;
	let withValue = 0;
	const tags: Record<string, number> = {};
	for (const token of tokens) {
		offsetSum += token.offset;
		if (token.value !== undefined) withValue += 1;
		tags[token.tag] = (tags[token.tag] ?? 0) + 1;
	}
	return {
		tokens: tokens.length,
		offsetSum,
		coveredBytes: covered,
		skippedBytes: skipped,
		withValue,
		withoutValue: tokens.length - withValue,
		tags,
	};
};

type Walk = {
	readonly data: Uint8Array;
	readonly names: readonly string[];
	readonly tokens: readonly Token[];
	readonly print: Fingerprint;
};

const walkOf = (file: Uint8Array): Walk => {
	const data = decompressContainer(file).data;
	const names = readNameTable(data).names;
	const scan = parseTokens(data, names);
	return {
		data,
		names,
		tokens: scan.tokens,
		print: fingerprint(scan.tokens, scan.coveredBytes, scan.skippedBytes),
	};
};

const gameTimes = (walk: Walk): readonly Token[] =>
	walk.tokens.filter((token) => token.value?.type === "GameTime");

const named = (walk: Walk, name: string): readonly Token[] =>
	gameTimes(walk).filter((token) => token.name === name);

const widthsOf = (tokens: readonly Token[]): Map<number, number> => {
	const widths = new Map<number, number>();
	for (const token of tokens) {
		const width = token.value?.bytes.length ?? -1;
		widths.set(width, (widths.get(width) ?? 0) + 1);
	}
	return widths;
};

const secondsOf = (tokens: readonly Token[]): string[] =>
	[...new Set(tokens.map((token) => token.value?.text ?? ""))].sort();

const respawnOf = (
	walk: Walk,
): {
	entities: number;
	distinctValues: number;
	values: readonly { value: string; entities: number }[];
} => {
	const row = readEntityFlags(walk.data, walk.names).flags.find(
		(flag) => flag.name === "fullRespawnTime",
	);
	if (row === undefined || row.state !== "written") {
		throw new Error(
			`fullRespawnTime is ${row?.state ?? "absent"}, not written`,
		);
	}
	return row;
};

describe("the token walk is unmoved by the GameTime width", () => {
	test(
		"every offset, tag and value-state on the large fixture is what it was",
		() => {
			const walk = walkOf(largeSave());
			expect(walk.print).toEqual({
				tokens: 250_640,
				offsetSum: 516_709_093_411,
				coveredBytes: 3_944_229,
				skippedBytes: 1_164_077,
				withValue: 181_899,
				withoutValue: 68_741,
				tags: {
					AVAL: 82_642,
					BLCK: 44_306,
					BS: 15_497,
					PORP: 42_108,
					VL: 55_498,
					OP: 1_651,
					SS: 1_133,
					SXAP: 7_804,
					MANU: 1,
				},
			});
		},
		{ timeout: FIXTURE_TIMEOUT_MS },
	);

	test(
		"the same on the small fixture",
		() => {
			const walk = walkOf(smallSave());
			expect(walk.print).toEqual({
				tokens: 39_309,
				offsetSum: 13_152_327_572,
				coveredBytes: 768_007,
				skippedBytes: 271_242,
				withValue: 28_993,
				withoutValue: 10_316,
				tags: {
					AVAL: 10_597,
					BLCK: 5_224,
					BS: 4_105,
					PORP: 4_033,
					VL: 13_891,
					OP: 472,
					SS: 117,
					SXAP: 869,
					MANU: 1,
				},
			});
		},
		{ timeout: FIXTURE_TIMEOUT_MS },
	);

	test(
		"consecutive tokens still abut: no gap opened and no overlap",
		() => {
			for (const [file, expected] of [
				[largeSave(), 233_906],
				[smallSave(), 37_496],
			] as const) {
				const walk = walkOf(file);
				let abutted = 0;
				for (let i = 1; i < walk.tokens.length; i += 1) {
					const previous = walk.tokens[i - 1];
					const current = walk.tokens[i];
					if (previous === undefined || current === undefined) break;
					if (current.offset === previous.offset + previous.size) abutted += 1;
				}
				expect(abutted).toBe(expected);
			}
		},
		{ timeout: FIXTURE_TIMEOUT_MS },
	);
});

describe("the three GameTime shapes, and which of them each save carries", () => {
	test(
		"the large fixture's 793 GameTime values split 562 empty, 225 sized, 6 inline",
		() => {
			const walk = walkOf(largeSave());
			const all = gameTimes(walk);
			expect(all).toHaveLength(793);
			expect(widthsOf(all)).toEqual(
				new Map([
					[3, 562],
					[15, 225],
					[11, 6],
				]),
			);
		},
		{ timeout: FIXTURE_TIMEOUT_MS },
	);

	test(
		"the small fixture's 196 split 74 empty, 120 sized, 2 inline",
		() => {
			const walk = walkOf(smallSave());
			const all = gameTimes(walk);
			expect(all).toHaveLength(196);
			expect(widthsOf(all)).toEqual(
				new Map([
					[3, 74],
					[15, 120],
					[11, 2],
				]),
			);
		},
		{ timeout: FIXTURE_TIMEOUT_MS },
	);

	test(
		"the empty form still decodes, and it decodes to zero rather than to nothing",
		() => {
			for (const file of [largeSave(), smallSave()]) {
				const walk = walkOf(file);
				const empty = gameTimes(walk).filter(
					(token) => token.value?.bytes.length === 3,
				);
				expect(empty.length).toBeGreaterThan(70);
				expect([...new Set(empty.map((token) => token.value?.text))]).toEqual([
					"0",
				]);
			}
		},
		{ timeout: FIXTURE_TIMEOUT_MS },
	);

	test(
		"a populated GameTime reads its m_seconds, not a byte count",
		() => {
			const walk = walkOf(largeSave());
			const sized = named(walk, "fullRespawnTime").filter(
				(token) => token.value?.bytes.length === 15,
			);
			expect(sized).toHaveLength(35);
			expect(secondsOf(sized)).toHaveLength(32);
			expect(sized.map((token) => token.value?.text)).toContain("2604921");
			expect(
				sized.every((token) => {
					const seconds = Number(token.value?.text);
					return Number.isFinite(seconds) && seconds > 0;
				}),
			).toBe(true);
		},
		{ timeout: FIXTURE_TIMEOUT_MS },
	);

	test(
		"the inline form is a clock: timeRemaining and time hold real second counts",
		() => {
			const walk = walkOf(largeSave());
			const inline = gameTimes(walk).filter(
				(token) => token.value?.bytes.length === 11,
			);
			expect(
				inline.map((token) => `${token.name}=${token.value?.text}`).sort(),
			).toEqual([
				"recentDialogOrCutsceneEndGameTime=2610590",
				"time=2635781",
				"timeRemaining=34419",
				"timeRemaining=354",
				"timeRemaining=6861",
				"timeRemaining=77612",
			]);
		},
		{ timeout: FIXTURE_TIMEOUT_MS },
	);

	test(
		"the two populated shapes track the record tag without exception",
		() => {
			for (const file of [largeSave(), smallSave()]) {
				const walk = walkOf(file);
				const byTag = new Map<string, Set<number>>();
				for (const token of gameTimes(walk)) {
					const widths = byTag.get(token.tag) ?? new Set<number>();
					widths.add(token.value?.bytes.length ?? -1);
					byTag.set(token.tag, widths);
				}
				const widthsFor = (tag: string): number[] =>
					[...(byTag.get(tag) ?? new Set<number>())].sort((a, b) => a - b);
				expect(widthsFor("AVAL")).toEqual([3, 15]);
				expect(widthsFor("PORP")).toEqual([3, 15]);
				expect(widthsFor("VL")).toEqual([11]);
				expect(widthsFor("OP")).toEqual([11]);
			}
		},
		{ timeout: FIXTURE_TIMEOUT_MS },
	);

	test("an ambiguous inline 8-second frame is sized inline, and the walk does not slip", () => {
		const names = ["foo", "GameTime"];
		const frame = (seconds: number): Uint8Array => {
			const b = new Uint8Array(64);
			const u16 = (at: number, value: number): void => {
				b[at] = value & 0xff;
				b[at + 1] = (value >> 8) & 0xff;
			};
			b[16] = 0x56;
			b[17] = 0x4c;
			u16(18, 1);
			u16(20, 2);
			b[22] = 0x00;
			u16(23, 1);
			u16(25, 2);
			new DataView(b.buffer).setInt32(27, seconds, true);
			u16(31, 0);
			b[33] = 0x42;
			b[34] = 0x53;
			u16(35, 0);
			return b;
		};

		for (const seconds of [9, 8]) {
			const walk = parseTokens(frame(seconds), names, { from: 16 });
			expect({
				seconds,
				frames: walk.tokens.map((token) => ({
					tag: token.tag,
					size: token.size,
					text: token.value?.text,
					width: token.value?.bytes.length,
				})),
			}).toEqual({
				seconds,
				frames: [
					{ tag: "VL", size: 17, text: String(seconds), width: 11 },
					{ tag: "BS", size: 4, text: undefined, width: undefined },
				],
			});
		}
	});
});

describe("entities.ts reports the value instead of refusing it", () => {
	test(
		"fullRespawnTime is 579 entities over 33 distinct second counts on the large fixture",
		() => {
			const walk = walkOf(largeSave());
			const respawn = respawnOf(walk);
			expect(respawn.entities).toBe(579);
			expect(respawn.distinctValues).toBe(33);
			expect(respawn.values[0]).toEqual({ value: "0", entities: 544 });
			expect(respawn.values.map((entry) => entry.value)).toContain("2604921");
		},
		{ timeout: FIXTURE_TIMEOUT_MS },
	);

	test(
		"and 92 entities over 23 on the small one",
		() => {
			const walk = walkOf(smallSave());
			const respawn = respawnOf(walk);
			expect(respawn.entities).toBe(92);
			expect(respawn.distinctValues).toBe(23);
			expect(respawn.values[0]).toEqual({ value: "0", entities: 70 });
		},
		{ timeout: FIXTURE_TIMEOUT_MS },
	);

	test(
		"the entity count and the respawn pairing are unmoved: the value was added, nothing else",
		() => {
			const walk = walkOf(largeSave());
			const report = readEntityFlags(walk.data, walk.names);
			const scheduled = report.flags.find(
				(flag) => flag.name === "fullRespawnScheduled",
			);
			expect(scheduled?.state).toBe("written");
			if (scheduled?.state !== "written") {
				throw new Error("fullRespawnScheduled is not written");
			}
			expect(scheduled.entities).toBe(579);
			expect(report.entities).toBe(6_525);
			expect(report.distinctPropertyNames).toBe(149);
			expect(report.promotedEntities).toBe(290);
		},
		{ timeout: FIXTURE_TIMEOUT_MS },
	);

	test(
		"a second count of zero is not a notable flag; a set one is",
		() => {
			const walk = walkOf(largeSave());
			const report = readEntityFlags(walk.data, walk.names);
			expect(report.entitiesWithNotableFlags).toBe(820);
			expect(report.namedEntitiesWithNotableFlags).toBe(264);

			const respawn = report.flags.find(
				(flag) => flag.name === "fullRespawnTime",
			);
			expect(respawn?.state).toBe("written");
			if (respawn?.state !== "written") {
				throw new Error("fullRespawnTime is not written");
			}
			expect(respawn.entities).toBe(579);
			expect(respawn.distinctValues).toBe(33);
			expect(respawn.values[0]).toEqual({ value: "0", entities: 544 });
			expect(respawn.values.some((entry) => entry.value !== "0")).toBe(true);

			const sampled = report.sample.flatMap((entity) =>
				entity.flags.filter((flag) => flag.name === "fullRespawnTime"),
			);
			expect(sampled).toEqual([]);
		},
		{ timeout: FIXTURE_TIMEOUT_MS },
	);
});
