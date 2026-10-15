import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	applyEdits,
	type Bytes,
	bytesEqual,
	firstDifference,
	getAtPath,
	type JsonValue,
} from "../../shared";
import { deadlyDays } from "../lib/format";
import { gvasOf } from "../lib/gvas";
import {
	type Guid,
	readGuid,
	UnrealReader,
	UnrealWriter,
	writeGuid,
} from "../lib/properties";

const FIXTURE_DIRECTORY = fileURLToPath(
	new URL(
		"../../../../testing/testing-decrypt-deadly-days-roadtrip-savegame/",
		import.meta.url,
	),
);

const fixture = (name: string): Bytes | null => {
	try {
		return new Uint8Array(readFileSync(`${FIXTURE_DIRECTORY}${name}`));
	} catch {
		return null;
	}
};

const ORIGINAL = fixture("SaveSlot_DDR_0.sav");
const EDITED = fixture("SaveSlot_DDR_0_edited.sav");

const required = (bytes: Bytes | null): Bytes => {
	if (bytes === null) throw new Error("fixture missing");
	return bytes;
};

const decode = (bytes: Bytes): Promise<JsonValue> => deadlyDays.decode(bytes);

const withByte = (bytes: Bytes, at: number, value: number): Bytes => {
	const copy = bytes.slice();
	const existing = copy[at];
	if (existing === undefined) throw new Error(`No byte at offset ${at}.`);
	copy[at] = value;
	return copy;
};

const tinySave = (): Bytes => {
	const writer = new UnrealWriter();
	writer.latin1("GVAS");
	writer.i32(3);
	writer.i32(522);
	writer.i32(1018);
	writer.u16(5);
	writer.u16(7);
	writer.u16(4);
	writer.u32(51_494_982);
	writer.fString("++UE5+Release-5.7");
	writer.i32(3);
	writer.i32(1);
	writeGuid(writer, "9c54d522-a826-4fbe-9421-074661b482d0");
	writer.i32(44);
	writer.fString("/Script/PixelsplitSaveSystem.PixelSaveGame");
	writer.u8(0);
	writer.fString("Balance");
	writer.fString("IntProperty");
	writer.i32(0);
	writer.i32(4);
	writer.u8(0);
	writer.i32(17);
	writer.fString("None");
	return new Uint8Array(writer.finish());
};

describe("Deadly Days: Roadtrip codec", () => {
	test("the codec contract is satisfied", () => {
		expect(deadlyDays.extensions).toEqual(["sav"]);
		expect(deadlyDays.notes.length).toBeGreaterThanOrEqual(3);
		expect(deadlyDays.defaultPath).toContain("SaveSlot_DDR_0.sav");
		expect(deadlyDays.actions.length).toBeGreaterThan(0);
	});

	test("says so plainly when the file is not an Unreal save", async () => {
		const notASave = new Uint8Array(64);
		notASave.set([0x50, 0x4b, 0x03, 0x04], 0);
		await expect(decode(notASave)).rejects.toThrow(/rather than "GVAS"/);
	});

	test("refuses a truncated save rather than decoding half of one", async () => {
		await expect(decode(tinySave().slice(0, 40))).rejects.toThrow(
			/Truncated save/,
		);
	});

	test("re-encodes a decoded document to the very same bytes", async () => {
		const bytes = tinySave();
		const rebuilt = await deadlyDays.encode(await decode(bytes));
		expect(firstDifference(bytes, rebuilt)).toBeUndefined();
		expect(bytesEqual(bytes, rebuilt)).toBe(true);
	});
});

const ROSTER: readonly (string | number)[] = [
	"list",
	"properties",
	0,
	"value",
	"entries",
	16,
	"value",
	"list",
	"properties",
	1,
	"value",
	"items",
	0,
	"value",
	"properties",
	0,
	"value",
	"items",
];

