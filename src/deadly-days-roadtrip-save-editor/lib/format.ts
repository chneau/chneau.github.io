/**
 * *Deadly Days: Roadtrip* — `SaveSlot_DDR_0.sav`.
 *
 * An Unreal Engine 5 GVAS save, unencrypted and unsigned, so the whole of it can
 * be read and rebuilt in a browser tab: no key, no nonce and no checksum to
 * defeat, and nothing to upload. The work is split by level rather than by game —
 * `gvas.ts` reads the outer container, and `properties.ts` reads the tagged
 * property stream, which is used at the outer level and again inside every byte
 * blob the save carries.
 *
 * ## Where the field names below come from
 *
 * Every one of them is in the committed save, read out of it rather than out of
 * documentation, which for this game does not exist. `SaveDataMap` holds
 * eighteen named subsystems; `MetaCurrencyWallet` and `RareMetaCurrency` each
 * hold one `IntProperty` called `CurrencyAmount`; `MetaUpgrades` holds
 * `PersistedUpgradeData`, an array of thirty structs of `UpgradeID`, `Level` and
 * `CurrencyInvested`; `CharacterMetaLevel` holds `PersistedData`, an array of
 * structs of `Character`, `MetaLevel`, `CurrencyInvested` and
 * `ModifierSelections`.
 *
 * Two of the reference tool's five cheats are deliberately absent. Its
 * `unlock-characters` and `cheat-modifiers` both append whole struct elements to
 * `CharacterMetaLevel.PersistedData`, each built from a hard-coded roster of
 * eleven character names, weapon paths and modifier paths — none of which this
 * save confirms, and the eleven names are not written anywhere in it. Shipping
 * them would be a button that writes plausible-looking asset paths the game may
 * not have. Its `cheat-stats` also filters upgrades through a list of twelve
 * GUIDs, and not one of those twelve appears anywhere in this save, so that
 * filter is not carried over either; the level it raises them to, 30, is the
 * highest this save already holds, which is where the number comes from.
 */
import {
	arrayAt,
	editId,
	indexOfBytes,
	type JsonValue,
	numberAt,
	objectAt,
	type QuickAction,
	type SaveCodec,
	type SaveEdit,
	type SavePath,
	type SummaryRow,
	stringAt,
} from "../../shared";
import { gvasOf, readGvas, writeGvas } from "./gvas";

/* -------------------------------------------------------------------------- */
/* Reading a document without pretending it is a typed one                    */
/* -------------------------------------------------------------------------- */

// `objectAt`/`arrayAt`/`numberAt`/`stringAt` are the shared readers
// (`shared/save/json.ts`): each codec had its own copy, and these are the ones
// they now share. See `findProperty` and the `Found` type below for how this
// codec uses them to build paths it knows exist.

/** A value found in the document, with the path that reaches it. */
type Found = { readonly value: JsonValue; readonly path: SavePath };

/** The `value` of the tag called `name` in a property list, or `undefined`. */
const findProperty = (
	properties: readonly JsonValue[] | undefined,
	name: string,
	path: SavePath,
): Found | undefined => {
	for (const [index, tag] of (properties ?? []).entries()) {
		if (stringAt(tag, "name") !== name) continue;
		const value = objectAt(tag, "value");
		if (value === undefined) return undefined;
		return { value, path: [...path, index, "value"] };
	}
	return undefined;
};

/** The value of the map entry keyed by `key`, or `undefined`. */
const findMapEntry = (map: Found, key: string): Found | undefined => {
	for (const [index, entry] of (
		arrayAt(map.value, "entries") ?? []
	).entries()) {
		const entryKey = objectAt(entry, "key");
		if (stringAt(entryKey, "kind") !== "string") continue;
		if (stringAt(entryKey, "value") !== key) continue;
		const value = objectAt(entry, "value");
		if (value === undefined) return undefined;
		return { value, path: [...map.path, "entries", index, "value"] };
	}
	return undefined;
};

