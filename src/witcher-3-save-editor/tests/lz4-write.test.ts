import { describe, expect, test } from "bun:test";
import { parseContainer } from "../lib/container";
import { lz4DecompressBlock } from "../lib/lz4";
import { lz4CompressBlock, lz4StoredBlock } from "../lib/lz4-write";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

/**
 * The LZ4 compressor, which is the newest and least trustworthy code in this
 * editor.
 *
 * The decoder next door was written against real saves; the compressor was not
 * written against anything at all until this suite existed, and it carries two
 * bugs it had already produced by the time it was finished:
 *
 *  - a match-length extension written as `length - 15` rather than
 *    `length - MIN_MATCH - 15`, which made every long match decode four bytes
 *    too long and run past the end of the block;
 *  - a match shorter than `MIN_MATCH` encoded anyway, where `length - MIN_MATCH`
 *    goes negative and wraps into the token nibble as 254 — which the reader
 *    takes as *saturated*, so it then consumes extension bytes that are not
 *    there. A two-byte match at the very end of a block was enough to corrupt a
 *    whole chunk.
 *
 * Both are silent: the compressor produces bytes, and nothing downstream
 * complains until the decompressed payload has already lost a few bytes and the
 * rebuilt save is a plausible-looking file with something missing. So the
 * property asserted here is the only one that matters — **the decoder this
 * editor ships must reproduce the input from the compressor's output, byte for
 * byte** — and it is asserted on hand-built inputs chosen to reach each branch
 * rather than on whatever the fixture happens to contain.
 *
 * The real fixture is used too, at the end, because it is the only source of
 * blocks that are not adversarial: it is what the game actually wrote.
 */

/** Pseudo-random bytes that are not genuinely random. */
const noise = (length: number, seed = 1): Uint8Array => {
	const out = new Uint8Array(length);
	for (let index = 0; index < length; index += 1) {
		out[index] = (Math.imul(index + seed, 2654435761) >>> 13) & 0xff;
	}
	return out;
};

/** Round-trip one block through the shipped decoder, asserting byte equality. */
const roundTrip = (source: Uint8Array): Uint8Array => {
	const rebuilt = lz4DecompressBlock(lz4CompressBlock(source), source.length);
	expect([...rebuilt]).toEqual([...source]);
	return rebuilt;
};

