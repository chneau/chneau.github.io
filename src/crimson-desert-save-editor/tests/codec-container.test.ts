/**
 * Negative-path tests for the container and the raw LZ4/ChaCha20 codec.
 *
 * The decode happy path is covered through the committed fixtures, but the
 * failure branches — where a damaged or hostile file must be refused — are not.
 * Fuzzing shows the codec is robust; these tests freeze that behaviour so a
 * future optimization cannot turn a throw into a silent misread.
 *
 * Run with `bun test` (or `bun run check:test`, the same command with the
 * repository's parallel and timeout settings).
 */

import { describe, expect, test } from "bun:test";
import { bytesEqual, writeU16, writeU32 } from "../lib/save-engine/bytes";
import { chacha20, lz4Compress, lz4Decompress } from "../lib/save-engine/codec";
import { decodeSave, encodeSave } from "../lib/save-engine/container";
import { fixture, opened } from "./fixtures";

const HEADER_SIZE = 0x80;
const PAYLOAD_SIZE_OFFSET = 0x16;
const MAGIC = [0x53, 0x41, 0x56, 0x45]; // "SAVE"

/** A deterministic byte stream, so a failing seed is reproducible. */
const pseudoRandom = (length: number, seed: number): Uint8Array => {
	const out = new Uint8Array(length);
	let state = seed >>> 0;
	for (let index = 0; index < length; index++) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		out[index] = state & 0xff;
	}
	return out;
};

/** A container whose header length matches its payload, with no valid HMAC. */
const containerOf = (version: number, payloadSize: number): Uint8Array => {
	const out = new Uint8Array(HEADER_SIZE + payloadSize);
	out.set(MAGIC, 0);
	writeU16(out, 0x04, version);
	writeU32(out, PAYLOAD_SIZE_OFFSET, payloadSize);
	for (let index = HEADER_SIZE; index < out.length; index++) {
		out[index] = (index * 31) & 0xff;
	}
	return out;
};

describe("given malformed LZ4", () => {
	test("a truncated length extension throws", () => {
		expect(() => lz4Decompress(new Uint8Array([0xf0]), 100)).toThrow(
			/Truncated LZ4 length/,
		);
	});

	test("a match offset past the output throws", () => {
		expect(() => lz4Decompress(new Uint8Array([0x00, 0x01, 0x00]), 4)).toThrow(
			/Invalid LZ4 match offset/,
		);
	});

	test("literals beyond the declared size throw", () => {
		expect(() => lz4Decompress(new Uint8Array([0x40, 1, 2, 3, 4]), 2)).toThrow(
			/exceeds declared size/,
		);
	});

	test("an impossible declared size is rejected before allocating", () => {
		expect(() => lz4Decompress(new Uint8Array(4), 4 * 255 + 1)).toThrow(
			/declared size exceeds/,
		);
	});

	test("a negative or fractional declared size throws", () => {
		expect(() => lz4Decompress(new Uint8Array(4), -1)).toThrow(
			/Invalid LZ4 output size/,
		);
		expect(() => lz4Decompress(new Uint8Array(4), 1.5)).toThrow(
			/Invalid LZ4 output size/,
		);
	});

	test("a stream that decodes to the wrong length throws", () => {
		expect(() => lz4Decompress(new Uint8Array([0x00]), 5)).toThrow(
			/decoded 0 bytes/,
		);
	});
});

describe("given the LZ4 codec", () => {
	test("round-trips empty, repeating, patterned and random inputs", () => {
		const repeating = new Uint8Array(2048);
		for (let index = 0; index < repeating.length; index++) {
			repeating[index] = index % 7;
		}
		const inputs = [
			new Uint8Array(0),
			new Uint8Array(1),
			new Uint8Array(1000).fill(0),
			repeating,
			pseudoRandom(4096, 1),
		];
		for (const input of inputs) {
			const packed = lz4Compress(input);
			expect(bytesEqual(lz4Decompress(packed, input.length), input)).toBe(true);
		}
	});
});

describe("given ChaCha20", () => {
	test("a key or nonce of the wrong length throws", () => {
		const data = new Uint8Array(8);
		expect(() =>
			chacha20(data, new Uint8Array(16), new Uint8Array(16)),
		).toThrow(/32-byte key/);
		expect(() => chacha20(data, new Uint8Array(8), new Uint8Array(32))).toThrow(
			/16-byte nonce/,
		);
	});

	test("decrypting the ciphertext with the same key restores the input", () => {
		const key = pseudoRandom(32, 7);
		const nonce = pseudoRandom(16, 9);
		const data = pseudoRandom(300, 11);
		expect(
			bytesEqual(chacha20(chacha20(data, nonce, key), nonce, key), data),
		).toBe(true);
	});

	test("a misaligned view produces the same keystream as an aligned copy", () => {
		const outer = new Uint8Array(70);
		outer.set(pseudoRandom(64, 3), 3);
		const misaligned = outer.subarray(3, 67);
		const aligned = misaligned.slice();
		const key = pseudoRandom(32, 5);
		const nonce = pseudoRandom(16, 6);
		expect(misaligned.byteOffset % 4).not.toBe(0);
		expect(
			bytesEqual(
				chacha20(misaligned, nonce, key),
				chacha20(aligned, nonce, key),
			),
		).toBe(true);
	});
});

describe("given a malformed container", () => {
	test("a save shorter than the header is rejected", async () => {
		await expect(decodeSave(new Uint8Array(0x20))).rejects.toThrow(
			/Save is truncated/,
		);
	});

	test("an invalid magic is rejected", async () => {
		await expect(decodeSave(new Uint8Array(HEADER_SIZE))).rejects.toThrow(
			/Invalid magic/,
		);
	});

	test("a payload/file-size mismatch is rejected", async () => {
		const out = new Uint8Array(HEADER_SIZE);
		out.set(MAGIC, 0);
		writeU32(out, PAYLOAD_SIZE_OFFSET, 5);
		await expect(decodeSave(out)).rejects.toThrow(
			/Payload\/file-size mismatch/,
		);
	});

	test("an unsupported version is rejected before decryption", async () => {
		await expect(decodeSave(containerOf(3, 0))).rejects.toThrow(
			/Unsupported save-container version/,
		);
	});

	test("a wrong HMAC is rejected instead of parsing the payload", async () => {
		await expect(decodeSave(containerOf(1, 16))).rejects.toThrow(
			/HMAC verification failed/,
		);
	});
});

describe("given a real save", () => {
	test("encode then decode returns the same payload", async () => {
		const decoded = await opened(fixture("save.save"));
		const encoded = await encodeSave(decoded.rawPayload, decoded.header);
		const round = await decodeSave(encoded);
		expect(round.header.version).toBe(decoded.header.version);
		expect(bytesEqual(round.rawPayload, decoded.rawPayload)).toBe(true);
	});
});
