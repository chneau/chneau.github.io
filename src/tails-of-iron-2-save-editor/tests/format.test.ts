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
