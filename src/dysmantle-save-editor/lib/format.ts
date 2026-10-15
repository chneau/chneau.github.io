import {
	type Bytes,
	base64Decode,
	base64Encode,
	isJsonObject,
	type JsonValue,
	type QuickAction,
	type SaveCodec,
	type SaveEdit,
	type SavePath,
	type SummaryRow,
	stringAt,
	zlibDeflate,
	zlibInflate,
} from "../../shared";
import { editId } from "../../shared/save/edits";
import {
	ARRAY_ELEMENT,
	childGroups,
	findElement,
	NODE_ELEMENT,
	projectXml,
	unprojectXml,
} from "./xml";

const HEADER_BYTES = 12;

const CONTAINER_MAGIC = "10TONS_CONTAINER\0";
const SEGMENT_OPEN = "SEGMENT\0";
const SEGMENT_CLOSE = "SEGMENT_END\0";
const XML_SEGMENT = "xml";

const CONTAINER_FILE_MAGIC = "10tc";

const SCAFFOLD_KEY = "$scaffold";

const ROOT = "root";

const matchesAt = (bytes: Bytes, at: number, text: string): boolean => {
	if (at + text.length > bytes.length) return false;
	for (const [offset, character] of [...text].entries()) {
		if (bytes[at + offset] !== character.charCodeAt(0)) return false;
	}
	return true;
};

const latin1 = (bytes: Bytes, from: number, to: number): string => {
	let out = "";
	for (let at = from; at < to; at += 1) {
		out += String.fromCharCode(bytes[at] ?? 0);
	}
	return out;
};

type Segment = {
	readonly name: string;
	readonly totalAt: number;
	readonly lengthAt: number;
	readonly contentStart: number;
	readonly contentEnd: number;
};

const readSegments = (container: Bytes): readonly Segment[] => {
	if (!matchesAt(container, 0, CONTAINER_MAGIC)) {
		throw new Error(
			"This is not a DYSMANTLE save: its contents are not a 10TONS container.",
		);
	}
	let at = CONTAINER_MAGIC.length;
	for (const field of ["VERSION", "FILE_SIZE"]) {
		const end = container.indexOf(0, at);
		if (end < 0) {
			throw new Error(`Truncated save: the ${field} field has no terminator.`);
		}
		at = end + 1 + 4;
	}
	if (at > container.length) {
		throw new Error("Truncated save: the container header runs past the end.");
	}

	const segments: Segment[] = [];
	while (matchesAt(container, at, SEGMENT_OPEN)) {
		const totalAt = at + SEGMENT_OPEN.length;
		let cursor = totalAt + 4;
		const nameEnd = container.indexOf(0, cursor);
		if (nameEnd < 0) {
			throw new Error("Truncated save: a segment name has no terminator.");
		}
		const name = latin1(container, cursor, nameEnd);
		cursor = nameEnd + 1;
		const lengthAt = cursor;
		const contentStart = cursor + 4;
		if (contentStart > container.length) {
			throw new Error(
				`Truncated save: segment "${name}" has no content length.`,
			);
		}
		const contentEnd = contentStart + readU32(container, lengthAt);
		if (contentEnd > container.length) {
			throw new Error(
				`Truncated save: segment "${name}" runs past the end of the container.`,
			);
		}
		segments.push({ name, totalAt, lengthAt, contentStart, contentEnd });
		at = contentEnd;
		if (!matchesAt(container, at, SEGMENT_CLOSE)) {
			throw new Error(
				`Malformed save: segment "${name}" is not followed by SEGMENT_END.`,
			);
		}
		at += SEGMENT_CLOSE.length;
	}
	return segments;
};

const readU32 = (bytes: Bytes, at: number): number =>
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
		at,
		true,
	);

const writeU32 = (bytes: Uint8Array, at: number, value: number): void => {
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
		at,
		value,
		true,
	);
};

const readScaffold = (container: Bytes, xml: Segment): Bytes => {
	const removed = xml.contentEnd - xml.contentStart;
	const scaffold = new Uint8Array(container.length - removed);
	scaffold.set(container.subarray(0, xml.contentStart), 0);
	scaffold.set(container.subarray(xml.contentEnd), xml.contentStart);
	writeU32(scaffold, xml.totalAt, 0);
	writeU32(scaffold, xml.lengthAt, 0);
	return scaffold;
};

