import { describe, expect, test } from "bun:test";
import type { JsonValue } from "../../shared";
import {
	decodeToJson,
	encodeFromJson,
	tailsOfIron2,
	XOR_KEY,
} from "../lib/format";

/**
 * A profile shaped like the game's, used to pin the codec's behaviour without
 * depending on a committed save — none ships with the source repository.
 */
const PROFILE: JsonValue = {
	Version: 3,
	PlayerName: "Wren",
	Currenc: { Soft: 1420, Hard: 65 },
	Progress: { Chapter: 7, Unlocks: ["map", "smith"] },
	Settings: { MasterVolume: 0.8, Fullscreen: true },
};

/** One plaintext character to its scrambled counterpart, the codec's own step. */
const scramble = (character: string): string =>
	String.fromCharCode(character.charCodeAt(0) ^ XOR_KEY);

describe("Tails of Iron 2 codec", () => {
	test("round-trips a profile byte for byte", () => {
		const scrambled = encodeFromJson(PROFILE);
		// Re-encoding an untouched document must reproduce the exact bytes, or
		// the round-trip proof on the page has nothing to stand on.
		expect(encodeFromJson(decodeToJson(scrambled))).toEqual(scrambled);
	});

	test("decodes to the original document", () => {
		expect(decodeToJson(encodeFromJson(PROFILE))).toEqual(PROFILE);
	});

	test("the scrambling is a single-byte XOR, so it is its own inverse", () => {
		const scrambled = encodeFromJson(PROFILE);
		const text = new TextDecoder().decode(scrambled);
		const reScrambled = new Uint8Array(text.length);
		for (const [index, character] of [...text].entries()) {
			reScrambled[index] = (character.charCodeAt(0) & 0xff) ^ XOR_KEY;
		}
		expect(new TextDecoder().decode(reScrambled)).toBe(JSON.stringify(PROFILE));
	});

	test("survives non-ASCII text, which is the case a naive port breaks", () => {
		// A byte whose XOR lands above 0x7F is stored as two UTF-8 bytes, so
		// this is the fixture that distinguishes a correct port from one that
		// XORs the raw file and shifts everything after it.
		const withAccents: JsonValue = { Name: "Renée Ångström 狐" };
		expect(decodeToJson(encodeFromJson(withAccents))).toEqual(withAccents);
	});

	test("an astral character survives a scramble, because the codec has none", () => {
		// The encoder builds its Latin-1 string a byte at a time, so nothing it
		// writes is ever astral; the decoder's per-code-unit XOR is what keeps
		// that true on the way back. Pinning it here means a change that makes
		// the string anything but Latin-1 fails here rather than on a user's save.
		const withAstral: JsonValue = { Name: "🐦 Wren", Tag: "𝕏" };
		expect(decodeToJson(encodeFromJson(withAstral))).toEqual(withAstral);
	});

	test("a file that was never scrambled is refused, not half-decoded", () => {
		// Handed the plaintext rather than the scrambled bytes, the decoder must
		// say the file is wrong. Before the loop was indexed by code unit, a
		// genuine astral character sized the buffer by code unit and filled it by
		// code point, so everything after it shifted by one byte; a file that is
		// mostly ASCII with one emoji is the shape where that is least visible.
		const plaintext = new TextEncoder().encode(
			JSON.stringify({ PlayerName: "🐦 Wren" }),
		);
		expect(() => decodeToJson(plaintext)).toThrow();
	});

	test("the scrambling is byte-for-byte reversible on a non-ASCII document", () => {
		// The write path spelled out: XOR the UTF-8 bytes, widen each result to a
		// code point below 0x100, and encode *that* as UTF-8. Any other ordering
		// still round-trips through this codec on some inputs, so it is compared
		// against the game's own two steps rather than against itself.
		const withAccents: JsonValue = { Name: "Renée Ångström 狐", N: 1420 };
		const expected = (() => {
			const scrambled = [
				...new TextEncoder().encode(JSON.stringify(withAccents)),
			].map((byte) => byte ^ XOR_KEY);
			return new TextEncoder().encode(String.fromCharCode(...scrambled));
		})();
		expect(encodeFromJson(withAccents)).toEqual(expected);
		expect(decodeToJson(expected)).toEqual(withAccents);
	});

	test("indexes the scrambled string by code unit, not by code point", () => {
		// The one place the two indexings can be told apart, and it needs a
		// hand-built file: anything the encoder writes is Latin-1, so nothing the
		// game produces contains an astral character.
		//
		// U+384A1 is spelled as the surrogate pair D8A1 DCA1, and both code units
		// have the low byte 0xA1 — the XOR of which is 0x20, a space. Substituted
		// for the scrambled space in an otherwise ordinary file, per-code-unit
		// indexing yields two spaces where the document had one, which JSON does
		// not mind, and the file decodes. Iterating by code point yields one byte
		// for the character and shifts every byte after it, so the buffer ends on
		// a stray NUL the parser rejects.
		//
		// Spelled with a space rather than taken from `JSON.stringify`, which
		// emits none and so has nothing to substitute.
		const plain = '{"Name": "Wren"}';
		const astral = "\u{384a1}";
		const text = [...plain]
			.map(scramble)
			.map((character) => (character === "¡" ? astral : character))
			.join("");
		expect(text.length).toBe(plain.length + 1);
		expect(text).toContain(astral);
		expect(decodeToJson(new TextEncoder().encode(text))).toEqual({
			Name: "Wren",
		});
	});

	test("rejects a file that is not a save profile", () => {
		// A bare JSON scalar decrypts cleanly but is not a profile; saying so is
		// better than rendering an empty inspector.
		const notAProfile = encodeFromJson(3);
		expect(() => decodeToJson(notAProfile)).toThrow(/not a save profile/);
	});

	test("the codec contract is satisfied", () => {
		expect(tailsOfIron2.extensions.length).toBeGreaterThan(0);
		expect(tailsOfIron2.notes.length).toBeGreaterThan(0);
		expect(tailsOfIron2.summarise(PROFILE).length).toBeGreaterThan(0);
	});
});
