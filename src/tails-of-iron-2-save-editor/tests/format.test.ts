import { describe, expect, test } from "bun:test";
import type { JsonValue } from "../../shared";
import {
	decodeToJson,
	encodeFromJson,
	tailsOfIron2,
	XOR_KEY,
} from "../lib/format";

const PROFILE: JsonValue = {
	Version: 3,
	PlayerName: "Wren",
	Currenc: { Soft: 1420, Hard: 65 },
	Progress: { Chapter: 7, Unlocks: ["map", "smith"] },
	Settings: { MasterVolume: 0.8, Fullscreen: true },
};

const scramble = (character: string): string =>
	String.fromCharCode(character.charCodeAt(0) ^ XOR_KEY);

describe("Tails of Iron 2 codec", () => {
	test("round-trips a profile byte for byte", () => {
		const scrambled = encodeFromJson(PROFILE);
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
		const withAccents: JsonValue = { Name: "Renée Ångström 狐" };
		expect(decodeToJson(encodeFromJson(withAccents))).toEqual(withAccents);
	});

	test("an astral character survives a scramble, because the codec has none", () => {
		const withAstral: JsonValue = { Name: "🐦 Wren", Tag: "𝕏" };
		expect(decodeToJson(encodeFromJson(withAstral))).toEqual(withAstral);
	});

	test("a file that was never scrambled is refused, not half-decoded", () => {
		const plaintext = new TextEncoder().encode(
			JSON.stringify({ PlayerName: "🐦 Wren" }),
		);
		expect(() => decodeToJson(plaintext)).toThrow();
	});

	test("the scrambling is byte-for-byte reversible on a non-ASCII document", () => {
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
		const notAProfile = encodeFromJson(3);
		expect(() => decodeToJson(notAProfile)).toThrow(/not a save profile/);
	});

	test("the codec contract is satisfied", () => {
		expect(tailsOfIron2.extensions.length).toBeGreaterThan(0);
		expect(tailsOfIron2.notes.length).toBeGreaterThan(0);
		expect(tailsOfIron2.summarise(PROFILE).length).toBeGreaterThan(0);
	});
});