describe("the GVAS header", () => {
	test("is little-endian, with the field order the committed file uses", async () => {
		const bytes = tinySave();
		expect([...bytes.subarray(0, 16)]).toEqual([
			0x47, 0x56, 0x41, 0x53, 0x03, 0x00, 0x00, 0x00, 0x0a, 0x02, 0x00, 0x00,
			0xfa, 0x03, 0x00, 0x00,
		]);
		const save = gvasOf(await decode(bytes));
		expect(save.magic).toBe("GVAS");
		expect(save.fileVersion).toBe(3);
		expect(save.saveGameVersion).toBe(522);
		expect(save.packageFileUE5Version).toBe(1018);
		expect(save.engine).toEqual({
			major: 5,
			minor: 7,
			patch: 4,
			changelist: 51_494_982,
			branch: "++UE5+Release-5.7",
		});
		expect(save.customVersionFormat).toBe(3);
		expect(save.customVersions).toEqual([
			{ id: "9c54d522-a826-4fbe-9421-074661b482d0", version: 44 },
		]);
		expect(save.saveGameType).toBe(
			"/Script/PixelsplitSaveSystem.PixelSaveGame",
		);
	});

	test("a GUID is four little-endian words, which is what uesave writes", () => {
		const writer = new UnrealWriter();
		writeGuid(writer, "00010203-0405-0607-0809-0a0b0c0d0e0f");
		const bytes = writer.finish();
		expect([...bytes]).toEqual([
			0x03, 0x02, 0x01, 0x00, 0x07, 0x06, 0x05, 0x04, 0x0b, 0x0a, 0x09, 0x08,
			0x0f, 0x0e, 0x0d, 0x0c,
		]);
		const read: Guid = readGuid(new UnrealReader(bytes));
		expect(read).toBe("00010203-0405-0607-0809-0a0b0c0d0e0f");
	});

	test("an FString keeps a tab and a newline as single bytes", () => {
		const value = '{\r\n\t"Blockage": 6\r\n}';
		const writer = new UnrealWriter();
		writer.fString(value);
		writer.fString("");
		writer.fString("café");
		const bytes = writer.finish();
		const terminator = 4 + value.length;
		expect(bytes[terminator]).toBe(0);
		expect([...bytes.subarray(terminator + 1, terminator + 5)]).toEqual([
			0, 0, 0, 0,
		]);
		const reader = new UnrealReader(bytes);
		expect(reader.fString()).toBe(value);
		expect(reader.fString()).toBe("");
		expect(reader.fString()).toBe("café");
		expect(reader.done).toBe(true);
	});
});

describe.skipIf(ORIGINAL === null)("the committed SaveSlot_DDR_0.sav", () => {
	const original = (): Bytes => required(ORIGINAL);

	test("decodes, and its header is the one that was measured", async () => {
		const save = gvasOf(await decode(original()));
		expect(save.engine.branch).toBe("++UE5+Release-5.7");
		expect(save.customVersions).toHaveLength(85);
		expect(save.customVersions[0]).toEqual({
			id: "9c54d522-a826-4fbe-9421-074661b482d0",
			version: 44,
		});
		expect(save.saveGameType).toBe(
			"/Script/PixelsplitSaveSystem.PixelSaveGame",
		);
	});

	test("re-encodes to the identical 349,470 bytes", async () => {
		const bytes = original();
		const rebuilt = await deadlyDays.encode(await decode(bytes));
		expect(firstDifference(bytes, rebuilt)).toBeUndefined();
		expect(rebuilt).toHaveLength(349_470);
	});

	test("the summary reads the save, rather than a table of assumptions", async () => {
		const rows = deadlyDays.summarise(await decode(original()));
		const byLabel = new Map(rows.map((row) => [row.label, row.value]));
		expect(byLabel.get("Container")).toBe("GVAS");
		expect(byLabel.get("Engine")).toBe("5.7.4");
		expect(byLabel.get("Game version")).toBe("0.21.6");
		expect(byLabel.get("Subsystems")).toBe("18");
		expect(byLabel.get("Wallet")).toBe("105332");
		expect(byLabel.get("Rare currency")).toBe("99063");
		expect(byLabel.get("Characters")).toBe("2");
		expect(byLabel.get("Meta upgrades")).toBe("30");
		expect(byLabel.get("Achievements")).toBe("18");
		expect(byLabel.get("Unlocks")).toBe("15");
		expect(byLabel.get("Decoded subsystems")).toBe("16 of 18");
	});

	test("the currency cheat plans two edits, and plans the same two twice", async () => {
		const doc = await decode(original());
		const cheat = deadlyDays.actions.find((action) => action.id === "cheat");
		if (!cheat) throw new Error("no cheat action");
		const first = cheat.plan(doc);
		expect(cheat.plan(doc)).toEqual(first);
		expect(JSON.stringify(doc)).toBe(JSON.stringify(await decode(original())));
		expect(first).toHaveLength(2);
		expect(first.map((edit) => String(edit.before)).sort()).toEqual([
			"105332",
			"99063",
		]);
		for (const edit of first) expect(edit.after).toBe(999_999);
	});

	test("filling the wallets produces a save that reads back filled", async () => {
		const bytes = original();
		const doc = await decode(bytes);
		const cheat = deadlyDays.actions.find((action) => action.id === "cheat");
		if (!cheat) throw new Error("no cheat action");
		const rebuilt = await deadlyDays.encode(applyEdits(doc, cheat.plan(doc)));
		const reread = new Map(
			deadlyDays
				.summarise(await decode(rebuilt))
				.map((row) => [row.label, row.value]),
		);
		expect(reread.get("Wallet")).toBe("999999");
		expect(reread.get("Rare currency")).toBe("999999");
		expect(rebuilt).toHaveLength(bytes.length);
	});

	test("a wallet whose payload does not decode is still found by its bytes", async () => {
		const doc = await decode(withByte(original(), 2078 + 40, 5));
		const cheat = deadlyDays.actions.find((action) => action.id === "cheat");
		if (!cheat) throw new Error("no cheat action");
		const edits = cheat.plan(doc);
		const byPath = new Map(edits.map((edit) => [edit.label, edit]));
		expect(byPath.get("MetaCurrencyWallet · CurrencyAmount")?.before).toBe(
			105332,
		);
		expect(edits).toHaveLength(2);
	});

	test("the level cheats touch only the fields the save names", async () => {
		const doc = await decode(original());
		const level = deadlyDays.actions.find(
			(action) => action.id === "max-level",
		);
		const stats = deadlyDays.actions.find(
			(action) => action.id === "cheat-stats",
		);
		if (!level || !stats) throw new Error("missing actions");
		expect(level.plan(doc).map((edit) => edit.before)).toEqual([1, 3]);
		const upgrades = stats.plan(doc);
		expect(upgrades).toHaveLength(18);
		expect([...new Set(upgrades.map((edit) => edit.after))]).toEqual([30]);
	});
});