const writeProfile = (scaffold: Bytes, xml: Segment, content: Bytes): Bytes => {
	const out = new Uint8Array(scaffold.length + content.length);
	out.set(scaffold.subarray(0, xml.contentStart), 0);
	out.set(content, xml.contentStart);
	out.set(
		scaffold.subarray(xml.contentStart),
		xml.contentStart + content.length,
	);
	writeU32(out, xml.totalAt, content.length + 8);
	writeU32(out, xml.lengthAt, content.length);
	return out;
};

const encodeXml = (doc: JsonValue): Bytes => {
	let text = "";
	for (const character of unprojectXml(doc)) {
		const code = character.codePointAt(0) ?? 0;
		text += String.fromCharCode(code > 0xff ? 0x3f : code);
	}
	return new TextEncoder().encode(text);
};

export const decodeToJson = async (bytes: Bytes): Promise<JsonValue> => {
	if (bytes.length < HEADER_BYTES + 2) {
		throw new Error(
			`This file is ${bytes.length} bytes, which is too short to be a DYSMANTLE save.`,
		);
	}
	let container: Bytes;
	try {
		container = new Uint8Array(await zlibInflate(bytes.subarray(HEADER_BYTES)));
	} catch (cause) {
		throw new Error(
			`The save's compressed section could not be read, which usually means the file was truncated or only partly copied. (${
				cause instanceof Error ? cause.message : String(cause)
			})`,
		);
	}

	const xml = readSegments(container).find(
		(segment) => segment.name === XML_SEGMENT,
	);
	if (xml === undefined) {
		throw new Error(
			`This save has no "${XML_SEGMENT}" segment, so there is no profile in it to edit.`,
		);
	}
	return {
		[SCAFFOLD_KEY]: base64Encode(readScaffold(container, xml)),
		[ROOT]: projectXml(latin1(container, xml.contentStart, xml.contentEnd)),
	};
};

export const encodeFromJson = async (doc: JsonValue): Promise<Bytes> => {
	if (!isJsonObject(doc)) {
		throw new Error("The profile to write is not an object.");
	}
	const encoded = doc[SCAFFOLD_KEY];
	const profile = doc[ROOT];
	if (typeof encoded !== "string") {
		throw new Error(
			"This profile was not opened by this editor, so the rest of the save — the world, in 47 segments — is not here to rebuild it with.",
		);
	}
	if (profile === undefined) {
		throw new Error("This document has no profile in it.");
	}

	const scaffold = base64Decode(encoded);
	const xml = readSegments(scaffold).find(
		(segment) => segment.name === XML_SEGMENT,
	);
	if (xml === undefined) {
		throw new Error("The container in this profile has lost its xml segment.");
	}
	const container = writeProfile(scaffold, xml, encodeXml(profile));
	const compressed = new Uint8Array(await zlibDeflate(container));

	const out = new Uint8Array(HEADER_BYTES + compressed.length);
	for (const [index, character] of [...CONTAINER_FILE_MAGIC].entries()) {
		out[index] = character.charCodeAt(0);
	}
	writeU32(out, 4, container.length);
	writeU32(out, 8, compressed.length);
	out.set(compressed, HEADER_BYTES);
	return out;
};

const arrayById = (
	doc: JsonValue,
	id: string,
): { readonly path: SavePath; readonly value: JsonValue } | undefined =>
	findElement(profileOf(doc), ARRAY_ELEMENT, id, [ROOT]);

const profileOf = (doc: JsonValue): JsonValue => {
	if (!isJsonObject(doc)) return null;
	return doc[ROOT] ?? null;
};

const nodeById = (
	doc: JsonValue,
	arrayId: string,
	nodeId: string,
): { readonly path: SavePath; readonly value: JsonValue } | undefined => {
	const array = arrayById(doc, arrayId);
	if (array === undefined) return undefined;
	return findElement(array.value, NODE_ELEMENT, nodeId, array.path);
};

