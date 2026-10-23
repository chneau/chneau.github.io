import {
	arrayAt,
	editId,
	getAtPath,
	isJsonObject,
	type JsonValue,
	numberAt,
	objectAt,
	type QuickAction,
	requireArrayAt,
	requireNumberAt,
	requireObjectAt,
	requireStringAt,
	type SaveCodec,
	type SaveEdit,
	type SavePath,
	type SummaryRow,
	setAtPath,
	stringAt,
} from "../../shared";
import type { SaveTable } from "../../shared/save/types";
import {
	type ArrayItem,
	type PropertyTag,
	type PropertyValue,
	readGvas,
	type TypeName,
	writeGvas,
} from "./gvas";

type Skill = {
	readonly ability: string;
	readonly level: number;
	readonly state: number;
	readonly levelPath: SavePath;
};

const MAJOR_MAX: Readonly<Record<string, number>> = {
	SortBooks: 5,
	ShowMatchingShelf: 10,
	ShowSameTypeBook: 10,
	AutoShelve: 10,
	GrabSameTypeBook: 10,
};

const MINOR_SPELLS: readonly string[] = [
	"Jump",
	"UpgradeBag",
	"UpgradeBag2",
	"Jogging",
];

const listProperties = (doc: JsonValue): readonly JsonValue[] | undefined =>
	arrayAt(objectAt(doc, "list"), "properties");

const propertyIndex = (
	properties: readonly JsonValue[],
	name: string,
): number => properties.findIndex((tag) => stringAt(tag, "name") === name);

const propertyStruct = (
	properties: readonly JsonValue[],
	name: string,
): { readonly index: number; readonly value: JsonValue } | undefined => {
	const index = propertyIndex(properties, name);
	if (index < 0) return undefined;
	const tag = properties[index];
	const value = objectAt(tag, "value");
	if (value === undefined) return undefined;
	return { index, value };
};

const skillItemsPath = (doc: JsonValue): SavePath | undefined => {
	const properties = listProperties(doc);
	if (properties === undefined) return undefined;
	const player = propertyStruct(properties, "PlayerExtraDataV1");
	if (player === undefined) return undefined;
	const inner = arrayAt(player.value, "properties");
	if (inner === undefined) return undefined;
	const skillData = propertyStruct(inner, "SkillData");
	if (skillData === undefined) return undefined;
	return [
		"list",
		"properties",
		player.index,
		"value",
		"properties",
		skillData.index,
		"value",
		"items",
	];
};

const readSkills = (doc: JsonValue): readonly Skill[] => {
	const path = skillItemsPath(doc);
	if (path === undefined) return [];
	const items = getAtPath(doc, path);
	if (!Array.isArray(items)) return [];
	const skills: Skill[] = [];
	for (const [index, item] of items.entries()) {
		const properties = arrayAt(item, "properties");
		if (properties === undefined) continue;
		const abilityTag = propertyStruct(properties, "Ability");
		const levelTag = propertyStruct(properties, "CurrentLevel");
		if (levelTag === undefined) continue;
		const stateTag = propertyStruct(properties, "SkillState");
		const ability =
			(abilityTag === undefined
				? undefined
				: stringAt(abilityTag.value, "value")) ?? ABILITY_ORDER[index];
		const level = numberAt(levelTag.value, "value");
		const state = numberAt(stateTag?.value, "value") ?? 0;
		if (ability === undefined || level === undefined) continue;
		skills.push({
			ability,
			level,
			state,
			levelPath: [
				...path,
				index,
				"properties",
				levelTag.index,
				"value",
				"value",
			],
		});
	}
	return skills;
};

const abilityName = (value: string): string => {
	const parts = value.split("::");
	return parts[parts.length - 1] ?? value;
};

