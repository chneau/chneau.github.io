import type { Bytes } from "../../shared";
import {
	BlobReader,
	type ObjectField,
	readFieldValue,
	readSparseArray,
	type SparseEntry,
	type StringPool,
	type SystemsContainer,
	sizeOfField,
	writeFieldValue,
} from "./systems";

const PLAYER_DEVELOPMENT_CLASS = "PlayerDevelopmentData";

export const SCRIPTABLE_SYSTEMS_NODE = "ScriptableSystemsContainer";

const DEVELOPMENT_POINT_ORDER: readonly string[] = [
	"Attribute",
	"Espionage",
	"Primary",
	"Secondary",
];

export const PROFICIENCY_ORDER: readonly string[] = [
	"Assault",
	"Athletics",
	"Brawling",
	"ColdBlood",
	"CombatHacking",
	"CoolSkill",
	"Crafting",
	"Demolition",
	"Engineering",
	"Espionage",
	"Gunslinger",
	"Hacking",
	"IntelligenceSkill",
	"Kenjutsu",
	"Level",
	"ReflexesSkill",
	"Stealth",
	"StreetCred",
	"StrengthSkill",
	"TechnicalAbilitySkill",
];

const ATTRIBUTE_DATA_ORDER: readonly string[] = [
	"Body",
	"Cool",
	"Espionage",
	"Intelligence",
	"Reflexes",
	"TechnicalAbility",
];

export const SPENDABLE_ATTRIBUTES: readonly string[] = [
	"Strength",
	"Reflexes",
	"TechnicalAbility",
	"Intelligence",
	"Cool",
];

export const RETIRED_ATTRIBUTES: readonly string[] = [
	"Espionage",
	"Gunslinger",
];

export const MAX_ATTRIBUTE = 20;

export const MAX_SKILL = 60;

export const MAX_POINTS = 720;

export const MAX_STREET_CRED = 50;

export type DevelopmentPoints = {
	readonly unspent: number;
	readonly spent: number;
};

type Skill = {
	readonly level: number;
	readonly exp: number;
};

type PerkTree = {
	readonly name: string;
	readonly perks: readonly { readonly perk: string; readonly level: number }[];
};

type Trait = {
	readonly name: string;
	readonly unlocked: boolean;
	readonly level: number;
};

export type Development = {
	readonly lifePath: string;
	readonly developmentPoints: ReadonlyMap<string, DevelopmentPoints>;
	readonly attributes: ReadonlyMap<string, number>;
	readonly skills: ReadonlyMap<string, Skill>;
	readonly perkTrees: readonly PerkTree[];
	readonly legacyPerks: readonly string[];
	readonly traits: readonly Trait[];
};

const NO_DEVELOPMENT: Development = {
	lifePath: "",
	developmentPoints: new Map(),
	attributes: new Map(),
	skills: new Map(),
	perkTrees: [],
	legacyPerks: [],
	traits: [],
};

const numberAt = (
	entry: SparseEntry,
	field: string,
	fallback: number,
): number => {
	const value = entry.values.get(field);
	return typeof value === "number" ? value : fallback;
};

const boolAt = (entry: SparseEntry, field: string): boolean =>
	entry.values.get(field) === true;

const nameOf = (
	entry: SparseEntry,
	index: number,
	order: readonly string[],
): string => (entry.type !== "" ? entry.type : (order[index] ?? ""));

const attributeName = (entry: SparseEntry, index: number): string => {
	const named = entry.values.get("attributeName");
	if (typeof named === "string" && named !== "") return named;
	const id = entry.values.get("id");
	if (typeof id === "bigint") {
		return `id:${id.toString(16).padStart(16, "0")}`;
	}
	return `attribute ${index}`;
};

const treeName = (type: string): string => type.replace(/AttributeData$/, "");

const legacyCategory = (type: string): string => type.replace(/_Area_\d+$/, "");

const poolNameAt = (field: ObjectField, pool: StringPool): string => {
	if (field.data.length < 2) return "";
	const reader = new BlobReader(field.data);
	return pool.at(reader.u16()) ?? "";
};

const readNamedArray = (
	blob: Bytes,
	pool: StringPool,
	order: readonly string[],
): readonly { readonly entry: SparseEntry; readonly name: string }[] =>
	readSparseArray(blob, pool).map((entry, index) => ({
		entry,
		name: nameOf(entry, index, order),
	}));

const readPerkTrees = (
	field: ObjectField,
	pool: StringPool,
): readonly PerkTree[] =>
	readPerkTreeElements(field.data, pool).map(({ entry, name }) => ({
		name: treeName(name),
		perks: readNestedPerks(field.data, entry, pool),
	}));

