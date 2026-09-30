/**
 * Corrupt-input tests for the PARC parser.
 *
 * The parser trusts every length it reads, so a hostile or damaged payload is
 * the input that matters most: before the bounds guards it would walk past the
 * buffer and return a plausible-looking schema, and structural edits would then
 * write through that misread. These tests pin the failure: a corrupt blob must
 * throw, and a truncated one must not parse.
 *
 * Run with `bun test` (or `bun run check:test`, the same command with the
 * repository's parallel and timeout settings).
 */

import { describe, expect, test } from "bun:test";
import { hasBytes, requireBytes, writeU32 } from "../lib/save-engine/bytes";
import { parseParcBlob } from "../lib/save-engine/parc-serializer";
import { fixture, opened } from "./fixtures";

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

describe("requireBytes", () => {
	test("accepts an in-range read and an empty read at the end", () => {
		const data = new Uint8Array(4);
		expect(hasBytes(data, 2, 2)).toBe(true);
		expect(hasBytes(data, 4, 0)).toBe(true);
	});

	test("rejects a read that leaves the buffer", () => {
		const data = new Uint8Array(4);
		expect(hasBytes(data, 4, 1)).toBe(false);
		expect(hasBytes(data, -1, 1)).toBe(false);
		expect(() => requireBytes(data, 2, 3, "field")).toThrow(RangeError);
		expect(() => requireBytes(data, 2, 3, "field")).toThrow(/field/);
	});
});

describe("parseParcBlob corruption", () => {
	test("a blob shorter than the header is rejected", () => {
		expect(() => parseParcBlob(new Uint8Array(13))).toThrow(
			/Invalid PARC blob/,
		);
	});

	test("random bytes after the magic throw rather than parse", () => {
		for (let seed = 1; seed <= 32; seed++) {
			const blob = pseudoRandom(96, seed);
			// Keep the inner magic so parsing gets past it and reaches the
			// attacker-controlled lengths the run is about.
			blob[0] = 0xff;
			blob[1] = 0xff;
			expect(() => parseParcBlob(blob), `seed ${seed} must not parse`).toThrow(
				/Invalid PARC blob/,
			);
		}
	});

	test("a truncated fixture payload throws instead of misparsing", async () => {
		const decoded = await opened(fixture("save.save"));
		const raw = decoded.rawPayload;
		for (const length of [
			14,
			20,
			40,
			Math.floor(raw.length / 2),
			raw.length - 1,
		]) {
			expect(
				() => parseParcBlob(raw.slice(0, length)),
				`truncated to ${length}`,
			).toThrow(/Invalid PARC blob/);
		}
	});

	test("an implausible TOC entry count is rejected before it is walked", () => {
		const blob = new Uint8Array(32);
		blob[0] = 0xff;
		blob[1] = 0xff;
		// numRootEntries (14) and numTypes (18) stay zero, so the schema is
		// empty and the TOC header starts at 20. Claim 1000 entries with only
		// a dozen bytes left.
		writeU32(blob, 24, 1000);
		expect(() => parseParcBlob(blob)).toThrow(/TOC entry count/);
	});

	test("a TOC entry whose data starts before the block area is rejected", () => {
		const blob = new Uint8Array(14 + 6 + 12 + 20);
		blob[0] = 0xff;
		blob[1] = 0xff;
		writeU32(blob, 24, 1); // entryCount
		writeU32(blob, 44, 0); // dataOffset, before dataStart
		writeU32(blob, 48, 4); // dataSize
		expect(() => parseParcBlob(blob)).toThrow(/outside the blob/);
	});

	test("a TOC entry whose data runs past the blob is rejected", () => {
		const blob = new Uint8Array(14 + 6 + 12 + 20);
		blob[0] = 0xff;
		blob[1] = 0xff;
		writeU32(blob, 24, 1); // entryCount
		writeU32(blob, 44, 52); // dataOffset === dataStart
		writeU32(blob, 48, 4); // dataSize runs past the end
		expect(() => parseParcBlob(blob)).toThrow(/outside the blob/);
	});

	test("a type count beyond the schema cap is rejected", () => {
		const blob = new Uint8Array(20);
		blob[0] = 0xff;
		blob[1] = 0xff;
		// numTypes is a u16 at offset 18; 0xffff is far past any real schema.
		blob[18] = 0xff;
		blob[19] = 0xff;
		expect(() => parseParcBlob(blob)).toThrow(/implausible type count/);
	});
});
