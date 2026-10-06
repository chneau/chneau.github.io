/**
 * `GameTime` is a struct, and the token walk has to measure it.
 *
 * ## The bug this file is about
 *
 * `tokens.ts` listed `GameTime` in `FIXED_WIDTHS` at 11 bytes. It is not a
 * primitive — it is the class-reflection struct `{ m_seconds : Int32 }` — so its
 * width is a function of what the writer put in it, and 11 is the width of one
 * of its three shapes and neither of the others. Measured on the two committed
 * saves, the writer emits:
 *
 * ```
 *   empty   | 00 | 00 00                                     3 bytes
 *   sized   | 00 | u16 name | u16 type | u32 8 | i32 secs | 00 00    15 bytes
 *   inline  | 00 | u16 name | u16 type | i32 secs     | 00 00           11 bytes
 * ```
 *
 * 380 populated frames over the pair: 372 sized (inside an `AVAL`/`PORP`, which
 * declares its value's length) and 8 inline (inside a `VL`/`OP`, which does not
 * — the clock values `timeRemaining`, `time` and
 * `recentDialogOrCutsceneEndGameTime`).
 *
 * The consequence was not a failure but a silence. `valueWidth` returned 11 for
 * every `GameTime`, `reflectValue` was handed a span four bytes short of the
 * value and closed only on the empty form, and `entities.ts` — which had a
 * comment saying so, and refused to report a value it had not read — reported
 * `fullRespawnTime` as a count with nothing claimed. On the large fixture that
 * is 579 entities and 33 distinct values unreadable.
 *
 * ## Why a wrong width here is the worst kind of bug
 *
 * A token the walker cannot size is *stepped over*, one byte at a time, until
 * something parses. So a width that is wrong does not raise anything: it shifts
 * every subsequent offset and the walk resumes somewhere else in the stream
 * looking plausible. The assertions below exist because that failure mode is
 * invisible by construction. Each fixture's walk is fingerprinted by **token
 * count, offset sum, per-tag counts, and how many tokens carry a value at all**
 * — the last of which is what would move if a previously-unsized type started
 * resolving or a resolved one stopped. These are the numbers the change was
 * measured against, and they are unchanged.
 *
 * ## The ambiguity, and why it no longer matters
 *
 * An *inline* frame holding exactly `m_seconds === 8` also satisfies the sized
 * test over the bytes alone, because 8 is both a plausible second count and the
 * framed width of an `Int32` member. It occurred on neither fixture — the eight
 * inline frames hold 354, 6861, 941690, 1062611, 77612, 2610590, 2635781 and
 * 34419 — but "does not occur on these two saves" is not a guarantee, and the
 * cost of being wrong was the silent desync described above. It *was* wrong:
 * constructing such a frame made the walk report it as 15 bytes, read four bytes
 * past it, and lose the token that followed.
 *
 * The fix is that the width no longer guesses. The enclosing record's tag is
 * threaded in as `framed` — `true` for `AVAL`/`PORP`, which declare their value's
 * length and write the struct sized; `false` for `VL`/`OP`, which do not and
 * write it inline — so the shape is *known* at every direct call site rather than
 * inferred from bytes that can coincide. `readGameTime`'s byte-level rule survives
 * only for a value nested inside an array or a handle, where no frame is known
 * and `GameTime` has not been observed.
 *
 * The test below constructs the ambiguous frame and asserts both that it sizes as
 * 11 and that the token after it survives, which is the disproof of the old
 * behaviour rather than an assertion that the input never arises.
 *
 * The costs are real: the large fixture decodes ~1.2 s and the small ~0.3 s, and
 * the walk is ~250,000 tokens. `FIXTURE_TIMEOUT_MS` is required.
 */

import { describe, expect, test } from "bun:test";
import { decompressContainer } from "../lib/container";
import { readEntityFlags } from "../lib/entities";
import { readNameTable } from "../lib/names";
import { parseTokens, type Token } from "../lib/tokens";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

/** A walk's fingerprint: the numbers a desync would move. */
type Fingerprint = {
	readonly tokens: number;
	/** sum of every token's absolute offset — moves if the walk slips a byte */
	readonly offsetSum: number;
	readonly coveredBytes: number;
	readonly skippedBytes: number;
	readonly withValue: number;
	readonly withoutValue: number;
	readonly tags: Readonly<Record<string, number>>;
};

/**
 * Everything about a walk that a width change is allowed to leave alone.
 *
 * `withValue`/`withoutValue` are here because they catch the failure the count
 * alone would miss: a type that stops resolving leaves the token *count* intact
 * in an `AVAL`/`PORP` (the record's declared length still sizes it) while
 * `withoutValue` climbs.
 */
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

/** A fixture decompressed, with its own name table and a walk over it. */
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

/** Every token whose value the walk read as a `GameTime`. */
const gameTimes = (walk: Walk): readonly Token[] =>
	walk.tokens.filter((token) => token.value?.type === "GameTime");

/** The `GameTime` tokens carrying `name`. */
const named = (walk: Walk, name: string): readonly Token[] =>
	gameTimes(walk).filter((token) => token.name === name);

/** How many `GameTime` tokens have a value `bytes.length` wide. */
const widthsOf = (tokens: readonly Token[]): Map<number, number> => {
	const widths = new Map<number, number>();
	for (const token of tokens) {
		const width = token.value?.bytes.length ?? -1;
		widths.set(width, (widths.get(width) ?? 0) + 1);
	}
	return widths;
};

/** The distinct second counts a set of `GameTime` tokens reads as. */
const secondsOf = (tokens: readonly Token[]): string[] =>
	[...new Set(tokens.map((token) => token.value?.text ?? ""))].sort();

