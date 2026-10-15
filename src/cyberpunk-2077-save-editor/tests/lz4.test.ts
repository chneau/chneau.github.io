import { describe, expect, test } from "bun:test";
import {
	lz4CompressBlock,
	lz4CompressBound,
	lz4DecompressBlock,
} from "../../shared/save/lz4";

describe("LZ4 block", () => {
	test("round-trips data with no repetition", () => {
		const source = randomBytes(4096);
		expect([
			...lz4DecompressBlock(lz4CompressBlock(source), source.length),
		]).toEqual([...source]);
	});

	test("round-trips long runs of zeroes, which is the save-shaped case", () => {
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
		const source = new Uint8Array(5000);
		const rebuilt = lz4DecompressBlock(lz4CompressBlock(source), source.length);
		expect([...rebuilt]).toEqual([...source]);
	});

	test("round-trips a long match whose length overflows the token nibble", () => {
		const source = new Uint8Array(1000).fill(0x5a);
		expect([
			...lz4DecompressBlock(lz4CompressBlock(source), source.length),
		]).toEqual([...source]);
	});

	test("round-trips a match at the maximum representable offset", () => {
		const source = new Uint8Array(70_000);
		source.fill(9, 0, 4);
		source.set([1, 2, 3, 4], 65_539);
		const rebuilt = lz4DecompressBlock(lz4CompressBlock(source), source.length);
		expect([...rebuilt]).toEqual([...source]);
	});

	test("round-trips empty input", () => {
		const source = new Uint8Array(0);
		expect(lz4DecompressBlock(lz4CompressBlock(source), 0)).toHaveLength(0);
	});

	test("never exceeds the documented expansion bound", () => {
		const source = randomBytes(50_000);
		expect(lz4CompressBlock(source).length).toBeLessThanOrEqual(
			lz4CompressBound(source.length),
		);
	});

	test("rejects a block that inflates to a different size than it declares", () => {
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
		expect(() =>
			lz4DecompressBlock(new Uint8Array([0x50, 1, 2, 3]), 10_000_000),
		).toThrow(/more output than it can hold/);
	});

	test("rejects a match offset pointing outside the output", () => {
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

const randomBytes = (length: number): Uint8Array => {
	const out = new Uint8Array(length);
	for (let index = 0; index < length; index += 1) {
		out[index] = (Math.imul(index + 1, 2654435761) >>> 13) & 0xff;
	}
	return out;
};
