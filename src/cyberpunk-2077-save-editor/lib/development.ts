/**
 * `PlayerDevelopmentData`: attributes, skills, Street Cred and perk points.
 *
 * ## The class, and why the summary can name these fields
 *
 * Inside the `ScriptableSystemsContainer` sits an object of class
 * `PlayerDevelopmentData`. Its fields are real and confirmed against the game's
 * own `CEnums` catalogue and the reference implementation: `devPoints`,
 * `attributes`, `proficiencies`, `attributesData`, `perkAreas`, `traits` and
 * `lifePath`. Nothing on this page invents a field name — every key below is one
 * the game writes.
 *
 * ## Why the element types come from an enum order
 *
 * Each of those fields is an array of structs, and each struct carries a `type`
 * naming itself. A save may omit that redundant field, in which case an element
 * is identified only by its position — and the position *is* the enum order,
 * because the game serialises the array in enum order. The orders below are
 * transcribed from the game's `CEnums.json`, not guessed, which is why index 17
 * of `gamedataProficiencyType` is Street Cred.
 *
 * ## What is not here, and why
 *
 * Attributes are stored with a `TweakDBID` and normally resolved to
 * `BaseStats.*` names through a dictionary of 74,315 entries. Shipping that
 * dictionary would be three megabytes of the bundle to rename five attributes,
 * so the codec reads `attributeName` — the field the struct itself carries, and
 * the same `gamedataStatType` value the game's own cheat uses — and falls back to
 * the numeric id only when a save has omitted it. A fabricated name there would
 * be worse than an ugly one, because the quick actions key off this string.
 */
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

/** The container class holding the player's own development data. */
const PLAYER_DEVELOPMENT_CLASS = "PlayerDevelopmentData";

/** The node the player development object is found under. */
export const SCRIPTABLE_SYSTEMS_NODE = "ScriptableSystemsContainer";

/**
 * `gamedataDevelopmentPointType` in enum order, without `Count`/`Invalid`.
 *
 * Transcribed from the game's `CEnums.json`. Index 0 is `Attribute`, which is
 * what a save omitting its `type` field relies on.
 */
const DEVELOPMENT_POINT_ORDER: readonly string[] = [
	"Attribute",
	"Espionage",
	"Primary",
	"Secondary",
];

/**
 * `gamedataProficiencyType` in enum order, without `Count`/`Invalid`.
 *
 * The twenty entries the game declares, transcribed from `CEnums.json`.
 */
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

/** `gamedataAttributeDataType` in enum order: the Cyberpunk 2.0 perk trees. */
const ATTRIBUTE_DATA_ORDER: readonly string[] = [
	"Body",
	"Cool",
	"Espionage",
	"Intelligence",
	"Reflexes",
	"TechnicalAbility",
];

/**
 * The five attributes the 2.0 tree treats as spendable.
 *
 * Names confirmed as `gamedataStatType` entries in the game's catalogue, and the
 * five the reference implementation levels.
 */
export const SPENDABLE_ATTRIBUTES: readonly string[] = [
	"Strength",
	"Reflexes",
	"TechnicalAbility",
	"Intelligence",
	"Cool",
];

/**
 * Attributes the 2.0 tree replaced.
 *
 * `Espionage` and `Gunslinger` are 1.x attributes. The reference implementation
 * pins both to zero rather than levelling them, because raising an attribute the
 * game no longer spends is what desynchronises a character's perks.
 */
export const RETIRED_ATTRIBUTES: readonly string[] = [
	"Espionage",
	"Gunslinger",
];

/** The attribute cap the game enforces. */
export const MAX_ATTRIBUTE = 20;

/** The skill cap the 2.0 progression enforces. */
export const MAX_SKILL = 60;

/** The development-point cap the game enforces. */
export const MAX_POINTS = 720;

/** The Street Cred level the reference implementation pins. */
export const MAX_STREET_CRED = 50;