const ABILITY_ORDER: readonly string[] = [
	"Jump",
	"UpgradeBag",
	"UpgradeBag2",
	"ShowMatchingShelf",
	"Jogging",
	"SortBooks",
	"AutoShelve",
	"ShowSameTypeBook",
	"GrabSameTypeBook",
];

const INT_TYPE: TypeName = { name: "IntProperty", params: [] };
const FLOAT_TYPE: TypeName = { name: "FloatProperty", params: [] };
const SKILL_ENTRY_TYPE: TypeName = {
	name: "StructProperty",
	params: [
		{
			name: "SkillSaveData",
			params: [{ name: "/Script/Librarian", params: [] }],
		},
	],
};
const SKILL_ARRAY_TYPE: TypeName = {
	name: "ArrayProperty",
	params: [SKILL_ENTRY_TYPE],
};
const SKILL_ENUM_TYPE: TypeName = {
	name: "EnumProperty",
	params: [
		{
			name: "EUpgradeAbility",
			params: [{ name: "/Script/Librarian", params: [] }],
		},
		{ name: "ByteProperty", params: [] },
	],
};
const PLAYER_DATA_TYPE: TypeName = {
	name: "StructProperty",
	params: [
		{
			name: "PlayerExtraData_V1",
			params: [{ name: "/Script/Librarian", params: [] }],
		},
	],
};

const newSkillItem = (ability: string, level: number): JsonValue => ({
	kind: "struct",
	properties: [
		{
			name: "Ability",
			type: SKILL_ENUM_TYPE,
			flags: 0,
			arrayIndex: 0,
			guid: null,
			value: { type: "EnumProperty", value: `EUpgradeAbility::${ability}` },
		},
		{
			name: "SkillState",
			type: INT_TYPE,
			flags: 0,
			arrayIndex: 0,
			guid: null,
			value: { type: "IntProperty", value: 0 },
		},
		{
			name: "CurrentLevel",
			type: INT_TYPE,
			flags: 0,
			arrayIndex: 0,
			guid: null,
			value: { type: "IntProperty", value: level },
		},
		{
			name: "CoolDownTimer",
			type: FLOAT_TYPE,
			flags: 0,
			arrayIndex: 0,
			guid: null,
			value: { type: "FloatProperty", value: 0 },
		},
		{
			name: "ActiveTimer",
			type: FLOAT_TYPE,
			flags: 0,
			arrayIndex: 0,
			guid: null,
			value: { type: "FloatProperty", value: 0 },
		},
	],
});

const newSkillData = (items: readonly JsonValue[]): JsonValue => ({
	name: "SkillData",
	type: SKILL_ARRAY_TYPE,
	flags: 0,
	arrayIndex: 0,
	guid: null,
	value: {
		type: "ArrayProperty",
		items,
		trailing: "",
	},
});

const newPlayerData = (skillData: JsonValue): JsonValue => ({
	name: "PlayerExtraDataV1",
	type: PLAYER_DATA_TYPE,
	flags: 0,
	arrayIndex: 0,
	guid: null,
	value: {
		type: "StructProperty",
		native: false,
		hex: "",
		properties: [skillData],
		trailing: "",
	},
});

const skillItemAbility = (item: JsonValue): string | undefined => {
	const properties = arrayAt(item, "properties");
	if (properties === undefined) return undefined;
	const index = propertyIndex(properties, "Ability");
	if (index < 0) return undefined;
	return stringAt(objectAt(properties[index], "value"), "value");
};

const skillItemLevel = (item: JsonValue): number | undefined => {
	const properties = arrayAt(item, "properties");
	if (properties === undefined) return undefined;
	const index = propertyIndex(properties, "CurrentLevel");
	if (index < 0) return undefined;
	return numberAt(objectAt(properties[index], "value"), "value");
};

const raiseSkillLevel = (item: JsonValue, target: number): JsonValue => {
	const properties = arrayAt(item, "properties");
	if (properties === undefined) return item;
	const index = propertyIndex(properties, "CurrentLevel");
	if (index < 0) return item;
	const current = numberAt(objectAt(properties[index], "value"), "value");
	if (current === undefined || current >= target) return item;
	return setAtPath(item, ["properties", index, "value", "value"], target);
};

