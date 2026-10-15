import { describe, expect, test } from "bun:test";
import {
	lz4CompressBlock,
	lz4DecompressBlock,
	lz4StoredBlock,
} from "../../shared/save/lz4";
import { parseContainer } from "../lib/container";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

const noise = (length: number, seed = 1): Uint8Array => {
	const out = new Uint8Array(length);
	for (let index = 0; index < length; index += 1) {
		out[index] = (Math.imul(index + seed, 2654435761) >>> 13) & 0xff;
	}
	return out;
};

const roundTrip = (source: Uint8Array): Uint8Array => {
	const rebuilt = lz4DecompressBlock(lz4CompressBlock(source), source.length);
	expect([...rebuilt]).toEqual([...source]);
	return rebuilt;
};

describe("LZ4 compressor", () => {
	test("round-trips input shorter than one token, where nothing may be encoded", () => {
		for (let length = 0; length < 15; length += 1) {
			const source = noise(length);
			const block = lz4CompressBlock(source);
			expect([...lz4DecompressBlock(block, length)]).toEqual([...source]);
		}
	});

	test("round-trips a literal run that overflows the token nibble", () => {
		for (const length of [14, 15, 16, 29, 30, 31, 269, 270, 271, 285]) {
			roundTrip(noise(length, 7));
		}
	});

	test("round-trips input whose only match is shorter than MIN_MATCH", () => {
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
		const literals = [1, 2, 3, 4];
		const block = new Uint8Array([
			(literals.length << 4) | 0x0f,
			...literals,
			4,
			0,
			20,
		]);
		expect(() => lz4DecompressBlock(block, 7)).toThrow(
			/inflates past the size it declared/,
		);
	});

	test("round-trips a run of identical bytes, which compresses by overlapping", () => {
		for (const length of [64, 1_000, 65_536, 300_000]) {
			roundTrip(new Uint8Array(length));
		}
		expect(lz4CompressBlock(new Uint8Array(300_000)).length).toBeLessThan(
			300_000 / 100,
		);
	});

	test("round-trips a long match whose length overflows the token nibble", () => {
		for (const length of [18, 19, 20, 21, 33, 34, 300, 5_000]) {
			const source = new Uint8Array(length).fill(0x5a);
			roundTrip(source);
		}
	});

	test("round-trips a match whose length is an exact multiple of 255", () => {
		for (const length of [15, 270, 525, 780, 4_000]) {
			roundTrip(noise(length, 3));
			roundTrip(new Uint8Array(length).fill(0x11));
		}
	});

	test("round-trips a block with a match at the maximum representable offset", () => {
		const source = new Uint8Array(70_000);
		source.fill(9, 0, 4);
		source.set([9, 9, 9, 9], 65_539);
		roundTrip(source);
	});

	test("round-trips incompressible input, which is all literals", () => {
		for (const length of [64, 4_096, 65_536]) {
			roundTrip(noise(length, 11));
		}
	});

	test(
		"round-trips every block of both real saves",
		() => {
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
						roundTripped: [
							...lz4DecompressBlock(recompressed, original.length),
						],
					}).toEqual({
						label,
						chunk: chunk.index,
						roundTripped: [...original],
					});
				}
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"compresses a real block smaller than the game did, or at worst not much larger",
		() => {
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
		for (const length of [0, 1, 14, 15, 16, 300, 5_000]) {
			const source = noise(length, 5);
			expect([...lz4DecompressBlock(lz4StoredBlock(source), length)]).toEqual([
				...source,
			]);
		}
	});
});
