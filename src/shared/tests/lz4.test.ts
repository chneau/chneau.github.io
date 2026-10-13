import { describe, expect, test } from "bun:test";
import {
	lz4CompressBlock,
	lz4CompressBound,
	lz4DecompressBlock,
	lz4StoredBlock,
} from "../save/lz4";

/**
 * The shared LZ4 block codec.
 *
 * This file used to be two codecs: one under each save editor. The Cyberpunk
 * copy had both directions and a `lz4CompressBound`; the Witcher copy had a
 * decoder with richer error text, and its compressor in a sibling module along
 * with a `lz4StoredBlock` used to prove the container's bookkeeping without the
 * compressor in the way. They disagreed on nothing that mattered to a save —
 * both decoded the blocks the games wrote — and disagreed on plenty that
 * mattered to the next reader, which is what this suite is here to settle.
 *
 * It is deliberately *not* the union of the two suites it replaces. Those stay
 * where they are, in `cyberpunk-2077-save-editor/tests/lz4.test.ts` and
 * `witcher-3-save-editor/tests/lz4-write.test.ts`, where they are exercised
 * through their own containers. What is asserted here is the property that has
 * to hold wherever the codec is called from and that no editor's fixture can
 * establish alone: **compress, then decompress, and get the input back byte for
 * byte**, over the input shapes that reach each branch of the encoder.
 */

/** Pseudo-random bytes that are not genuinely random, so a failure is repeatable. */
const noise = (length: number, seed = 1): Uint8Array => {
	const out = new Uint8Array(length);
	for (let index = 0; index < length; index += 1) {
		out[index] = (Math.imul(index + seed, 2654435761) >>> 13) & 0xff;
	}
	return out;
};

/** Round-trip one block and assert byte equality, naming the length on failure. */
const roundTrip = (source: Uint8Array): Uint8Array => {
	const rebuilt = lz4DecompressBlock(lz4CompressBlock(source), source.length);
	expect({ length: source.length, rebuilt: [...rebuilt] }).toEqual({
		length: source.length,
		rebuilt: [...source],
	});
	return rebuilt;
};

describe("LZ4 block decompression", () => {
	test("expands a hand-built block: literals, then a match", () => {
		// Built by hand rather than compressed, because a round-trip alone cannot
		// tell a decoder that agrees with its own encoder from a decoder that is
		// right. The literals "abcd", then a 4-byte match at offset 4 — which
		// repeats the literals, so the expected output is eight bytes.
		const block = new Uint8Array([0x40, 0x61, 0x62, 0x63, 0x64, 0x04, 0x00]);
		expect([...lz4DecompressBlock(block, 8)]).toEqual([
			0x61, 0x62, 0x63, 0x64, 0x61, 0x62, 0x63, 0x64,
		]);
	});

	test("expands a match that overlaps itself", () => {
		// One literal, then a match at offset 1 of 15 bytes (low nibble 11, plus
		// the format's minimum of four) — every output byte is the byte before it.
		// This is how a run of identical bytes compresses at all, and a decoder
		// that copied the match in blocks rather than forward would read bytes this
		// match has not written yet.
		const block = new Uint8Array([0x1b, 0x5a, 0x01, 0x00]);
		expect([...lz4DecompressBlock(block, 16)]).toEqual(
			Array.from({ length: 16 }, () => 0x5a),
		);
	});

	test("reads the 255-chained length extensions", () => {
		// A literal run of 270 needs a saturated high nibble (15) plus a chain of
		// 255 and a terminating 0. A decoder that stopped at the first byte would
		// consume the second as a literal and produce 256 bytes.
		const source = noise(270, 3);
		const block = new Uint8Array([0xf0, 255, 0, ...source]);
		expect([...lz4DecompressBlock(block, 270)]).toEqual([...source]);
	});

	test("refuses a block that inflates past its declared size", () => {
		const block = lz4CompressBlock(noise(4_096));
		expect(() => lz4DecompressBlock(block, 4_000)).toThrow(/past the size/);
	});

	test("refuses a block that stops short of its declared size", () => {
		const block = lz4CompressBlock(noise(4_096));
		expect(() => lz4DecompressBlock(block, 4_100)).toThrow(/inflated to/);
	});

	test("refuses an impossible declared size before allocating", () => {
		// The number is attacker-adjacent: it came off someone's disk, and four
		// input bytes claiming ten million of output must not become a ten-million
		// byte allocation before the input is looked at.
		expect(() =>
			lz4DecompressBlock(new Uint8Array([0x50, 1, 2, 3]), 10_000_000),
		).toThrow(/more output than it can hold/);
	});
});