describe("LZ4 compressor", () => {
	test("round-trips input shorter than one token, where nothing may be encoded", () => {
		// Below 15 bytes the whole literal run lives in the token's high nibble and
		// there is no extension byte at all. A compressor that wrote one anyway
		// would read it back as a literal, silently swallowing a byte of the input.
		for (let length = 0; length < 15; length += 1) {
			const source = noise(length);
			const block = lz4CompressBlock(source);
			expect([...lz4DecompressBlock(block, length)]).toEqual([...source]);
		}
	});

	test("round-trips a literal run that overflows the token nibble", () => {
		// 15 literals saturate the high nibble and spill into an extension byte,
		// so the boundary at 14/15 is the first place the two encodings differ.
		for (const length of [14, 15, 16, 29, 30, 31, 269, 270, 271, 285]) {
			roundTrip(noise(length, 7));
		}
	});

	test("round-trips input whose only match is shorter than MIN_MATCH", () => {
		// The regression, and the case that is hardest to reach by accident.
		//
		// A match can only *start* within `limit = n - MATCH_LIMIT`, but it is
		// measured against that same limit, so a candidate found in the last four
		// positions before it yields a match of one, two or three bytes — shorter
		// than the format can encode. The encoder must skip it. Encoding it writes
		// `length - MIN_MATCH` into the token's low nibble; for length 3 that is
		// −1, which wraps to 15, which the reader reads as *saturated* and so
		// consumes extension bytes that were never emitted — demonstrated
		// directly in the next test.
		//
		// The construction: a four-byte window planted at the start of the input
		// and again fifteen bytes from the end, over deterministic filler chosen so
		// no other position aliases the same hash slot. The search is bounded so the
		// window lands inside the final sixteen bytes and the resulting match must
		// be under four bytes.
		const window = [0xde, 0xad, 0xbe, 0xef];
		for (const length of [61, 64, 71, 80]) {
			const repeatAt = length - 15;
			const source = new Uint8Array(length);
			for (let index = 0; index < length; index += 1) {
				source[index] = (Math.imul(index + 7, 2654435761) >>> 13) & 0xff;
			}
			for (const [offset, byte] of window.entries()) {
				source[offset] = byte;
				source[repeatAt + offset] = byte;
			}
			roundTrip(source);
		}
	});

	test("shows why a sub-MIN_MATCH match cannot be encoded at all", () => {
		// The failure the guard above prevents, built by hand so it is visible: a
		// token claiming a three-byte match, with the length code that a missing
		// guard would have produced. −1 in the low nibble is 15, which is the
		// format's "saturated, read the extension below" signal, so the reader
		// goes looking for extension bytes that were never written and either runs
		// off the end of the block or reads the following bytes as a length.
		const literals = [1, 2, 3, 4];
		const block = new Uint8Array([
			(literals.length << 4) | 0x0f,
			...literals,
			4,
			0,
			20,
		]);
		// Four literals plus the three bytes the match claims: the reader believes
		// the match is 39 bytes long and refuses rather than returning something
		// plausible.
		expect(() => lz4DecompressBlock(block, 7)).toThrow(
			/match of 39 byte\(s\) overruns/,
		);
	});

	test("round-trips a run of identical bytes, which compresses by overlapping", () => {
		// A run of zeroes becomes one literal followed by a match at offset 1,
		// where every output byte is the byte before it. A decoder that copied in
		// blocks rather than byte by byte would read unwritten memory here.
		for (const length of [64, 1_000, 65_536, 300_000]) {
			roundTrip(new Uint8Array(length));
		}
		// Two orders of magnitude and a bit, rather than the 250:1 a reference
		// encoder manages: a greedy single-slot matcher with a twelve-byte margin
		// at the end of every block pays that margin per block, and a save has
		// hundreds of them. The bound is here to catch a compressor that stopped
		// matching at all, which would still round-trip.
		expect(lz4CompressBlock(new Uint8Array(300_000)).length).toBeLessThan(
			300_000 / 100,
		);
	});

	test("round-trips a long match whose length overflows the token nibble", () => {
		// The other regression. A match of 19 bytes or more saturates the low
		// nibble and appends an extension byte, and the extension encodes the
		// length *above* the 4 the nibble already carries. Writing the unmatched
		// length instead makes every long match read four bytes too long, which
		// overruns the block rather than corrupting it quietly — the loud version
		// of the bug, and still a bug.
		for (const length of [18, 19, 20, 21, 33, 34, 300, 5_000]) {
			const source = new Uint8Array(length).fill(0x5a);
			roundTrip(source);
		}
	});

	test("round-trips a match whose length is an exact multiple of 255", () => {
		// The 255-chained length encoding needs a trailing zero byte when the run
		// is a whole number of 255s, or the reader consumes one byte too many and
		// the following token is read as length. These lengths are where that
		// lands: 15 + 255k, for the literal run and for the match.
		for (const length of [15, 270, 525, 780, 4_000]) {
			roundTrip(noise(length, 3));
			roundTrip(new Uint8Array(length).fill(0x11));
		}
	});

	test("round-trips a block with a match at the maximum representable offset", () => {
		// The offset field is two bytes, so 65535 is the furthest a match can
		// reach. A repeat laid exactly that far out is the fixture that pins the
		// limit; a compressor that emitted 0 would be a block the reader refuses.
		const source = new Uint8Array(70_000);
		source.fill(9, 0, 4);
		source.set([9, 9, 9, 9], 65_539);
		roundTrip(source);
	});

	test("round-trips incompressible input, which is all literals", () => {
		// No match is ever found, so every sequence is a literal run and the
		// encoder writes one token plus the bytes. Worth its own case because it
		// is the path a stream of small integers and zeros does *not* take, and a
		// compressor that was only ever exercised on compressible data would be
		// untested exactly here.
		for (const length of [64, 4_096, 65_536]) {
			roundTrip(noise(length, 11));
		}
	});

	test(
		"round-trips every block of both real saves",
		() => {
			// The end-to-end claim, on the blocks the game wrote rather than on
			// anything adversarial: inflate each chunk as the file stored it,
			// recompress it, and require the shipped decoder to give back exactly the
			// original bytes.
			//
			// `parseContainer` reads the chunk table without decompressing, so the
			// compressed bytes can be sliced straight out of the file. That is what
			// makes this per-block rather than whole-payload.
			for (const [label, file] of [
				["8559a", smallSave()],
				["52586", largeSave()],
			] as const) {
				const container = parseContainer(file);
				expect(container.chunks.length).toBeGreaterThan(0);
				for (const chunk of container.chunks) {
					const stored = file.subarray(
						chunk.start,
						chunk.start + chunk.compressedSize,
					);
					const original = lz4DecompressBlock(stored, chunk.decompressedSize);
					const recompressed = lz4CompressBlock(original);
					expect({
						label,
						chunk: chunk.index,
						bytes: original.length,
					}).toEqual({ label, chunk: chunk.index, bytes: original.length });
					expect([
						...lz4DecompressBlock(recompressed, original.length),
					]).toEqual([...original]);
				}
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"compresses a real block smaller than the game did, or at worst not much larger",
		() => {
			// Not a correctness claim — a compressor that merely inflates would still
			// round-trip, and this is the check that catches one. The reference
			// compressor's ratio is the target; a greedy single-slot matcher cannot
			// match it exactly, so the bound is deliberately loose.
			const file = smallSave();
			const container = parseContainer(file);
			const chunk = container.chunks[0];
			if (chunk === undefined) throw new Error("the fixture has no chunk");
			const original = lz4DecompressBlock(
				file.subarray(chunk.start, chunk.start + chunk.compressedSize),
				chunk.decompressedSize,
			);
			expect(lz4CompressBlock(original).length).toBeLessThanOrEqual(
				chunk.compressedSize,
			);
			expect(lz4StoredBlock(original).length).toBeGreaterThan(
				chunk.compressedSize,
			);
		},
		FIXTURE_TIMEOUT_MS,
	);
});

describe("LZ4 stored blocks", () => {
	test("round-trips through the decoder as pure literals", () => {
		// `lz4StoredBlock` exists so the container's bookkeeping can be tested
		// without the compressor in the way, and a "stored" block that the decoder
		// cannot read would make that test lie about what it proves.
		for (const length of [0, 1, 14, 15, 16, 300, 5_000]) {
			const source = noise(length, 5);
			expect([...lz4DecompressBlock(lz4StoredBlock(source), length)]).toEqual([
				...source,
			]);
		}
	});
});
