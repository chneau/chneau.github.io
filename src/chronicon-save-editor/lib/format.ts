import {
	editId,
	type FormatNote,
	type JsonValue,
	numberAt,
	type QuickAction,
	type SaveCodec,
	type SaveEdit,
	type SavePath,
	type SaveTable,
	type SummaryRow,
} from "../../shared";
import {
	bagOf,
	decodeGlobalSave,
	encodeGlobalSave,
	SECTION_KEY,
} from "./global";
import { CRYSTAL_ID, ESSENCE_IDS, GEM_IDS, itemName } from "./items";

const decoder = new TextDecoder();

const CHARACTER_SECTION_KEYS = ["i", "e", "c", "st", "sk", "y"] as const;

const looksLikeCharacter = (
	value: Readonly<Record<string, JsonValue>>,
): boolean => CHARACTER_SECTION_KEYS.some((key) => key in value);

const looksLikeStash = (value: Readonly<Record<string, JsonValue>>): boolean =>
	"sz" in value && "ico" in value && "ver" in value;

const looksLikeCache = (value: Readonly<Record<string, JsonValue>>): boolean =>
	"mostrecentsave" in value;

const parseWrapper = (text: string): Readonly<Record<string, JsonValue>> => {
	const parsed: unknown = JSON.parse(text);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(
			"This file is not a Chronicon save: its JSON is not an object.",
		);
	}
	return parsed as Readonly<Record<string, JsonValue>>;
};

const formatCount = (value: number): string =>
	Number.isInteger(value)
		? value.toLocaleString("en-GB")
		: value.toLocaleString("en-GB", { maximumFractionDigits: 4 });

const quantityPath = (id: number): SavePath => [
	"ci",
	"entries",
	id,
	"quantity",
];

const quantityEdit = (
	doc: JsonValue,
	id: number,
	target: number,
): SaveEdit | undefined => {
	const bag = bagOf(doc);
	const entry = bag?.entries[id];
	if (!entry || entry.quantity === target) return undefined;
	const path = quantityPath(id);
	return {
		id: editId(path, target),
		label: itemName(id),
		path,
		before: entry.quantity,
		after: target,
	};
};

const fillIds = (
	doc: JsonValue,
	ids: readonly number[],
	target: number,
): readonly SaveEdit[] =>
	ids
		.map((id) => quantityEdit(doc, id, target))
		.filter((edit): edit is SaveEdit => edit !== undefined);

const maxCrystals: QuickAction = {
	id: "max-crystals",
	label: "Set crystals to 1,000,000",
	description:
		"Sets slot 0, the crystal currency, to 1,000,000. The game stores it as a 64-bit float, but very large values can still break shops or loot checks.",
	plan: (doc) => fillIds(doc, [CRYSTAL_ID], 1_000_000),
};

const maxEssences: QuickAction = {
	id: "max-essences",
	label: "Fill every essence",
	description:
		"Sets Magic, Crystal, Soul and Memory Essence (ids 295–298) to 9,999 each. These are shared counts, so every character sees the change.",
	plan: (doc) => fillIds(doc, ESSENCE_IDS, 9_999),
};

const maxGems: QuickAction = {
	id: "max-gems",
	label: "Fill every gem",
	description:
		"Sets all 73 gem counts (ids 620–692) to 9,999 each. Gem types are rough, cut and polished variants of each stone.",
	plan: (doc) => fillIds(doc, GEM_IDS, 9_999),
};

const bagTable: SaveTable = {
	id: "bag",
	label: "Shared bag",
	path: ["ci", "entries"],
	emptyMessage:
		"This save does not carry the shared bag. Open global.dat from the Chronicon save folder.",
	columns: [
		{
			label: "Item",
			path: ["id"],
			read: (row) => {
				const id = numberAt(row, "id");
				return id === undefined ? undefined : itemName(id);
			},
			readOnly: true,
		},
		{ label: "ID", path: ["id"], readOnly: true, width: "72px" },
		{ label: "Quantity", path: ["quantity"], width: "132px" },
	],
};