/** One development-point entry: unspent and spent counts. */
export type DevelopmentPoints = {
	readonly unspent: number;
	readonly spent: number;
};

/** A proficiency or skill: its level and its progress towards the next. */
type Skill = {
	readonly level: number;
	readonly exp: number;
};

/** One perk tree, named as the game's own enum names it. */
type PerkTree = {
	readonly name: string;
	/** Perks bought in the tree, with the level each was bought to. */
	readonly perks: readonly { readonly perk: string; readonly level: number }[];
};

/** One trait, with the level it was taken to. */
type Trait = {
	readonly name: string;
	readonly unlocked: boolean;
	readonly level: number;
};

/**
 * The playable part of a save, resolved to names.
 *
 * Derived entirely from a decoded save. A save missing a field yields an empty
 * record for it rather than a plausible-looking zero, so the summary can tell
 * "zero Street Cred" apart from "this save has no proficiencies at all".
 */
export type Development = {
	readonly lifePath: string;
	readonly developmentPoints: ReadonlyMap<string, DevelopmentPoints>;
	readonly attributes: ReadonlyMap<string, number>;
	readonly skills: ReadonlyMap<string, Skill>;
	readonly perkTrees: readonly PerkTree[];
	/** 1.x perk categories, e.g. `Body`. */
	readonly legacyPerks: readonly string[];
	readonly traits: readonly Trait[];
};

/** An empty result, for a save whose container could not be read. */
const NO_DEVELOPMENT: Development = {
	lifePath: "",
	developmentPoints: new Map(),
	attributes: new Map(),
	skills: new Map(),
	perkTrees: [],
	legacyPerks: [],
	traits: [],
};

/** A field's value as a number, or `fallback` when it is not one. */
const numberAt = (
	entry: SparseEntry,
	field: string,
	fallback: number,
): number => {
	const value = entry.values.get(field);
	return typeof value === "number" ? value : fallback;
};

/** A field's value as a boolean, defaulting to false. */
const boolAt = (entry: SparseEntry, field: string): boolean =>
	entry.values.get(field) === true;

/** A struct's own type name, or its position in `order` when it has none. */
const nameOf = (
	entry: SparseEntry,
	index: number,
	order: readonly string[],
): string => (entry.type !== "" ? entry.type : (order[index] ?? ""));

/**
 * The name of an attribute entry.
 *
 * `attributeName` is the field the game itself uses. A save that omits it leaves
 * only the `TweakDBID` `id`, which without the dictionary can only be reported
 * numerically.
 */
const attributeName = (entry: SparseEntry, index: number): string => {
	const named = entry.values.get("attributeName");
	if (typeof named === "string" && named !== "") return named;
	const id = entry.values.get("id");
	if (typeof id === "bigint") {
		return `id:${id.toString(16).padStart(16, "0")}`;
	}
	return `attribute ${index}`;
};

/** Strips the `AttributeData` suffix the 2.0 tree types carry. */
const treeName = (type: string): string => type.replace(/AttributeData$/, "");

/** The 1.x perk category a perk-area type belongs to. */
const legacyCategory = (type: string): string => type.replace(/_Area_\d+$/, "");

/** Reads a `u16` string-pool index out of a lone field. */
const poolNameAt = (field: ObjectField, pool: StringPool): string => {
	if (field.data.length < 2) return "";
	const reader = new BlobReader(field.data);
	return pool.at(reader.u16()) ?? "";
};

/**
 * Reads a `u32`-counted array of structs, each naming itself.
 *
 * `attributesData` holds a perk tree per entry, `perkAreas` a legacy tree, and
 * `traits` a trait. All three have the same outer shape, so they share this
 * walk and differ only in what they read out of each element.
 */
const readNamedArray = (
	blob: Bytes,
	pool: StringPool,
	order: readonly string[],
): readonly { readonly entry: SparseEntry; readonly name: string }[] =>
	readSparseArray(blob, pool).map((entry, index) => ({
		entry,
		name: nameOf(entry, index, order),
	}));