const readPerkTreeElements = (
	blob: Bytes,
	pool: StringPool,
): readonly { readonly entry: SparseEntry; readonly name: string }[] => {
	const reader = new BlobReader(blob);
	const count = reader.u32();
	if (count > blob.length) {
		throw new Error(
			`This save's perk trees claim ${count} entries, which their ${blob.length} bytes cannot hold.`,
		);
	}
	const trees: { entry: SparseEntry; name: string }[] = [];
	for (let index = 0; index < count; index += 1) {
		const elementAt = reader.offset;
		const fieldCount = reader.u16();
		const descriptors: {
			name: string;
			type: string;
			dataOffset: number;
		}[] = [];
		for (let field = 0; field < fieldCount; field += 1) {
			descriptors.push({
				name: pool.at(reader.u16()) ?? "",
				type: pool.at(reader.u16()) ?? "",
				dataOffset: reader.u32(),
			});
		}
		const values = new Map<string, number | bigint | boolean | string>();
		const offsets = new Map<string, number>();
		let end = elementAt + 2 + fieldCount * 8;
		for (const descriptor of descriptors) {
			offsets.set(descriptor.name, elementAt + descriptor.dataOffset);
			reader.seek(elementAt + descriptor.dataOffset);
			if (descriptor.name === "unlockedPerks") {
				const perks = reader.u32();
				if (perks > blob.length) {
					throw new Error(
						`A perk tree in this save claims ${perks} perks, which the save cannot hold.`,
					);
				}
				for (let perk = 0; perk < perks; perk += 1) {
					end = Math.max(end, skipNestedPerk(reader, pool));
				}
				continue;
			}
			const size = sizeOfField(descriptor.type);
			if (size === undefined) continue;
			const value = readFieldValue(reader, descriptor.type, pool);
			if (value !== undefined) values.set(descriptor.name, value);
			end = Math.max(end, elementAt + descriptor.dataOffset + size);
		}
		trees.push({
			entry: { type: String(values.get("type") ?? ""), values, offsets },
			name:
				values.get("type") !== undefined && values.get("type") !== ""
					? String(values.get("type"))
					: (ATTRIBUTE_DATA_ORDER[index] ?? ""),
		});
		reader.seek(end);
	}
	return trees;
};

const skipNestedPerk = (reader: BlobReader, pool: StringPool): number => {
	const at = reader.offset;
	const fieldCount = reader.u16();
	let end = at + 2 + fieldCount * 8;
	for (let field = 0; field < fieldCount; field += 1) {
		reader.u16();
		const type = pool.at(reader.u16()) ?? "";
		const dataOffset = reader.u32();
		const size = sizeOfField(type);
		if (size !== undefined) end = Math.max(end, at + dataOffset + size);
	}
	reader.seek(end);
	return end;
};

const readNestedPerks = (
	blob: Bytes,
	entry: SparseEntry,
	pool: StringPool,
): readonly { perk: string; level: number }[] => {
	const start = entry.offsets.get("unlockedPerks");
	if (start === undefined) return [];
	const reader = new BlobReader(blob);
	reader.seek(start);
	const count = reader.u32();
	if (count > blob.length) return [];
	const perks: { perk: string; level: number }[] = [];
	for (let index = 0; index < count; index += 1) {
		const at = reader.offset;
		const fieldCount = reader.u16();
		const names: string[] = [];
		const types: string[] = [];
		const offsets: number[] = [];
		for (let field = 0; field < fieldCount; field += 1) {
			names.push(pool.at(reader.u16()) ?? "");
			types.push(pool.at(reader.u16()) ?? "");
			offsets.push(reader.u32());
		}
		let perk = "";
		let level = 0;
		let end = at + 2 + fieldCount * 8;
		for (const [field, fieldName] of names.entries()) {
			const type = types[field] ?? "";
			const size = type === "Int32" ? 4 : 2;
			reader.seek(at + (offsets[field] ?? 0));
			if (fieldName === "type") {
				perk = pool.at(reader.u16()) ?? "";
			} else if (fieldName === "currLevel") {
				level = reader.i32();
			}
			end = Math.max(end, at + (offsets[field] ?? 0) + size);
		}
		if (perk !== "") perks.push({ perk, level });
		reader.seek(end);
	}
	return perks;
};