const playerDataLocation = (
	doc: JsonValue,
):
	| { readonly index: number; readonly properties: readonly JsonValue[] }
	| undefined => {
	const properties = listProperties(doc);
	if (properties === undefined) return undefined;
	for (const name of ["PlayerExtraDataV1", "PlayerExtraData"]) {
		const index = propertyIndex(properties, name);
		if (index < 0) continue;
		const tag = properties[index];
		const value = objectAt(tag, "value");
		if (value === undefined || stringAt(value, "type") !== "StructProperty") {
			continue;
		}
		const inner = arrayAt(value, "properties");
		if (inner === undefined) continue;
		return { index, properties: inner };
	}
	return undefined;
};

const skillItemsLocation = (
	doc: JsonValue,
):
	| { readonly path: SavePath; readonly items: readonly JsonValue[] }
	| undefined => {
	const path = skillItemsPath(doc);
	if (path === undefined) return undefined;
	const items = getAtPath(doc, path);
	if (!Array.isArray(items)) return undefined;
	return { path, items };
};

const planSkillLevels = (
	doc: JsonValue,
	targetFor: (ability: string) => number,
): readonly SaveEdit[] => {
	const location = skillItemsLocation(doc);
	const players = playerDataLocation(doc);
	const current = new Map<string, JsonValue>();
	for (const [index, item] of (location?.items ?? []).entries()) {
		const ability = skillItemAbility(item) ?? ABILITY_ORDER[index];
		if (ability !== undefined && !current.has(ability)) {
			current.set(ability, item);
		}
	}
	const complete = ABILITY_ORDER.every((ability) => current.has(ability));
	if (location !== undefined && complete) {
		const edits: SaveEdit[] = [];
		for (const ability of ABILITY_ORDER) {
			const item = current.get(ability);
			if (item === undefined) continue;
			const target = Math.max(skillItemLevel(item) ?? 0, targetFor(ability));
			const properties = arrayAt(item, "properties");
			if (properties === undefined) continue;
			const index = propertyIndex(properties, "CurrentLevel");
			if (index < 0) continue;
			const currentLevel = skillItemLevel(item) ?? 0;
			if (currentLevel >= target) continue;
			const path = [
				...location.path,
				location.items.indexOf(item),
				"properties",
				index,
				"value",
				"value",
			];
			edits.push({
				id: editId(path, target),
				label: `${ability} · CurrentLevel`,
				path,
				before: currentLevel,
				after: target,
			});
		}
		return edits;
	}
	const desired = ABILITY_ORDER.map((ability) => {
		const item = current.get(ability);
		const target = targetFor(ability);
		if (item === undefined) return newSkillItem(ability, target);
		return raiseSkillLevel(item, target);
	});
	if (location !== undefined) {
		const unchanged =
			desired.length === location.items.length &&
			desired.every(
				(item, index) =>
					JSON.stringify(item) === JSON.stringify(location.items[index]),
			);
		if (unchanged) return [];
		return [
			{
				id: editId(location.path, desired),
				label: "SkillData · every skill",
				path: location.path,
				before: location.items,
				after: desired,
			},
		];
	}
	if (players !== undefined) {
		const properties = players.properties.slice();
		const at = propertyIndex(properties, "CollectedItems");
		properties.splice(at < 0 ? 0 : at, 0, newSkillData(desired));
		const path = ["list", "properties", players.index, "value", "properties"];
		return [
			{
				id: editId(path, properties),
				label: "PlayerExtraDataV1 · add SkillData",
				path,
				before: players.properties,
				after: properties,
			},
		];
	}
	const top = listProperties(doc);
	if (top === undefined) return [];
	const properties = top.slice();
	const at = propertyIndex(properties, "BGMIdx");
	properties.splice(
		at < 0 ? properties.length : at,
		0,
		newPlayerData(newSkillData(desired)),
	);
	return [
		{
			id: editId(["list", "properties"], properties),
			label: "PlayerExtraDataV1 · add every skill",
			path: ["list", "properties"],
			before: top,
			after: properties,
		},
	];
};