const sectionTable: SaveTable = {
	id: "sections",
	label: "Sections",
	path: [SECTION_KEY],
	columns: [
		{ label: "Key", path: ["key"], readOnly: true, width: "72px" },
		{ label: "Section", path: ["label"], readOnly: true },
		{ label: "Bytes", path: ["bytes"], readOnly: true, width: "96px" },
		{ label: "Editing", path: ["editing"], readOnly: true, width: "112px" },
	],
};

const notes: readonly FormatNote[] = [
	{
		title: "The file",
		body: "Chronicon writes global.dat as one JSON object. Each field is an uppercase hex GameMaker buffer, little-endian, and the fields you do not edit are written back exactly as they arrived.",
	},
	{
		title: "Shared bag",
		body: "Section ci holds 1,000 shared counts. The slot number is the item id, so slot 0 is the crystal currency, 295–298 are essences, 620–692 are gems, and every other slot is a material, potion, scroll or piece of gear. Each count is a 64-bit float.",
	},
	{
		title: "What stays untouched",
		body: "Story flags, achievements, collectibles, recipes, boss progress and the collected item list are preserved byte for byte. The editor only rewrites the counts you change and the section count.",
	},
	{
		title: "Keep a backup",
		body: "Copy the whole save folder before writing a rebuilt file. Chronicon keeps global.dat.bak1 and global.dat.bak2 because a save that fails to load is easy to make and hard to notice until the next launch.",
	},
	{
		title: "Safe values",
		body: "Counts are not clamped. Negative, fractional or very large counts can make the game reject a stack, overflow a shop or hide the item; the editor warns in the summary but still writes what you typed.",
	},
];

export const chronicon: SaveCodec = {
	game: "Chronicon",
	formatLabel: "JSON wrapper · GameMaker buffers · u32/f64 little-endian",
	extensions: ["dat", "char", "stash"],
	defaultPath: "%LOCALAPPDATA%\\Chronicon\\save",
	notes,
	decode: async (bytes) => {
		const text = decoder.decode(bytes);
		const wrapper = parseWrapper(text);
		if ("ci" in wrapper) {
			return decodeGlobalSave(text);
		}
		if (looksLikeCache(wrapper)) {
			throw new Error(
				"cache.dat only records the name of the last save. Open global.dat instead.",
			);
		}
		if (looksLikeStash(wrapper)) {
			throw new Error(
				"This is player.stash. The shared currencies and materials live in global.dat; open that file to edit them.",
			);
		}
		if (looksLikeCharacter(wrapper)) {
			throw new Error(
				"This is a character save (b.char). The shared currencies and materials live in global.dat; open that file to edit them.",
			);
		}
		throw new Error(
			"This file has no Chronicon save sections. Open global.dat from the Chronicon save folder.",
		);
	},
	encode: async (doc) => {
		const bytes = encodeGlobalSave(doc);
		parseWrapper(decoder.decode(bytes));
		return bytes;
	},
	summarise: (doc) => {
		const bag = bagOf(doc);
		if (!bag) return [];
		const crystals = bag.entries[CRYSTAL_ID]?.quantity ?? 0;
		const gemsHeld = bag.entries.filter(
			(entry) => GEM_IDS.includes(entry.id) && entry.quantity > 0,
		).length;
		const essencesHeld = bag.entries.filter(
			(entry) => ESSENCE_IDS.includes(entry.id) && entry.quantity > 0,
		).length;
		const risky = bag.entries.filter(
			(entry) => entry.quantity < 0 || entry.quantity > 2_147_483_647,
		).length;
		const rows: SummaryRow[] = [
			{ label: "Shared bag slots", value: formatCount(bag.entries.length) },
			{ label: "Crystals", value: formatCount(crystals), emphasis: true },
			{ label: "Gem types held", value: formatCount(gemsHeld) },
			{ label: "Essences held", value: formatCount(essencesHeld) },
			{
				label: "Counts with a value",
				value: formatCount(
					bag.entries.filter((entry) => entry.quantity !== 0).length,
				),
			},
		];
		if (risky > 0) {
			rows.push({
				label: "Risky counts",
				value: `${formatCount(risky)} may break the game`,
				emphasis: true,
			});
		}
		return rows;
	},
	actions: [maxCrystals, maxEssences, maxGems],
	tables: [bagTable, sectionTable],
};