/** The `fullRespawnTime` row of an entity report, or a thrown error. */
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
			// Every figure below is the pre-change walk, recorded before the
			// width was touched. A width mistake moves one of them.
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
			// The offset sum would survive a compensating pair of slips, so the
			// adjacency is asserted directly: each token begins where its
			// predecessor ended. Not every token abuts — the walk steps over
			// bytes it cannot read, and the gaps are where that happened — so
			// this is a count of the abutting runs rather than an equality. Both
			// figures are the pre-change ones.
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
			// 562 of the 793 on the large fixture. A missing member is the writer
			// saying the value is at its default, which for an `Int32` second count
			// is zero — a value, not an absence of one.
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
			// 35 of the 579 are populated; the other 544 are the empty form.
			expect(sized).toHaveLength(35);
			expect(secondsOf(sized)).toHaveLength(32);
			// The largest single `fullRespawnTime` on this save: `i32`
			// 2_604_921 seconds, read from the member four bytes into a 15-byte
			// `PORP` frame. Before the width was fixed this token's value was
			// eleven bytes long and never reached the integer at all.
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
			// The 11-byte shape has no size field, so the `u32` in the member's
			// place is the value. On the large fixture `time` reads 2,635,781 —
			// the figure the reference decoder's own dump of `timeManger.time`
			// gives for this build, which is the cross-check that this shape is
			// the clock and not a mis-parse of one.
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
			// This is the evidence that the width rule is a property of the format
			// rather than of the numbers it happens to fit: a frame carrying a
			// declared length (`AVAL`/`PORP`) is empty or sized and never inline,
			// and one carrying none (`VL`/`OP`) is always inline and never sized.
			// Over the two saves that is 380 populated frames — 372 sized, 8 inline
			// — split between the tags with no exception on either fixture.
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
		// The disproof of the old behaviour, and it has to be built to *both*
		// conditions that made it ambiguous — this test used to miss the second one
		// and passed with the fix deleted, which is a test that could not fail.
		//
		// A `VL` carries no length, so its `GameTime` is written inline; the old
		// byte rule tried the *sized* shape first and needed two things to reject it:
		// a `u32` at `o+5` that is not 8, **and** a non-zero `u16` at `o+13` (the
		// sized shape's terminator). An `m_seconds` of exactly 8 satisfies the first,
		// so the second must be zero too — which means the two bytes four past the
		// frame have to be `00 00`. The `BS` that follows therefore carries a
		// `nameIdx` of 0.
		//
		// With both conditions met the byte rule reports the frame as 15 bytes and
		// reads 1396834304 as its value, and the `BS` at 33 is never found. Only the
		// frame's *tag* separates them, which is what `framed` carries.
		//
		// A synthetic buffer rather than a fixture, because the committed saves do
		// not contain the case. `parseTokens` takes the name table as an argument, so
		// no `MANU` has to be built: index 1 is the property and index 2 the type.
		const names = ["foo", "GameTime"];
		const frame = (seconds: number): Uint8Array => {
			const b = new Uint8Array(64);
			const u16 = (at: number, value: number): void => {
				b[at] = value & 0xff;
				b[at + 1] = (value >> 8) & 0xff;
			};
			b[16] = 0x56; // "VL"
			b[17] = 0x4c;
			u16(18, 1); // nameIdx -> "foo"
			u16(20, 2); // typeIdx -> "GameTime"
			b[22] = 0x00; // the struct's presence byte
			u16(23, 1); // member name
			u16(25, 2); // member type
			new DataView(b.buffer).setInt32(27, seconds, true);
			u16(31, 0); // the member's terminator, at o+9
			b[33] = 0x42; // "BS" — the token that used to be lost
			b[34] = 0x53;
			// `nameIdx` 0, so the two bytes at `o+13` are `00 00` and the sized test
			// cannot reject itself on the terminator. This is the line that makes the
			// frame ambiguous; without it the old byte rule happens to get it right
			// and the test proves nothing.
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
			// Zero is the commonest by a wide margin — 544 of the 579 — because an
			// entity that is not respawning carries a default `GameTime`. Before
			// the width was fixed this row was a count and an empty histogram.
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
			// 579 entities write `fullRespawnTime` and 579 write the `Bool`
			// `fullRespawnScheduled`, which is the pairing the reference decoder
			// measured. Reading the value cannot change either count, and these
			// are the assertions that would catch it if it did.
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
			// 22 of the large fixture's 820 notable entities are newly notable
			// because of this fix, and every one of them is a `GameTime` that is
			// set — 798 was the count when the value was unreadable.
			//
			// This used to assert `Number(reading.value) !== 0` over the entity
			// *sample*, and that loop never ran: the 24 sampled entities contain no
			// `fullRespawnTime` at all (35 entities write a non-zero one and none of
			// them is promoted or named), so the assertion this test is named for
			// was vacuous. The claim is now made against the flag's own histogram,
			// which does carry it, and the emptiness of the sample is asserted
			// rather than silently relied on.
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
			// 579 entities, 33 distinct second counts, and zero the commonest by a
			// wide margin — so the reader is separating "no respawn pending" from a
			// real time rather than collapsing both to a number.
			expect(respawn.entities).toBe(579);
			expect(respawn.distinctValues).toBe(33);
			expect(respawn.values[0]).toEqual({ value: "0", entities: 544 });
			expect(respawn.values.some((entry) => entry.value !== "0")).toBe(true);

			// And the sample cannot exercise it, which is why the assertion above
			// is the one that carries the claim.
			const sampled = report.sample.flatMap((entity) =>
				entity.flags.filter((flag) => flag.name === "fullRespawnTime"),
			);
			expect(sampled).toEqual([]);
		},
		{ timeout: FIXTURE_TIMEOUT_MS },
	);
});
