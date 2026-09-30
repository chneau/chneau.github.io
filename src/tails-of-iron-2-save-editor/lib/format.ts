/**
 * Tails of Iron 2: Whiskers of Winter — `PlayerProfile.JSON`.
 *
 * The game's save is a Unity JSON document stored scrambled, and "scrambled"
 * turns out to mean one thing: every plaintext byte XORed with `0x81` and the
 * result written as UTF-8 text. There is no key derivation, no nonce and no
 * authentication, which is why this file is a hundred lines of TypeScript in
 * total and why the interesting work here is not the codec.
 *
 * ## The subtlety that will corrupt a save if you get it wrong
 *
 * The bytes are XORed and then written *as a string*, so the file on disk is
 * UTF-8, not raw Latin-1. Any byte whose XOR lands at or above `0x80` is
 * therefore stored as a two-byte UTF-8 sequence. Decoding the file with
 * `TextDecoder` and XORing each resulting code unit reproduces the original
 * bytes exactly; skipping that step — XORing the raw file bytes — silently
 * shifts everything after the first high byte and produces a file that decodes
 * to plausible-looking nonsense. Both directions below go through UTF-8 for
 * exactly this reason, and `round-trips byte for byte` in the tests pins it.
 */
import {
	type Bytes,
	type JsonValue,
	type QuickAction,
	type SaveCodec,
	type SummaryRow,
	xorBytes,
} from "../../shared";

/** The single byte the game XORs the whole profile with. */
export const XOR_KEY = 0x81;

/**
 * Scrambled bytes to the plain JSON document underneath.
 *
 * `& 0xff` before the XOR keeps the operation inside a byte: a UTF-8 decode of
 * a two-byte sequence yields a code unit below `0x100`, but the mask makes that
 * a property of the code rather than a coincidence of the input.
 */
export const decodeToJson = (bytes: Bytes): JsonValue => {
	const text = new TextDecoder().decode(bytes);
	const plain = new Uint8Array(text.length);
	for (const [index, character] of [...text].entries()) {
		plain[index] = (character.charCodeAt(0) & 0xff) ^ XOR_KEY;
	}
	const source = new TextDecoder("utf-8", { fatal: false }).decode(plain);
	const parsed: unknown = JSON.parse(source);
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("This file decrypted, but it is not a save profile.");
	}
	return parsed as JsonValue;
};

/** The plain document back to scrambled bytes, exactly as the game writes it. */
export const encodeFromJson = (doc: JsonValue): Bytes => {
	const plain = new TextEncoder().encode(JSON.stringify(doc));
	// Latin-1 string, then UTF-8 encoded: the two steps are the format, not a
	// convenience. Collapsing them to a raw `xorBytes` writes a file the game
	// will not read.
	const scrambled = xorBytes(plain, XOR_KEY);
	let text = "";
	for (const byte of scrambled) {
		text += String.fromCharCode(byte);
	}
	return new TextEncoder().encode(text);
};

/**
 * Counts the leaves in a document, which is the one summary figure that is
 * true for every profile regardless of which version wrote it.
 *
 * Deliberately structural. A summary that named currencies, levels or unlocks
 * would have to guess at field names across game versions, and a save editor
 * that invents a field it has not seen is worse than one that says what it
 * actually knows.
 */
const countLeaves = (value: JsonValue): number => {
	if (typeof value !== "object" || value === null) return 1;
	const entries = Array.isArray(value) ? value : Object.values(value);
	return entries.reduce<number>(
		(total, entry) => total + countLeaves(entry),
		0,
	);
};

const summarise: (doc: JsonValue) => readonly SummaryRow[] = (doc) => {
	const keys = typeof doc === "object" && doc !== null ? Object.keys(doc) : [];
	return [
		{ label: "Top-level fields", value: String(keys.length) },
		{ label: "Values in total", value: String(countLeaves(doc)) },
		{
			label: "Encoding",
			value: `XOR 0x${XOR_KEY.toString(16).padStart(2, "0")}`,
		},
	];
};

/**
 * No quick actions.
 *
 * The original tool offered none either, and inventing them would mean writing
 * field names no committed save confirms. The editor's job on this format is
 * to make the profile readable and let the change be made in the inspector,
 * where the field names come from the user's own file rather than from us.
 */
const ACTIONS: readonly QuickAction[] = [];

export const tailsOfIron2: SaveCodec = {
	id: "tails-of-iron-2-save-editor",
	game: "Tails of Iron 2",
	formatLabel: "Unity JSON, XOR 0x81",
	extensions: ["JSON", "json"],
	defaultPath:
		"%LOCALAPPDATA%\\..\\..\\AppData\\LocalLow\\Triple Hill Interactive\\Tails of Iron 2 Whiskers of Winter\\",
	notes: [
		{
			title: "One byte, applied to everything",
			body: "The profile is a plain Unity JSON document stored scrambled. Every byte of it is XORed with 0x81 and the result written as UTF-8 text. There is no key, no derivation and no checksum — which is why this can be undone exactly, and undone again to produce a file the game accepts.",
		},
		{
			title: "Why the file looks bigger than the save",
			body: "Because the scrambled bytes are written as a string. Anything that XORs above 0x7F is stored as a two-byte UTF-8 sequence, so the file on disk is longer than the profile inside it. Reading it as UTF-8 first and XORing afterwards is what makes the round trip lossless; XORing the raw bytes shifts everything after the first high byte.",
		},
		{
			title: "What this editor does not do",
			body: "It will not guess at fields. Tails of Iron 2 has changed its profile shape between versions, so rather than offer cheat buttons built on assumed names, the inspector lists the fields your own save actually has, and every change you make is rebuilt and read back before you are given the file.",
		},
	],
	decode: async (bytes) => decodeToJson(bytes),
	encode: async (doc) => encodeFromJson(doc),
	summarise,
	actions: ACTIONS,
};