const duration = (seconds: number): string => {
	const whole = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(whole / 3600);
	const minutes = Math.floor((whole % 3600) / 60);
	if (hours === 0) return `${minutes} min`;
	return `${hours} h ${minutes} min`;
};

const progressNumber = (doc: JsonValue, name: string): number | undefined => {
	const properties = listProperties(doc);
	if (properties === undefined) return undefined;
	const progress = propertyStruct(properties, "GameProgressData");
	if (progress === undefined) return undefined;
	const inner = arrayAt(progress.value, "properties");
	if (inner === undefined) return undefined;
	const field = propertyStruct(inner, name);
	return field === undefined ? undefined : numberAt(field.value, "value");
};

const maxSkills: QuickAction = {
	id: "max-major-spells",
	label: "Max every major spell",
	description:
		"Set Sort to level 5 and Shelf Guide, Insight, Auto-Shelving and Assemble to level 10, the native caps the upgrade arrays use.",
	plan: (doc) => planSkillLevels(doc, (ability) => MAJOR_MAX[ability] ?? 1),
};

const addEverySkill: QuickAction = {
	id: "add-every-skill",
	label: "Add every skill",
	description:
		"Create the missing SkillData array and any missing ability entries at level 1, keeping levels already earned.",
	plan: (doc) => planSkillLevels(doc, () => 1),
};

const unlockMinorSpells: QuickAction = {
	id: "unlock-minor-spells",
	label: "Unlock every minor spell",
	description:
		"Raise Jump, both bag upgrades and Jogging to level 1, the level the four chest rewards set.",
	plan: (doc) =>
		planSkillLevels(doc, (ability) => (MINOR_SPELLS.includes(ability) ? 1 : 0)),
};

const skillColumnPath = (
	row: JsonValue,
	name: string,
): SavePath | undefined => {
	const properties = arrayAt(row, "properties");
	if (properties === undefined) return undefined;
	const index = propertyIndex(properties, name);
	if (index < 0) return undefined;
	return ["properties", index, "value", "value"];
};

const skillsTable: SaveTable = {
	id: "skills",
	label: "Skills",
	path: [],
	resolvePath: skillItemsPath,
	emptyMessage:
		"This save has no SkillData yet. Add every skill creates all nine entries.",
	columns: [
		{
			label: "Ability",
			path: ["properties", 0, "value", "value"],
			read: (row, index) => skillItemAbility(row) ?? ABILITY_ORDER[index],
			readOnly: true,
		},
		{
			label: "Level",
			path: ["properties", 2, "value", "value"],
			resolvePath: (row) => skillColumnPath(row, "CurrentLevel"),
		},
		{
			label: "State",
			path: ["properties", 1, "value", "value"],
			resolvePath: (row) => skillColumnPath(row, "SkillState"),
			readOnly: true,
		},
		{
			label: "Cooldown",
			path: ["properties", 3, "value", "value"],
			resolvePath: (row) => skillColumnPath(row, "CoolDownTimer"),
			readOnly: true,
		},
		{
			label: "Active",
			path: ["properties", 4, "value", "value"],
			resolvePath: (row) => skillColumnPath(row, "ActiveTimer"),
			readOnly: true,
		},
	],
};

const booleanAt = (value: JsonValue, key: string): boolean => {
	const found = isJsonObject(value) ? value[key] : undefined;
	if (typeof found !== "boolean") {
		throw new Error(`"${key}" must be a boolean.`);
	}
	return found;
};

