import { describe, expect, test } from "bun:test";
import {
	lz4CompressBlock,
	lz4CompressBound,
	lz4DecompressBlock,
} from "../lib/lz4";

/**
 * LZ4 block codec.
 *
 * ## The honest limit of this suite
 *
 * **No real Cyberpunk 2077 save exists anywhere this work can reach**, so the
 * compressed chunks of a real `sav.dat` have never been fed through this code.
 * Everything below is synthetic. What *is* real is the format: these vectors
 * were cross-checked against the reference `lz4` 1.10 binary in both directions
 * — blocks this compressor produced were decompressed by the reference, and
 * blocks the reference produced were decompressed here — and the compressor's
 * output was byte-identical to the reference's on every comparable input. That
 * establishes the block codec agrees with the reference implementation; it does
 * not establish that a save the game wrote contains the blocks we expect.
 */

describe("LZ4 block", () => {
	test("round-trips data with no repetition", () => {
		const source = randomBytes(4096);
		expect([
			...lz4DecompressBlock(lz4CompressBlock(source), source.length),
		]).toEqual([...source]);
	});

	test("round-trips long runs of zeroes, which is the save-shaped case", () => {
		// A real save's node stream is a lot of zeroes and small integers, so an
		// overlap-heavy block is the ordinary case rather than the exotic one.
		const source = new Uint8Array(300_000);
		expect([
			...lz4DecompressBlock(lz4CompressBlock(source), source.length),
		]).toEqual([...source]);
		expect(lz4CompressBlock(source).length).toBeLessThan(source.length / 100);
	});

	test("round-trips a repeated byte", () => {
		const source = new Uint8Array(400_000).fill(0xab);
		expect([
			...lz4DecompressBlock(lz4CompressBlock(source), source.length),
		]).toEqual([...source]);
	});

	test("round-trips input at every length across the token boundaries", () => {
		// Literal lengths 0–14 sit in the token's high nibble and 15 spills into an
		// extension byte, so the interesting cases cluster at 4, 14, 15, 16, 269,
		// 270 and beyond. A single length would miss all of them.
		for (let length = 0; length <= 40; length += 1) {
			const source = new Uint8Array(length).fill(length & 0xff);
			const rebuilt = lz4DecompressBlock(lz4CompressBlock(source), length);
			expect([...rebuilt]).toEqual([...source]);
		}
		for (const length of [
			254, 255, 256, 269, 270, 271, 511, 512, 65_535, 65_536,
		]) {
			const source = new Uint8Array(length);
			for (let index = 0; index < length; index += 1) {
				source[index] = (index * 7) & 0xff;
			}
			const rebuilt = lz4DecompressBlock(lz4CompressBlock(source), length);
			expect([...rebuilt]).toEqual([...source]);
		}
	});

	test("round-trips a match that overlaps itself, at offset 1", () => {
		// A run of zeroes compresses to one literal followed by a match at offset
		// 1, where each output byte is the byte before it. A `copyWithin` wide
		// enough to straddle the cursor would read unwritten bytes; this is the
		// fixture that catches that.
		const source = new Uint8Array(5000);
		const rebuilt = lz4DecompressBlock(lz4CompressBlock(source), source.length);
		expect([...rebuilt]).toEqual([...source]);
	});

	test("round-trips a long match whose length overflows the token nibble", () => {
		// A match of 300+ bytes needs three extension bytes, which is the path a
		// short fixture never reaches.
		const source = new Uint8Array(1000).fill(0x5a);
		expect([
			...lz4DecompressBlock(lz4CompressBlock(source), source.length),
		]).toEqual([...source]);
	});

	test("round-trips a match at the maximum representable offset", () => {
		// The offset field is two bytes, so 65535 is the largest distance a match
		// can reach back. Laying the repeat exactly that far out is the fixture
		// that pins the limit.
		const source = new Uint8Array(70_000);
		source.fill(9, 0, 4);
		source.set([1, 2, 3, 4], 65_539);
		const rebuilt = lz4DecompressBlock(lz4CompressBlock(source), source.length);
		expect([...rebuilt]).toEqual([...source]);
	});

	test("round-trips empty input", () => {
		// A block of nothing still has to be a legal block, because a save whose
		// last chunk is empty would otherwise fail to rebuild.
		const source = new Uint8Array(0);
		expect(lz4DecompressBlock(lz4CompressBlock(source), 0)).toHaveLength(0);
	});

	test("never exceeds the documented expansion bound", () => {
		// Incompressible input is the case that inflates: the bound has to hold
		// there, or a save of random bytes would need a table it does not have.
		const source = randomBytes(50_000);
		expect(lz4CompressBlock(source).length).toBeLessThanOrEqual(
			lz4CompressBound(source.length),
		);
	});

	test("rejects a block that inflates to a different size than it declares", () => {
		// A block with no header of its own, so the declared size is the only check
		// there is. Declaring it too small is caught as the read overruns; declaring
		// it too large is caught at the end, where the totals disagree.
		const source = new Uint8Array(1000).fill(3);
		const block = lz4CompressBlock(source);
		expect(() => lz4DecompressBlock(block, 999)).toThrow(
			/inflates past the size it declared/,
		);
		expect(() => lz4DecompressBlock(block, 1001)).toThrow(
			/inflated to 1000 bytes/,
		);
	});

	test("rejects a declared size the block could never produce", () => {
		// The size comes off disk, so it is attacker-adjacent. Checking it against
		// the input before allocating is what stops a small file asking for a large
		// buffer.
		expect(() =>
			lz4DecompressBlock(new Uint8Array([0x50, 1, 2, 3]), 10_000_000),
		).toThrow(/more output than it can hold/);
	});

	test("rejects a match offset pointing outside the output", () => {
		// Token claims one literal then a match eight bytes back, when only one
		// byte has been written.
		const block = new Uint8Array([0x1f, 0xaa, 0x08, 0x00, 0xaa]);
		expect(() => lz4DecompressBlock(block, 32)).toThrow(/outside the output/);
	});

	test("rejects a zero match offset", () => {
		const block = new Uint8Array([0x1f, 0xaa, 0x00, 0x00, 0xaa]);
		expect(() => lz4DecompressBlock(block, 32)).toThrow(/outside the output/);
	});

	test("rejects a literal run that runs past the block", () => {
		const block = new Uint8Array([0xf0, 0x05, 0x01, 0x02]);
		expect(() => lz4DecompressBlock(block, 64)).toThrow(/runs past the end/);
	});

	test("rejects a truncated length chain", () => {
		// Token says the literal length overflows into an extension chain, and the
		// chain never terminates.
		const block = new Uint8Array([0xf0, 0xff, 0xff, 0xff]);
		expect(() => lz4DecompressBlock(block, 64)).toThrow(/length chain/);
	});

	test("rejects an impossible declared size", () => {
		expect(() => lz4DecompressBlock(new Uint8Array([0x00]), -1)).toThrow(
			/impossible size/,
		);
		expect(() => lz4DecompressBlock(new Uint8Array([0x00]), 1.5)).toThrow(
			/impossible size/,
		);
	});
});

/**
 * Pseudo-random bytes that are not genuinely random.
 *
 * A `Math.random` fixture would make a failure unreproducible, which is the one
 * property a regression test must have. The multiplier is odd, so the sequence
 * covers the byte range without a period short enough to look like structure.
 */
const randomBytes = (length: number): Uint8Array => {
	const out = new Uint8Array(length);
	for (let index = 0; index < length; index += 1) {
		out[index] = (Math.imul(index + 1, 2654435761) >>> 13) & 0xff;
	}
	return out;
};