const nodesOf = (
	doc: JsonValue,
	arrayId: string,
): readonly (readonly [string, SavePath, JsonValue])[] | undefined => {
	const array = arrayById(doc, arrayId);
	if (array === undefined) return undefined;
	return childGroups(array.value)
		.filter(([name]) => name === NODE_ELEMENT)
		.flatMap(([, members]) =>
			members.flatMap((member, index) => {
				const id = isJsonObject(member) ? member.id : undefined;
				return typeof id === "string"
					? [
							[
								id,
								[...array.path, NODE_ELEMENT, index] as SavePath,
								member,
							] as const,
						]
					: [];
			}),
		);
};

const setExisting = (
	node: JsonValue,
	path: SavePath,
	name: string,
	after: string,
): readonly SaveEdit[] => {
	if (!isJsonObject(node) || !(name in node)) return [];
	const before = node[name];
	const target = [...path, name];
	if (before === after) return [];
	return [
		{
			id: editId(target, after),
			label: target.join("."),
			path: target,
			before: typeof before === "string" ? before : null,
			after,
		},
	];
};

const setOn = (
	doc: JsonValue,
	arrayId: string,
	nodeId: string,
	name: string,
	after: string,
): readonly SaveEdit[] => {
	const node = nodeById(doc, arrayId, nodeId);
	return node === undefined
		? []
		: setExisting(node.value, node.path, name, after);
};

const FILL = "9999";

const planFillMaterials = (doc: JsonValue): readonly SaveEdit[] => {
	const edits: SaveEdit[] = [];
	for (const storageId of ["material_storage", "material_storage_alltime"]) {
		const storage = nodeById(doc, "PLAYER_STATE", storageId);
		if (storage === undefined || !isJsonObject(storage.value)) continue;
		for (const name of Object.keys(storage.value)) {
			if (name === "id") continue;
			edits.push(...setExisting(storage.value, storage.path, name, FILL));
		}
	}
	const materials = nodeById(doc, "PLAYER_STATE", "materials");
	if (materials !== undefined && isJsonObject(materials.value)) {
		for (const name of Object.keys(materials.value)) {
			if (!name.startsWith("found_")) continue;
			edits.push(...setExisting(materials.value, materials.path, name, "1"));
		}
	}
	for (const [id, path, value] of nodesOf(doc, "PLAYER_STATE") ?? []) {
		if (!/^slot_\d+$/.test(id)) continue;
		edits.push(...setExisting(value, path, "amount", FILL));
	}
	return edits;
};

const planMaxLevel = (doc: JsonValue): readonly SaveEdit[] => [
	...setOn(doc, "PLAYER_STATE", "experience_level", "value", "50"),
	...setOn(doc, "PLAYER_STATE", "acknowledged_experience_level", "value", "50"),
];

const planSkillPoints = (doc: JsonValue): readonly SaveEdit[] =>
	setOn(doc, "PLAYER_STATE", "num_skills_to_pick", "value", "20");

const planUnlockAll = (doc: JsonValue): readonly SaveEdit[] => {
	const edits: SaveEdit[] = [];
	let skills = 0;
	for (const [id, path, value] of nodesOf(doc, "RECIPES") ?? []) {
		if (id.startsWith("SKILL_")) skills += 1;
		edits.push(...setExisting(value, path, "unlocked", "1"));
		edits.push(...setExisting(value, path, "new", "0"));
		edits.push(...setExisting(value, path, "crafted", "1"));
		edits.push(...setExisting(value, path, "level", "9"));
	}
	edits.push(
		...setOn(doc, "PLAYER_STATE", "num_skills_picked", "value", String(skills)),
	);
	return edits;
};

const planUnlockFeatures = (doc: JsonValue): readonly SaveEdit[] => {
	const edits: SaveEdit[] = [];
	for (const [, path, value] of nodesOf(doc, "FEATURES") ?? []) {
		edits.push(...setExisting(value, path, "available", "1"));
	}
	return edits;
};

const planUnlockItems = (doc: JsonValue): readonly SaveEdit[] => {
	const edits: SaveEdit[] = [];
	for (const [, path, value] of nodesOf(doc, "ITEMS") ?? []) {
		edits.push(...setExisting(value, path, "available", "1"));
	}
	for (const [, path, value] of nodesOf(doc, "INVENTORY_0_ITEM_USES") ?? []) {
		edits.push(...setExisting(value, path, "times_used", "0"));
	}
	return edits;
};