/**
 * A field of a nested property list.
 *
 * Every subsystem in `SaveDataMap` is a `SaveData` struct, and its `Data` field
 * is a `TArray<uint8>` that this codec decodes into a property list — so the
 * chain from the document root to any field inside a subsystem is the same four
 * steps whichever subsystem it is.
 */
const saveDataMap = (doc: JsonValue): Found | undefined =>
	findProperty(arrayAt(objectAt(doc, "list"), "properties"), "SaveDataMap", [
		"list",
		"properties",
	]);

/** The decoded property list inside a named save entry, or `undefined`. */
const subsystemProperties = (
	doc: JsonValue,
	entry: string,
): Found | undefined => {
	const blob = findMapEntry(
		saveDataMap(doc) ?? { value: null, path: [] },
		entry,
	);
	if (!blob) return undefined;
	const data = findProperty(
		arrayAt(objectAt(blob.value, "list"), "properties"),
		"Data",
		[...blob.path, "list", "properties"],
	);
	if (!data) return undefined;
	const decoded = objectAt(arrayAt(data.value, "items")?.[0], "value");
	if (decoded === undefined) return undefined;
	return {
		value: decoded,
		path: [...data.path, "items", 0, "value", "properties"],
	};
};

/** A named property inside a named save entry, or `undefined`. */
const inSubsystem = (
	doc: JsonValue,
	entry: string,
	name: string,
): Found | undefined => {
	const properties = subsystemProperties(doc, entry);
	if (!properties) return undefined;
	return findProperty(
		arrayAt(properties.value, "properties"),
		name,
		properties.path,
	);
};

/** The number a scalar property holds, with the path to that number. */
const scalarOf = (
	found: Found,
): { readonly path: SavePath; readonly value: number } | undefined => {
	const inner = numberAt(found.value, "value");
	if (inner === undefined) return undefined;
	return { path: [...found.path, "value"], value: inner };
};

/* -------------------------------------------------------------------------- */
/* Currency                                                                    */
/* -------------------------------------------------------------------------- */

/** The two wallets, each a single `IntProperty` called `CurrencyAmount`. */
const WALLETS = ["MetaCurrencyWallet", "RareMetaCurrency"] as const;

/**
 * The target a wallet should hold.
 *
 * 999 999, which is the figure the reference tool's `cheat` command defaulted
 * to. It is a number this codec has no way to confirm from the save, and it is
 * stated here so that the one number in this file that is not measured can be
 * found by reading rather than by searching.
 */
const CHEAT_AMOUNT = 999_999;

const cheatCurrency: QuickAction = {
	id: "cheat",
	label: "Fill both wallets",
	description:
		"Set MetaCurrencyWallet and RareMetaCurrency to 999,999. Each holds one IntProperty called CurrencyAmount.",
	plan: (doc) => {
		const edits: SaveEdit[] = [];
		for (const wallet of WALLETS) {
			const target = currencyTarget(doc, wallet);
			if (!target || target.value === CHEAT_AMOUNT) continue;
			edits.push({
				id: editId(target.path, CHEAT_AMOUNT),
				label: `${wallet} · CurrencyAmount`,
				path: target.path,
				before: target.value,
				after: CHEAT_AMOUNT,
			});
		}
		return edits;
	},
};

/**
 * Where a wallet's amount is, however that entry is stored.
 *
 * The decoded path is tried first. `RunPersistence` and `RunHistory` are the two
 * entries whose bytes are not a property list, so in principle a wallet could be
 * unreachable this way; if one ever is, the raw fallback finds the same number
 * by its byte pattern, which is what the reference implementation did whenever
 * its parser fell short.
 */
const currencyTarget = (
	doc: JsonValue,
	wallet: string,
): { readonly path: SavePath; readonly value: number } | undefined => {
	const decoded = inSubsystem(doc, wallet, "CurrencyAmount");
	if (decoded) return scalarOf(decoded);
	return rawCurrencyAmount(doc, wallet);
};