describe("LZ4 block compression", () => {
	test("round-trips input too short for a match to be legal", () => {
		// Below 13 bytes the block-format tail rules leave nothing to match
		// against, so the whole input is one literal run.
		for (let length = 0; length < 15; length += 1) {
			roundTrip(noise(length));
		}
	});

	test("round-trips literal runs that straddle the nibble boundary", () => {
		// 15 literals saturate the high nibble and spill into the extension chain.
		for (const length of [14, 15, 16, 29, 30, 269, 270, 271, 285]) {
			roundTrip(noise(length, 7));
		}
	});

	test("round-trips a run of identical bytes", () => {
		// The overlapping-match path, at lengths from one sequence to many.
		for (const length of [64, 1_000, 65_536, 300_000]) {
			roundTrip(new Uint8Array(length));
		}
	});

	test("round-trips match lengths that overflow the low nibble", () => {
		// A match of 19 or more saturates the low nibble, and the extension
		// encodes the length *above* the four the nibble already carries. Writing
		// the unmatched length instead decodes four bytes too long, which overruns
		// the block rather than corrupting it quietly — and the quiet version of
		// the same bug is a plausible-looking save with a few bytes missing.
		for (const length of [18, 19, 20, 33, 34, 300, 5_000]) {
			roundTrip(new Uint8Array(length).fill(0x5a));
		}
	});

	test("round-trips lengths that are a whole number of 255s", () => {
		// The chain needs a trailing zero when the run is an exact multiple of
		// 255, or the reader consumes one byte too many and reads the next token
		// as a length.
		for (const length of [270, 525, 780, 4_000]) {
			roundTrip(noise(length, 3));
			roundTrip(new Uint8Array(length).fill(0x11));
		}
	});

	test("round-trips incompressible input, which is all literals", () => {
		// No match is found, so every sequence is a token plus its literals — the
		// path a compressor exercised only on compressible data never reaches.
		for (const length of [64, 4_096, 65_536]) {
			roundTrip(noise(length, 11));
		}
	});

	test("round-trips a match at the maximum representable offset", () => {
		// The offset field is two bytes, so 65535 is the furthest a match reaches.
		const source = new Uint8Array(70_000);
		source.fill(9, 0, 4);
		source.set([9, 9, 9, 9], 65_539);
		roundTrip(source);
	});

	test("never exceeds its own bound on the output size", () => {
		// `lz4CompressBound` is what the Cyberpunk container sizes its output
		// buffer from, so an encoder that overran it would corrupt the following
		// bytes of the file rather than fail here.
		for (const length of [0, 13, 15, 270, 4_096, 65_536]) {
			expect(lz4CompressBlock(noise(length)).length).toBeLessThanOrEqual(
				lz4CompressBound(length),
			);
		}
	});

	test("compresses a run of zeroes, which round-trips alone cannot prove", () => {
		// A compressor that stopped matching altogether would still round-trip
		// every case above, and this is the assertion that catches it.
		expect(lz4CompressBlock(new Uint8Array(300_000)).length).toBeLessThan(
			300_000 / 100,
		);
	});
});

describe("LZ4 stored blocks", () => {
	test("round-trips as pure literals", () => {
		// The container's bookkeeping can then be proved without the compressor in
		// the way — but only if the decoder reads a stored block, so this is a
		// claim about the codec and not just about the helper.
		for (const length of [0, 1, 14, 15, 16, 300, 5_000]) {
			const source = noise(length, 5);
			expect([...lz4DecompressBlock(lz4StoredBlock(source), length)]).toEqual([
				...source,
			]);
		}
	});

	test("costs more than the compressor, which is why it is not the default", () => {
		const source = noise(4_096, 13);
		expect(lz4StoredBlock(source).length).toBeGreaterThan(
			lz4CompressBlock(source).length,
		);
	});
});
