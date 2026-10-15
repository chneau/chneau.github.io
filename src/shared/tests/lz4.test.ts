import { describe, expect, test } from "bun:test";
import {
	lz4CompressBlock,
	lz4CompressBound,
	lz4DecompressBlock,
	lz4StoredBlock,
} from "../save/lz4";

const noise = (length: number, seed = 1): Uint8Array => {
	const out = new Uint8Array(length);
	for (let index = 0; index < length; index += 1) {
		out[index] = (Math.imul(index + seed, 2654435761) >>> 13) & 0xff;
	}
	return out;
};

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
		const block = new Uint8Array([0x40, 0x61, 0x62, 0x63, 0x64, 0x04, 0x00]);
		expect([...lz4DecompressBlock(block, 8)]).toEqual([
			0x61, 0x62, 0x63, 0x64, 0x61, 0x62, 0x63, 0x64,
		]);
	});

	test("expands a match that overlaps itself", () => {
		const block = new Uint8Array([0x1b, 0x5a, 0x01, 0x00]);
		expect([...lz4DecompressBlock(block, 16)]).toEqual(
			Array.from({ length: 16 }, () => 0x5a),
		);
	});

	test("reads the 255-chained length extensions", () => {
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
		expect(() =>
			lz4DecompressBlock(new Uint8Array([0x50, 1, 2, 3]), 10_000_000),
		).toThrow(/more output than it can hold/);
	});
});

describe("LZ4 block compression", () => {
	test("round-trips input too short for a match to be legal", () => {
		for (let length = 0; length < 15; length += 1) {
			roundTrip(noise(length));
		}
	});

	test("round-trips literal runs that straddle the nibble boundary", () => {
		for (const length of [14, 15, 16, 29, 30, 269, 270, 271, 285]) {
			roundTrip(noise(length, 7));
		}
	});

	test("round-trips a run of identical bytes", () => {
		for (const length of [64, 1_000, 65_536, 300_000]) {
			roundTrip(new Uint8Array(length));
		}
	});

	test("round-trips match lengths that overflow the low nibble", () => {
		for (const length of [18, 19, 20, 33, 34, 300, 5_000]) {
			roundTrip(new Uint8Array(length).fill(0x5a));
		}
	});

	test("round-trips lengths that are a whole number of 255s", () => {
		for (const length of [270, 525, 780, 4_000]) {
			roundTrip(noise(length, 3));
			roundTrip(new Uint8Array(length).fill(0x11));
		}
	});

	test("round-trips incompressible input, which is all literals", () => {
		for (const length of [64, 4_096, 65_536]) {
			roundTrip(noise(length, 11));
		}
	});

	test("round-trips a match at the maximum representable offset", () => {
		const source = new Uint8Array(70_000);
		source.fill(9, 0, 4);
		source.set([9, 9, 9, 9], 65_539);
		roundTrip(source);
	});

	test("never exceeds its own bound on the output size", () => {
		for (const length of [0, 13, 15, 270, 4_096, 65_536]) {
			expect(lz4CompressBlock(noise(length)).length).toBeLessThanOrEqual(
				lz4CompressBound(length),
			);
		}
	});

	test("compresses a run of zeroes, which round-trips alone cannot prove", () => {
		expect(lz4CompressBlock(new Uint8Array(300_000)).length).toBeLessThan(
			300_000 / 100,
		);
	});
});

describe("LZ4 stored blocks", () => {
	test("round-trips as pure literals", () => {
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