/**
 * `CurrencyAmount`'s value inside an undecoded byte array.
 *
 * The pattern is the property name, its type, then nine bytes of tag — the
 * `int32` array index, the `int32` size and the one-byte `hasGuid` flag — before
 * the little-endian `int32`. Narrow on purpose: the entry must be a `TArray` of
 * bytes, so a save whose wallet did not decode cannot be edited by accident on
 * the wrong bytes.
 */
const rawCurrencyAmount = (
	doc: JsonValue,
	entry: string,
): { readonly path: SavePath; readonly value: number } | undefined => {
	const blob = findMapEntry(
		saveDataMap(doc) ?? { value: null, path: [] },
		entry,
	);
	if (!blob) return undefined;
	const data = findProperty(
		arrayAt(objectAt(blob.value, "list"), "properties"),
		"Data",
		[...blob.path, "list", "properties"],
	);
	if (!data) return undefined;
	const items = arrayAt(data.value, "items");
	if (!items) return undefined;
	const collected: number[] = [];
	for (const item of items) {
		if (stringAt(item, "kind") !== "byte") return undefined;
		const byte = numberAt(item, "value");
		if (byte === undefined) return undefined;
		collected.push(byte);
	}
	const bytes = Uint8Array.from(collected);
	const name = indexOfBytes(bytes, encoder.encode("CurrencyAmount\u0000"));
	if (name < 0) return undefined;
	const type = indexOfBytes(
		bytes,
		encoder.encode("IntProperty\u0000"),
		name + CURRENCY_NAME_LENGTH,
	);
	if (type < 0) return undefined;
	const at = type + INT_PROPERTY_LENGTH + CURRENCY_TAG_LENGTH;
	if (at + 3 >= bytes.length) return undefined;
	return {
		path: [...data.path, "items", at, "value"],
		value: new DataView(bytes.buffer, bytes.byteOffset + at, 4).getInt32(
			0,
			true,
		),
	};
};

const encoder = new TextEncoder();

/** Byte lengths of the two NUL-terminated names the raw fallback searches for. */
const CURRENCY_NAME_LENGTH = 15;
const INT_PROPERTY_LENGTH = 12;

/**
 * Bytes of tag between the end of a type name and the value it introduces: the
 * `int32` array index, the `int32` size and the one-byte `hasGuid` flag.
 */
const CURRENCY_TAG_LENGTH = 9;

/* -------------------------------------------------------------------------- */
/* Character meta levels                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The level the committed `SaveSlot_DDR_0_edited.sav` gives the characters it
 * adds to `CharacterMetaLevel`, and the highest this save's own two characters
 * are anywhere near. Ten, and it comes from the fixture rather than from a table
 * somebody wrote down.
 */
const MAX_META_LEVEL = 10;

const maxLevel: QuickAction = {
	id: "max-level",
	label: "Every character to level 10",
	description:
		"Set MetaLevel on every entry of CharacterMetaLevel · PersistedData to 10.",
	plan: (doc) => {
		const characters = inSubsystem(doc, "CharacterMetaLevel", "PersistedData");
		const items = arrayAt(characters?.value, "items");
		if (!characters || !items) return [];
		const edits: SaveEdit[] = [];
		for (const [index, item] of items.entries()) {
			if (stringAt(item, "kind") !== "struct") continue;
			const fields = objectAt(item, "list");
			const level = findProperty(arrayAt(fields, "properties"), "MetaLevel", [
				...characters.path,
				"items",
				index,
				"list",
				"properties",
			]);
			const scalar = level ? scalarOf(level) : undefined;
			if (!scalar || scalar.value === MAX_META_LEVEL) continue;
			edits.push({
				id: editId(scalar.path, MAX_META_LEVEL),
				label: `MetaLevel · entry ${index}`,
				path: scalar.path,
				before: scalar.value,
				after: MAX_META_LEVEL,
			});
		}
		return edits;
	},
};