const typeNameValue = (value: JsonValue): TypeName => ({
	name: requireStringAt(value, "name"),
	params: requireArrayAt(value, "params").map(typeNameValue),
});

const arrayItemOf = (value: JsonValue): ArrayItem => {
	const kind = requireStringAt(value, "kind");
	switch (kind) {
		case "struct":
			return {
				kind,
				properties: requireArrayAt(value, "properties").map(propertyTagOf),
			};
		case "int":
		case "float":
		case "double":
		case "byte":
			return { kind, value: requireNumberAt(value, "value") };
		case "int64":
		case "string":
			return { kind, value: requireStringAt(value, "value") };
		case "bool":
			return { kind, value: booleanAt(value, "value") };
		default:
			throw new Error(`Unknown array item kind "${kind}".`);
	}
};

const propertyValueOf = (value: JsonValue): PropertyValue => {
	const type = requireStringAt(value, "type");
	switch (type) {
		case "BoolProperty":
			return { type, value: booleanAt(value, "value") };
		case "ByteProperty":
		case "IntProperty":
		case "FloatProperty":
		case "DoubleProperty":
			return { type, value: requireNumberAt(value, "value") };
		case "Int64Property":
		case "StrProperty":
		case "NameProperty":
		case "EnumProperty":
			return { type, value: requireStringAt(value, "value") };
		case "StructProperty":
			return {
				type,
				native: booleanAt(value, "native"),
				hex: requireStringAt(value, "hex"),
				properties: requireArrayAt(value, "properties").map(propertyTagOf),
				trailing: requireStringAt(value, "trailing"),
			};
		case "ArrayProperty":
			return {
				type,
				items: requireArrayAt(value, "items").map(arrayItemOf),
				trailing: requireStringAt(value, "trailing"),
			};
		case "MapProperty":
			return { type, hex: requireStringAt(value, "hex") };
		case "OpaqueProperty":
			return {
				type,
				declaredType: requireStringAt(value, "declaredType"),
				hex: requireStringAt(value, "hex"),
			};
		default:
			throw new Error(`Unknown property value type "${type}".`);
	}
};

const propertyTagOf = (value: JsonValue): PropertyTag => {
	const guid = isJsonObject(value) ? value.guid : undefined;
	return {
		name: requireStringAt(value, "name"),
		type: typeNameValue(requireObjectAt(value, "type")),
		flags: requireNumberAt(value, "flags"),
		arrayIndex: requireNumberAt(value, "arrayIndex"),
		guid: typeof guid === "string" ? guid : null,
		value: propertyValueOf(requireObjectAt(value, "value")),
	};
};

const saveOf = (doc: JsonValue) => {
	const engine = requireObjectAt(doc, "engine");
	const list = requireObjectAt(doc, "list");
	return {
		magic: requireStringAt(doc, "magic"),
		fileVersion: requireNumberAt(doc, "fileVersion"),
		saveGameVersion: requireNumberAt(doc, "saveGameVersion"),
		packageFileUE5Version: requireNumberAt(doc, "packageFileUE5Version"),
		engine: {
			major: requireNumberAt(engine, "major"),
			minor: requireNumberAt(engine, "minor"),
			patch: requireNumberAt(engine, "patch"),
			changelist: requireNumberAt(engine, "changelist"),
			branch: requireStringAt(engine, "branch"),
		},
		customVersionFormat: requireNumberAt(doc, "customVersionFormat"),
		customVersions: requireArrayAt(doc, "customVersions").map((entry) => ({
			id: requireStringAt(entry, "id"),
			version: requireNumberAt(entry, "version"),
		})),
		saveGameType: requireStringAt(doc, "saveGameType"),
		containerTag: requireNumberAt(doc, "containerTag"),
		list: {
			properties: requireArrayAt(list, "properties").map(propertyTagOf),
			trailing: requireStringAt(list, "trailing"),
		},
	};
};