export const readDevelopment = (systems: SystemsContainer): Development => {
	const object = systems.find(PLAYER_DEVELOPMENT_CLASS);
	if (object === undefined) return NO_DEVELOPMENT;
	const pool = systems.pool;

	const lifePathField = object.field("lifePath");

	const developmentPoints = new Map<string, DevelopmentPoints>();
	const devPoints = object.field("devPoints");
	if (devPoints !== undefined) {
		for (const [index, entry] of readSparseArray(
			devPoints.data,
			pool,
		).entries()) {
			developmentPoints.set(nameOf(entry, index, DEVELOPMENT_POINT_ORDER), {
				unspent: numberAt(entry, "unspent", 0),
				spent: numberAt(entry, "spent", 0),
			});
		}
	}

	const attributes = new Map<string, number>();
	const attributeField = object.field("attributes");
	if (attributeField !== undefined) {
		for (const [index, entry] of readSparseArray(
			attributeField.data,
			pool,
		).entries()) {
			attributes.set(attributeName(entry, index), numberAt(entry, "value", 0));
		}
	}

	const skills = new Map<string, Skill>();
	const proficiencyField = object.field("proficiencies");
	if (proficiencyField !== undefined) {
		for (const [index, entry] of readSparseArray(
			proficiencyField.data,
			pool,
		).entries()) {
			skills.set(nameOf(entry, index, PROFICIENCY_ORDER), {
				level: numberAt(entry, "currentLevel", 0),
				exp: numberAt(entry, "currentExp", 0),
			});
		}
	}

	const attributeData = object.field("attributesData");
	const perkTrees =
		attributeData === undefined ? [] : readPerkTrees(attributeData, pool);

	const legacyPerks: string[] = [];
	const perkAreas = object.field("perkAreas");
	if (perkAreas !== undefined) {
		for (const { name } of readNamedArray(perkAreas.data, pool, [])) {
			if (name !== "") legacyPerks.push(legacyCategory(name));
		}
	}

	const traits: Trait[] = [];
	const traitField = object.field("traits");
	if (traitField !== undefined) {
		for (const { entry, name } of readNamedArray(traitField.data, pool, [])) {
			if (name !== "") {
				traits.push({
					name,
					unlocked: boolAt(entry, "unlocked"),
					level: numberAt(entry, "currLevel", 0),
				});
			}
		}
	}

	return {
		lifePath:
			lifePathField === undefined ? "" : poolNameAt(lifePathField, pool),
		developmentPoints,
		attributes,
		skills,
		perkTrees,
		legacyPerks: [...new Set(legacyPerks)],
		traits,
	};
};

type ScalarPatch = {
	readonly blob: Bytes;
	readonly offset: number;
	readonly type: string;
	readonly value: number;
};

export const applyPatches = (patches: readonly ScalarPatch[]): number => {
	let written = 0;
	for (const patch of patches) {
		const width = PATCH_TYPE_WIDTH[patch.type];
		if (width === undefined) continue;
		if (patch.offset < 0 || patch.offset + width > patch.blob.length) continue;
		if (writeFieldValue(patch.blob, patch.offset, patch.type, patch.value)) {
			written += 1;
		}
	}
	return written;
};

const PATCH_TYPE_WIDTH: Readonly<Record<string, number>> = {
	Int32: 4,
	UInt32: 4,
	Float32: 4,
};

export const planPatches = (
	systems: SystemsContainer,
	desired: Development,
): readonly ScalarPatch[] => {
	const object = systems.find(PLAYER_DEVELOPMENT_CLASS);
	if (object === undefined) return [];
	const pool = systems.pool;
	const patches: ScalarPatch[] = [];

	const devPoints = object.field("devPoints");
	if (devPoints !== undefined) {
		for (const [index, entry] of readSparseArray(
			devPoints.data,
			pool,
		).entries()) {
			const name = nameOf(entry, index, DEVELOPMENT_POINT_ORDER);
			const want = desired.developmentPoints.get(name);
			if (want === undefined) continue;
			const unspentAt = entry.offsets.get("unspent");
			const spentAt = entry.offsets.get("spent");
			if (unspentAt !== undefined) {
				patches.push({
					blob: devPoints.data,
					offset: unspentAt,
					type: "Int32",
					value: want.unspent,
				});
			}
			if (spentAt !== undefined) {
				patches.push({
					blob: devPoints.data,
					offset: spentAt,
					type: "Int32",
					value: want.spent,
				});
			}
		}
	}

	const attributeField = object.field("attributes");
	if (attributeField !== undefined) {
		for (const [index, entry] of readSparseArray(
			attributeField.data,
			pool,
		).entries()) {
			const name = attributeName(entry, index);
			const want = desired.attributes.get(name);
			if (want === undefined) continue;
			const at = entry.offsets.get("value");
			if (at === undefined) continue;
			patches.push({
				blob: attributeField.data,
				offset: at,
				type: "Int32",
				value: want,
			});
		}
	}

	const proficiencyField = object.field("proficiencies");
	if (proficiencyField !== undefined) {
		for (const [index, entry] of readSparseArray(
			proficiencyField.data,
			pool,
		).entries()) {
			const name = nameOf(entry, index, PROFICIENCY_ORDER);
			const want = desired.skills.get(name);
			if (want === undefined) continue;
			const levelAt = entry.offsets.get("currentLevel");
			const expAt = entry.offsets.get("currentExp");
			if (levelAt !== undefined) {
				patches.push({
					blob: proficiencyField.data,
					offset: levelAt,
					type: "Int32",
					value: want.level,
				});
			}
			if (expAt !== undefined) {
				patches.push({
					blob: proficiencyField.data,
					offset: expAt,
					type: "Int32",
					value: want.exp,
				});
			}
		}
	}

	return patches;
};