/* -------------------------------------------------------------------------- */
/* Stat upgrades                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The highest `Level` any of the thirty entries in `MetaUpgrades` already holds.
 *
 * Twelve of them are at 30 and the rest at 1, so 30 is the cap the game itself
 * writes rather than a number invented here.
 */
const MAX_UPGRADE_LEVEL = 30;

const cheatStats: QuickAction = {
	id: "cheat-stats",
	label: "Every meta upgrade to level 30",
	description:
		"Set Level on every entry of MetaUpgrades · PersistedUpgradeData to 30, the highest this save already holds.",
	plan: (doc) => {
		const upgrades = inSubsystem(doc, "MetaUpgrades", "PersistedUpgradeData");
		const items = arrayAt(upgrades?.value, "items");
		if (!upgrades || !items) return [];
		const edits: SaveEdit[] = [];
		for (const [index, item] of items.entries()) {
			if (stringAt(item, "kind") !== "struct") continue;
			const fields = objectAt(item, "list");
			const level = findProperty(arrayAt(fields, "properties"), "Level", [
				...upgrades.path,
				"items",
				index,
				"list",
				"properties",
			]);
			const scalar = level ? scalarOf(level) : undefined;
			if (!scalar || scalar.value === MAX_UPGRADE_LEVEL) continue;
			edits.push({
				id: editId(scalar.path, MAX_UPGRADE_LEVEL),
				label: `Upgrade level · entry ${index}`,
				path: scalar.path,
				before: scalar.value,
				after: MAX_UPGRADE_LEVEL,
			});
		}
		return edits;
	},
};

const ACTIONS: readonly QuickAction[] = [cheatCurrency, maxLevel, cheatStats];

/* -------------------------------------------------------------------------- */
/* Summary                                                                     */
/* -------------------------------------------------------------------------- */

const summarise: (doc: JsonValue) => readonly SummaryRow[] = (doc) => {
	const engine = objectAt(doc, "engine");
	const entries = arrayAt(saveDataMap(doc)?.value, "entries") ?? [];
	return [
		{ label: "Container", value: stringAt(doc, "magic") ?? "unknown" },
		{
			label: "Engine",
			value: [
				numberAt(engine, "major"),
				numberAt(engine, "minor"),
				numberAt(engine, "patch"),
			]
				.filter((part) => part !== undefined)
				.join("."),
		},
		{
			label: "Game version",
			value: topLevelString(doc, "LastSavedGameVersion") ?? "—",
		},
		{
			label: "Custom versions",
			value: (arrayAt(doc, "customVersions") ?? []).length.toString(),
		},
		{ label: "Subsystems", value: entries.length.toString() },
		{
			label: "Wallet",
			value: currencyOf(doc, "MetaCurrencyWallet")?.toString() ?? "—",
			emphasis: true,
		},
		{
			label: "Rare currency",
			value: currencyOf(doc, "RareMetaCurrency")?.toString() ?? "—",
			emphasis: true,
		},
		{
			label: "Characters",
			value:
				arrayAt(
					inSubsystem(doc, "CharacterMetaLevel", "PersistedData")?.value,
					"items",
				)?.length.toString() ?? "—",
		},
		{
			label: "Meta upgrades",
			value:
				arrayAt(
					inSubsystem(doc, "MetaUpgrades", "PersistedUpgradeData")?.value,
					"items",
				)?.length.toString() ?? "—",
		},
		{
			label: "Achievements",
			value:
				arrayAt(
					inSubsystem(doc, "Achievements", "PersistedAchievementData")?.value,
					"items",
				)?.length.toString() ?? "—",
		},
		{
			label: "Unlocks",
			value:
				arrayAt(
					inSubsystem(doc, "RecentUnlocks", "PersistedData")?.value,
					"items",
				)?.length.toString() ?? "—",
		},
		{
			label: "Decoded subsystems",
			value: `${decodedSubsystems(doc)} of ${entries.length}`,
		},
	];
};