const toolItemPath = (recipeId: string): string | undefined => {
	if (!/^[A-Z0-9_]+$/.test(recipeId)) return undefined;
	if (recipeId.startsWith("SKILL_")) return undefined;
	return `items/tools/${recipeId.toLowerCase().replace(/_/g, "-")}.nut`;
};

const planUnlockWeapon =
	(recipeId: string) =>
	(doc: JsonValue): readonly SaveEdit[] => {
		const recipe = nodeById(doc, "RECIPES", recipeId);
		if (recipe === undefined) return [];
		const edits: SaveEdit[] = [
			...setExisting(recipe.value, recipe.path, "unlocked", "1"),
			...setExisting(recipe.value, recipe.path, "new", "0"),
			...setExisting(recipe.value, recipe.path, "crafted", "1"),
			...setExisting(recipe.value, recipe.path, "level", "9"),
		];
		const itemPath = toolItemPath(recipeId);
		if (itemPath === undefined) return edits;
		edits.push(...setOn(doc, "ITEMS", itemPath, "available", "1"));
		edits.push(
			...setOn(doc, "INVENTORY_0_ITEM_USES", itemPath, "times_used", "0"),
		);
		return edits;
	};

const WEAPONS = [
	["CROWBAR", "Crowbar"],
	["MACHETE", "Machete"],
	["AXE", "Axe"],
	["WRENCH", "Wrench"],
	["SICKLE", "Sickle"],
	["BASEBALL_BAT", "Baseball bat"],
	["KATANA", "Katana"],
	["SLEDGEHAMMER", "Sledgehammer"],
	["KHOPESH", "Khopesh"],
	["POWER_FIST", "Power fist"],
	["LASER_SWORD", "Laser sword"],
	["HUNTING_RIFLE", "Hunting rifle"],
	["MANA_CROSSBOW", "Mana crossbow"],
	["FISHING_ROD", "Fishing rod"],
	["BEAM_GUN", "Beam gun"],
] as const;

const ACTIONS: readonly QuickAction[] = [
	{
		id: "fill-materials",
		label: "Fill every material",
		description:
			"Set every material in material_storage and material_storage_alltime to 9999, mark every material found, and raise every inventory page to 9999 slots.",
		plan: planFillMaterials,
	},
	{
		id: "max-level",
		label: "Level 50",
		description:
			"Set experience_level and acknowledged_experience_level to 50, the level a fully-played save in the reference data sits at.",
		plan: planMaxLevel,
	},
	{
		id: "skill-points",
		label: "20 skill points",
		description:
			"Set num_skills_to_pick to 20, the stack of unspent points the game shows.",
		plan: planSkillPoints,
	},
	{
		id: "unlock-all",
		label: "Unlock all skills and recipes",
		description:
			"Unlock every recipe and skill in RECIPES, craft them, and raise every recipe that has a level to 9.",
		plan: planUnlockAll,
	},
	{
		id: "unlock-features",
		label: "Unlock all features",
		description:
			"Mark every entry in FEATURES available — fast travel, the map, cooking and the rest.",
		plan: planUnlockFeatures,
	},
	{
		id: "unlock-items",
		label: "Make all tracked items available",
		description:
			"Mark every item in ITEMS available and reset every use counter in INVENTORY_0_ITEM_USES.",
		plan: planUnlockItems,
	},
	...WEAPONS.map(([id, label]) => ({
		id: `unlock-${id.toLowerCase().replace(/_/g, "-")}`,
		label: `Unlock ${label}`,
		description: `Unlock ${id} in RECIPES, mark it available in ITEMS, and reset its use counter.`,
		plan: planUnlockWeapon(id),
	})),
];

