import {
	type Bytes,
	type JsonValue,
	type QuickAction,
	type SaveCodec,
	type SummaryRow,
	xorBytes,
} from "../../shared";

export const XOR_KEY = 0x81;

export const decodeToJson = (bytes: Bytes): JsonValue => {
	const text = new TextDecoder().decode(bytes);
	const plain = new Uint8Array(text.length);
	for (let index = 0; index < text.length; index += 1) {
		plain[index] = (text.charCodeAt(index) & 0xff) ^ XOR_KEY;
	}
	const source = new TextDecoder("utf-8", { fatal: false }).decode(plain);
	const parsed: unknown = JSON.parse(source);
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("This file decrypted, but it is not a save profile.");
	}
	return parsed as JsonValue;
};

export const encodeFromJson = (doc: JsonValue): Bytes => {
	const plain = new TextEncoder().encode(JSON.stringify(doc));
	const scrambled = xorBytes(plain, XOR_KEY);
	let text = "";
	for (const byte of scrambled) {
		text += String.fromCharCode(byte);
	}
	return new TextEncoder().encode(text);
};

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

const ACTIONS: readonly QuickAction[] = [];

export const tailsOfIron2: SaveCodec = {
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