/** A property on the container's own list, where the scalar settings live. */
const topLevelString = (doc: JsonValue, name: string): string | undefined => {
	const found = findProperty(
		arrayAt(objectAt(doc, "list"), "properties"),
		name,
		["list", "properties"],
	);
	if (!found) return undefined;
	return (
		stringAt(found.value, "value") ?? numberAt(found.value, "value")?.toString()
	);
};

const currencyOf = (doc: JsonValue, entry: string): number | undefined => {
	const found = inSubsystem(doc, entry, "CurrencyAmount");
	return found ? scalarOf(found)?.value : undefined;
};

/**
 * How many subsystems decoded into a property list rather than staying bytes.
 *
 * The honest figure, and the one that says whether the inspector can reach a
 * field: two of this game's eighteen are not property lists, so a save whose
 * `RunHistory` matters to you has 297 kB of numbers in front of it.
 */
const decodedSubsystems = (doc: JsonValue): number => {
	const entries = arrayAt(saveDataMap(doc)?.value, "entries") ?? [];
	return entries.filter((entry) => {
		const value = objectAt(entry, "value");
		const fields = objectAt(value, "list");
		const data = findProperty(arrayAt(fields, "properties"), "Data", [
			"list",
			"properties",
		]);
		return stringAt(arrayAt(data?.value, "items")?.[0], "kind") === "blob";
	}).length;
};

/* -------------------------------------------------------------------------- */
/* The codec                                                                   */
/* -------------------------------------------------------------------------- */

export const deadlyDays: SaveCodec = {
	id: "deadly-days-roadtrip-save-editor",
	game: "Deadly Days: Roadtrip",
	formatLabel: "GVAS (Unreal Engine 5), property tags",
	extensions: ["sav"],
	defaultPath:
		"%LOCALAPPDATA%\\DDSurvivors\\Saved\\SaveGames\\SaveSlot_DDR_0.sav",
	notes: [
		{
			title: "An Unreal save, written out in full",
			body: "The file opens with the four bytes GVAS, then three version numbers, the engine it was built with (5.7.4, branch ++UE5+Release-5.7), a list of eighty-five feature GUIDs with the version of each, the name of the save class, and then a list of tagged properties. Nothing in that is encrypted, signed or checksummed, which is why the whole file can be read and rebuilt in a browser tab and why a rebuilt file can be compared with the original byte for byte.",
		},
		{
			title: "There are two formats inside the one file",
			body: "The outer list holds a SaveDataMap: eighteen named subsystems, each stored as a raw array of bytes. Those bytes are not opaque — each is itself a list of tagged properties with a one-byte version in front of it, and this editor decodes them, which is the only reason a currency balance or a character level is something you can point at rather than a byte offset to search for. Sixteen of the eighteen decode. RunPersistence and RunHistory are not property lists, 297 kB between them, and they stay as numbers.",
		},
		{
			title: "Every length is recomputed rather than copied",
			body: "A tag records the size of its value, and an array, a struct, a map and an enum each record a body size. None of them are kept: they are measured from what is actually written, because three of the quick changes alter how much a structure holds, and a length left over from before the change is a file the engine refuses. Two of the measurements are subtler than they look — a body size excludes the byte that says whether the property carries a GUID, and a raw FGuid claims sixteen bytes and then writes seventeen.",
		},
		{
			title: "What it will not do",
			body: "It will not invent a roster. A save editor that writes character names, weapon paths or modifier tables it has not seen in your own file produces a file that decodes cleanly and then fails to load, which is worse than one that admits it does not know. So the three quick changes here are the three the save itself names: the two wallets, character meta levels, and meta upgrade levels. Everything else is browsable and editable in the inspector, and every change is rebuilt and read back before you are given the file.",
		},
	],
	decode: async (bytes) => readGvas(bytes),
	encode: async (doc) => writeGvas(gvasOf(doc)),
	summarise,
	actions: ACTIONS,
};