const summarise = (doc: JsonValue): readonly SummaryRow[] => {
	const rows: SummaryRow[] = [];
	const scalar = (label: string, arrayId: string, nodeId: string): void => {
		const node = nodeById(doc, arrayId, nodeId);
		if (node === undefined) return;
		const value = stringAt(node.value, "value");
		if (value !== undefined) rows.push({ label, value });
	};
	const count = (
		label: string,
		arrayId: string,
		of: (node: JsonValue) => boolean,
	): void => {
		const nodes = nodesOf(doc, arrayId);
		if (nodes === undefined) return;
		rows.push({
			label,
			value: String(nodes.filter(([, , node]) => of(node)).length),
		});
	};

	scalar("Game version", "!INFO", "game_version_created");
	scalar("Save format", "SAVE_FORMAT", "version");
	scalar("Player level", "PLAYER_STATE", "experience_level");
	scalar("Skill points to spend", "PLAYER_STATE", "num_skills_to_pick");
	scalar("Skill points spent", "PLAYER_STATE", "num_skills_picked");
	scalar("Experience points", "PLAYER_STATE", "experience_points");
	scalar("Deaths", "PLAYER_STATE", "num_times_died");
	scalar("Enemies killed", "PLAYER_STATE", "num_enemies_killed");
	scalar("Time played", "!INFO", "time_active");

	count("Recipes and skills", "RECIPES", () => true);
	count(
		"Skills",
		"RECIPES",
		(node) => stringAt(node, "id")?.startsWith("SKILL_") === true,
	);
	count(
		"Recipes still locked",
		"RECIPES",
		(node) => stringAt(node, "unlocked") !== "1",
	);
	count("Items tracked", "ITEMS", () => true);
	count("Features", "FEATURES", () => true);
	count("Medals", "MEDALS", () => true);

	const materials = nodeById(doc, "PLAYER_STATE", "materials");
	if (materials !== undefined && isJsonObject(materials.value)) {
		rows.push({
			label: "Materials found",
			value: String(
				Object.keys(materials.value).filter((name) => name.startsWith("found_"))
					.length,
			),
		});
	}
	const storage = nodeById(doc, "PLAYER_STATE", "material_storage");
	if (storage !== undefined && isJsonObject(storage.value)) {
		rows.push({
			label: "Material stacks",
			value: String(
				Object.keys(storage.value).filter((name) => name !== "id").length,
			),
		});
	}
	return rows;
};

export const dysmantle: SaveCodec = {
	game: "DYSMANTLE",
	formatLabel: "10TONS container, zlib, XML profile",
	extensions: ["save"],
	defaultPath:
		"/storage/emulated/0/Android/data/com.the10tons.dysmantle/files/save/0/profile.save",
	notes: [
		{
			title: "Nothing in here is encrypted",
			body: "A save is a 12-byte header and a zlib stream. Inflating it gives 10TONS's own container, a list of named segments, one of which holds the profile as XML. There is no key and no checksum, which is why this can be read and rebuilt exactly, and why a rebuilt file is read back and compared against the one you opened before you are given it.",
		},
		{
			title: "Most of the file is not the profile",
			body: "A real save holds 48 segments. One is the XML profile you see in the inspector; the other 47 are the world — harvested materials, discovered objects, per-stage state, the map — in a binary form this page does not interpret. They travel inside the document you are editing, untouched, and are copied straight back out. That is the difference between editing a save and quietly deleting a world.",
		},
		{
			title: "Where a rebuilt file differs, and why nothing is lost",
			body: "The profile is rewritten in the spacing the game itself uses, so a save the game wrote comes back with the same XML. A save a third-party editor has added nodes to comes back with those nodes on their own lines, where that editor wrote them shoulder to shoulder — the difference is the space between elements, and the format holds no text at all, so there is nothing in it to lose. The compressed bytes differ in any case, because the game deflates at a level the web platform cannot be asked to reach.",
		},
		{
			title: "Fields are kept as text, on purpose",
			body: "The file stores numbers as text, with formatting the game reads: a temperature as 0.00, an angle as -1.332, the game version as 1.4.1.12. Turning those into numbers and writing them back would lose the formatting, so every value stays a string and the inspector edits it as one. For the same reason a change is only ever written to a field this save already has.",
		},
	],
	decode: async (bytes) => decodeToJson(bytes),
	encode: async (doc) => encodeFromJson(doc),
	summarise,
	actions: ACTIONS,
};