describe.skipIf(ORIGINAL === null || EDITED === null)(
	"the committed pair of saves",
	() => {
		test("differ in exactly one place, and it is the character roster", async () => {
			const before = await decode(required(ORIGINAL));
			const after = await decode(required(EDITED));
			expect(differingPaths(before, after)).toEqual([ROSTER.join(".")]);
		});

		test("the edited save carries eleven characters, the original two", async () => {
			const before = roster(await decode(required(ORIGINAL)));
			const after = roster(await decode(required(EDITED)));
			expect(before).toEqual(["CD_Survivor", "CD_Sherrif"]);
			expect(after).toHaveLength(11);
			expect(after).toContain("CD_Santa");
			expect(new Set(afterLevels(await decode(required(EDITED))))).toEqual(
				new Set([1, 3, 10]),
			);
		});

		test("both re-encode to their own bytes, not to each other's", async () => {
			for (const bytes of [required(ORIGINAL), required(EDITED)]) {
				const rebuilt = await deadlyDays.encode(await decode(bytes));
				expect(firstDifference(bytes, rebuilt)).toBeUndefined();
			}
		});
	},
);

const roster = (doc: JsonValue): readonly string[] => {
	const items = getAtPath(doc, ROSTER);
	if (!Array.isArray(items)) throw new Error("no roster");
	return items.map((item) => {
		const character = getAtPath(item, [
			"list",
			"properties",
			0,
			"value",
			"target",
			"subPath",
		]);
		if (typeof character !== "string") throw new Error("no character");
		return character;
	});
};

const afterLevels = (doc: JsonValue): readonly number[] => {
	const items = getAtPath(doc, ROSTER);
	if (!Array.isArray(items)) throw new Error("no roster");
	return items.map((item) => {
		const level = getAtPath(item, ["list", "properties", 1, "value", "value"]);
		if (typeof level !== "number") throw new Error("no level");
		return level;
	});
};

const differingPaths = (
	before: JsonValue,
	after: JsonValue,
): readonly string[] => {
	const paths: string[] = [];
	const isObject = (
		value: JsonValue,
	): value is { readonly [key: string]: JsonValue } =>
		typeof value === "object" && value !== null && !Array.isArray(value);
	const walk = (left: JsonValue, right: JsonValue, path: string): void => {
		if (JSON.stringify(left) === JSON.stringify(right)) return;
		if (Array.isArray(left) && Array.isArray(right)) {
			if (left.length !== right.length) {
				paths.push(path);
				return;
			}
			for (const [index, item] of left.entries()) {
				walk(item, right[index] ?? null, `${path}.${index}`);
			}
			return;
		}
		if (isObject(left) && isObject(right)) {
			for (const key of new Set([
				...Object.keys(left),
				...Object.keys(right),
			])) {
				walk(
					left[key] ?? null,
					right[key] ?? null,
					path ? `${path}.${key}` : key,
				);
			}
			return;
		}
		paths.push(path);
	};
	walk(before, after, "");
	return paths;
};