/**
 * The 2.0 perk trees, each with the perks bought in it.
 *
 * A tree's `unlockedPerks` field is a nested array of the same self-describing
 * struct shape, so each perk's `type` and `currLevel` are read the same way.
 */
const readPerkTrees = (
	field: ObjectField,
	pool: StringPool,
): readonly PerkTree[] =>
	readPerkTreeElements(field.data, pool).map(({ entry, name }) => ({
		name: treeName(name),
		// The perks array is nested inside the element's own bytes rather than in
		// `values`, because an array is not a scalar this walk models. It is read
		// from the element's offset within the field.
		perks: readNestedPerks(field.data, entry, pool),
	}));

/**
 * Walks `attributesData` one tree at a time.
 *
 * This array cannot go through `readSparseArray`, because its last field is a
 * nested array whose type name says `CName` while its content is a whole
 * self-describing array. A generic walk would step two bytes past the start of
 * the next element and read the second tree as garbage — which is why the
 * reference implementation special-cases this field too.
 *
 * Each tree is `type` then `unlockedPerks`, and the array's own length is the
 * only way to find where the next tree begins.
 */
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
				// Step over the nested array using its own count, which is the only
				// thing that says how long it is.
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

/**
 * Steps over one nested perk struct, returning where the next one begins.
 *
 * Each is a `type`/`currLevel` pair in the same self-describing shape as the
 * arrays above, with offsets relative to the perk's own start. The values are
 * not returned: `readNestedPerks` walks the same array again to collect them, and
 * returning them here would be a second way to get the same number.
 */
const skipNestedPerk = (reader: BlobReader, pool: StringPool): number => {
	const at = reader.offset;
	const fieldCount = reader.u16();
	let end = at + 2 + fieldCount * 8;
	for (let field = 0; field < fieldCount; field += 1) {
		reader.u16(); // Field name, already indexed by `readNestedPerks`.
		const type = pool.at(reader.u16()) ?? "";
		const dataOffset = reader.u32();
		const size = sizeOfField(type);
		if (size !== undefined) end = Math.max(end, at + dataOffset + size);
	}
	reader.seek(end);
	return end;
};

/**
 * Reads a tree's `unlockedPerks` array out of the element that holds it.
 *
 * The element's byte range is recovered from the outer array's own descriptors,
 * which is why this takes the field's bytes rather than the parsed entry: the
 * parse deliberately stops at scalars, and an array needs its parent's range.
 */
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

/**
 * The player's development data out of a decoded systems container.
 *
 * Returns `NO_DEVELOPMENT` when the container has no `PlayerDevelopmentData`
 * object, which is the honest answer for a save this editor cannot make claims
 * about — the summary says so rather than showing zeroes.
 */
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

/**
 * One scalar to write back, addressed by the byte offset it occupies.
 *
 * Offsets rather than paths, because a path into a serialised struct array is
 * not a thing the game stores — only the offsets are. Writing a same-width scalar
 * in place is what keeps every other offset in the blob valid, which is why
 * nothing here re-serialises an array to change one number.
 */
type ScalarPatch = {
	readonly blob: Bytes;
	readonly offset: number;
	readonly type: string;
	readonly value: number;
};

/** Applies patches, returning how many actually landed. */
export const applyPatches = (patches: readonly ScalarPatch[]): number => {
	let written = 0;
	for (const patch of patches) {
		if (writeFieldValue(patch.blob, patch.offset, patch.type, patch.value)) {
			written += 1;
		}
	}
	return written;
};

/**
 * Patches to apply to reach `desired` from what `systems` currently holds.
 *
 * Only fields that are actually present are patched, and only for names the
 * document mentions: a save that has no `perks` array gets no `unlockedPerks`
 * patch, rather than one that would create an entry the game never wrote.
 */
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