export const librarian: SaveCodec = {
	game: "Librarian: Tidy Up the Arcane Library!",
	formatLabel: "Unreal 5.5 GVAS",
	extensions: ["sav"],
	defaultPath:
		"C:\\Users\\<you>\\AppData\\Local\\Librarian\\Saved\\SaveGames\\Map01\\Save01\\GameData.sav",
	notes: [
		{
			title: "What this file is",
			body: "GameData.sav is an Unreal Engine 5.5 GVAS container: an engine header, 78 custom-version entries, the save class name, one pad byte and then a property list. It is neither compressed nor encrypted. SlotData.sav beside it holds the slot's metadata; this editor writes GameData.sav.",
		},
		{
			title: "Property tags",
			body: "Each property carries a name, a complete type-name tree, a 32-bit body size and a flags byte. Flag 0x08 marks native serialisation: Quat, Vector and DateTime bodies are kept verbatim because they are not a property list. Flag 0x10 carries a boolean's value, so a BoolProperty has a zero-byte body.",
		},
		{
			title: "Skills",
			body: "PlayerExtraDataV1.SkillData is an array of nine structs. Ability names the spell where the save carries it; some saves omit that field and rely on EUpgradeAbility order, which this editor uses. CurrentLevel holds the level. The native caps are Sort 5; Shelf Guide, Insight, Auto-Shelving and Assemble 10; and Jump, both bag upgrades and Jogging 1. Saves made before the array exists are repaired by the Add every skill action.",
		},
		{
			title: "What is left alone",
			body: "The bookcase, book and collected-item map bodies are copied byte for byte. Only fields you change are re-encoded, and the rebuilt file is decoded again and compared with your edits before it is offered for download.",
		},
		{
			title: "Where it lives",
			body: "The game writes each slot to Saved\\SaveGames\\Map01\\<slot>\\GameData.sav. Edit a copy, keep the original, and put the rebuilt GameData.sav back into the slot folder with the same name.",
		},
	],
	decode: async (bytes) => readGvas(bytes),
	encode: async (doc) => writeGvas(saveOf(doc)),
	summarise: (doc) => {
		const rows: SummaryRow[] = [];
		const skills = readSkills(doc);
		const learned = skills.filter((skill) => skill.level > 0).length;
		const majors = skills.filter(
			(skill) => MAJOR_MAX[abilityName(skill.ability)] !== undefined,
		);
		const maxed = majors.filter(
			(skill) =>
				skill.level >= (MAJOR_MAX[abilityName(skill.ability)] ?? Infinity),
		).length;
		const rowsFinished = progressNumber(doc, "CurrentFinishedRowNum");
		const booksInserted = progressNumber(doc, "InsertedBookNum");
		const playTime = progressNumber(doc, "TotalPlayTime");
		rows.push({
			label: "Format version",
			value: String(numberAt(doc, "fileVersion") ?? "—"),
		});
		rows.push({
			label: "UE package",
			value: String(numberAt(doc, "packageFileUE5Version") ?? "—"),
		});
		rows.push({
			label: "Save class",
			value: stringAt(doc, "saveGameType")?.split(".").at(-1) ?? "—",
		});
		if (rowsFinished !== undefined) {
			rows.push({
				label: "Rows finished",
				value: String(rowsFinished),
			});
		}
		if (booksInserted !== undefined) {
			rows.push({
				label: "Books inserted",
				value: String(booksInserted),
			});
		}
		if (playTime !== undefined) {
			rows.push({ label: "Play time", value: duration(playTime) });
		}
		rows.push({
			label: "Spells learned",
			value: `${learned} of ${skills.length}`,
		});
		rows.push({
			label: "Major spells maxed",
			value: `${maxed} of ${majors.length}`,
			emphasis: maxed === majors.length && majors.length > 0,
		});
		return rows;
	},
	actions: [maxSkills, addEverySkill, unlockMinorSpells],
	tables: [skillsTable],
};
