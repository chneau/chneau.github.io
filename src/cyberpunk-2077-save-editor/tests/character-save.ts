/**
 * A synthetic save carrying a `PlayerDevelopmentData` object.
 *
 * ## Why this exists, stated plainly
 *
 * **No real Cyberpunk 2077 `sav.dat` is available.** The reference
 * implementation's own round-trip test looks for one at runtime and skips when
 * it finds none, and the data committed alongside it is 8.7 MB of JSON
 * catalogues (`CEnums`, `CFacts`, `CObjectBPs`, `Perks2_0_Template`,
 * `TweakDBIDs`) with no binary fixture. So everything below is synthetic.
 *
 * What that does and does not establish:
 *
 * - **Does:** that the container, the LZ4 chunks, the string pool, the serial
 *   field descriptors and the sparse struct arrays are read and written
 *   correctly *against the format description*, and that a value read out of a
 *   save is written back to the same bytes. The builder here is independent code
 *   written from the specification, not a call into `lib/`, so agreement is
 *   evidence rather than a tautology.
 * - **Does not:** that a save the game wrote contains the fields this codec
 *   expects, or that the enum orders transcribed from `CEnums.json` match the
 *   order a real save serialises its arrays in. Both are confirmed against the
 *   game's own published catalogues and the reference implementation's reading
 *   of a real save — but neither has been observed here.
 */
import type { Bytes } from "../../shared";
import {
	ByteList,
	buildObject,
	buildSave,
	buildStructArray,
	buildSystemsBlob,
	poolIndex,
	type TestStruct,
} from "./synthetic";

/** The pool a real save's systems container holds, in the order this test uses. */
export const POOL: readonly string[] = [
	// Field names of `PlayerDevelopmentData`.
	"devPoints",
	"attributes",
	"proficiencies",
	"lifePath",
	"attributesData",
	"perkAreas",
	"traits",
	"unspent",
	"spent",
	"value",
	"id",
	"attributeName",
	"currentLevel",
	"currentExp",
	"currLevel",
	"unlocked",
	"boughtPerks",
	"unlockedPerks",
	"type",
	// Type names.
	"Int32",
	"Uint32",
	"Bool",
	"CName",
	"gamedataDevelopmentPointType",
	"gamedataStatType",
	"gamedataProficiencyType",
	"gamedataAttributeDataType",
	"gamedataTraitType",
	"TweakDBID",
	// Enum members, in the order the game declares them.
	"Attribute",
	"Espionage",
	"Primary",
	"Secondary",
	"Strength",
	"Reflexes",
	"TechnicalAbility",
	"Intelligence",
	"Cool",
	"Assault",
	"Athletics",
	"Stealth",
	"Kenjutsu",
	"StreetCred",
	"Level",
	"ColdBlood",
	"Streetkid",
	// `gamedataAttributeDataType` members: one per Cyberpunk 2.0 perk tree.
	"BodyAttributeData",
	"CoolAttributeData",
	"EspionageAttributeData",
	"IntelligenceAttributeData",
	"ReflexesAttributeData",
	"TechnicalAbilityAttributeData",
	// `gamedataNewPerkType` members: the perks bought inside a tree.
	"gamedataNewPerkType",
	"Body_Central_Milestone_1",
	"Reflexes_Central_Perk_1_1",
	"Reflexes_Central_Perk_1_2",
	// Object class names.
	"PlayerDevelopmentData",
	"ScriptableSystemsContainer",
	"godModeSystem",
];

/**
 * A struct for `devPoints`: `type` plus the two counts.
 *
 * The field order matters — the reader walks an element's fields in descriptor
 * order and steps to the next element using the *last* one's size, so the last
 * field is the `Int32` that bounds it.
 */
const devPoint = (
	type: string,
	unspent: number,
	spent: number,
): TestStruct => ({
	fields: [
		{ name: "type", type: "gamedataDevelopmentPointType", value: type },
		{ name: "unspent", type: "Int32", value: unspent },
		{ name: "spent", type: "Int32", value: spent },
	],
});

/** A struct for `attributes`: the stat it names and its value. */
const attribute = (name: string, value: number): TestStruct => ({
	fields: [
		{ name: "type", type: "gamedataStatType", value: name },
		{ name: "attributeName", type: "gamedataStatType", value: name },
		{ name: "value", type: "Int32", value },
	],
});

/** A struct for `proficiencies`: its name, level and progress. */
const proficiency = (name: string, level: number, exp: number): TestStruct => ({
	fields: [
		{ name: "type", type: "gamedataProficiencyType", value: name },
		{ name: "currentLevel", type: "Int32", value: level },
		{ name: "currentExp", type: "Int32", value: exp },
	],
});

/** The development points a character starts with. */
export const STARTING_POINTS = {
	Attribute: { unspent: 3, spent: 12 },
	Primary: { unspent: 1, spent: 8 },
	Secondary: { unspent: 0, spent: 2 },
	Espionage: { unspent: 0, spent: 0 },
} as const;

/** The attributes a character starts with. */
export const STARTING_ATTRIBUTES: Readonly<Record<string, number>> = {
	Strength: 6,
	Reflexes: 5,
	TechnicalAbility: 4,
	Intelligence: 7,
	Cool: 3,
};

/** The skills a character starts with, keyed by `gamedataProficiencyType`. */
export const STARTING_SKILLS: readonly (readonly [string, number, number])[] = [
	["Assault", 4, 120],
	["Athletics", 3, 80],
	["Stealth", 6, 200],
	["Kenjutsu", 2, 40],
	["StreetCred", 12, 900],
	["Level", 7, 340],
	["ColdBlood", 1, 25],
];

/**
 * Serialises one `unlockedPerks` array: a count, then self-describing structs of
 * `type` and `currLevel`.
 *
 * Written separately because the field reader models scalars and an array is not
 * one — which is exactly why this lives in the builder and not in `lib/`.
 */
const buildUnlockedPerks = (
	perks: readonly (readonly [string, number])[],
): readonly number[] => {
	const out = new ByteList();
	out.u32(perks.length);
	for (const [perk, level] of perks) {
		const elementAt = out.length;
		out.u16(2);
		const tableAt = out.length;
		out.skip(2 * 8);
		const perkAt = out.length;
		out.u16(Math.max(0, poolIndex(POOL, perk)));
		const levelAt = out.length;
		out.i32(level);
		// The table is patched rather than written in place: each offset is only
		// known once the field's own bytes are laid down after the table.
		out.patchU16(tableAt, Math.max(0, poolIndex(POOL, "type")));
		out.patchU16(
			tableAt + 2,
			Math.max(0, poolIndex(POOL, "gamedataNewPerkType")),
		);
		out.patchU32(tableAt + 4, perkAt - elementAt);
		out.patchU16(tableAt + 8, Math.max(0, poolIndex(POOL, "currLevel")));
		out.patchU16(tableAt + 10, Math.max(0, poolIndex(POOL, "Int32")));
		out.patchU32(tableAt + 12, levelAt - elementAt);
	}
	return out.bytes;
};

/** Builds the `PlayerDevelopmentData` object's body. */
const buildDevelopmentObject = (): readonly number[] => {
	const attributesData = new ByteList();
	attributesData.u32(2);
	for (const [tree, perks] of [
		["BodyAttributeData", [["Body_Central_Milestone_1", 1]]],
		[
			"ReflexesAttributeData",
			[
				["Reflexes_Central_Perk_1_1", 1],
				["Reflexes_Central_Perk_1_2", 1],
			],
		],
	] as const) {
		const elementAt = attributesData.length;
		attributesData.u16(2);
		const tableAt = attributesData.length;
		attributesData.skip(2 * 8);
		const typeAt = attributesData.length;
		attributesData.u16(Math.max(0, poolIndex(POOL, tree)));
		const perksAt = attributesData.length;
		attributesData.raw(buildUnlockedPerks(perks));
		attributesData.patchU16(tableAt, Math.max(0, poolIndex(POOL, "type")));
		attributesData.patchU16(
			tableAt + 2,
			Math.max(0, poolIndex(POOL, "gamedataAttributeDataType")),
		);
		attributesData.patchU32(tableAt + 4, typeAt - elementAt);
		attributesData.patchU16(
			tableAt + 8,
			Math.max(0, poolIndex(POOL, "unlockedPerks")),
		);
		attributesData.patchU16(
			tableAt + 10,
			Math.max(0, poolIndex(POOL, "CName")),
		);
		attributesData.patchU32(tableAt + 12, perksAt - elementAt);
	}

	const lifePath = new ByteList();
	lifePath.u16(Math.max(0, poolIndex(POOL, "Streetkid")));

	const traits = new ByteList();
	traits.u32(1);
	{
		const elementAt = traits.length;
		traits.u16(3);
		const tableAt = traits.length;
		traits.skip(3 * 8);
		const typeAt = traits.length;
		traits.u16(Math.max(0, poolIndex(POOL, "Streetkid")));
		const unlockedAt = traits.length;
		traits.u8(1);
		const levelAt = traits.length;
		traits.i32(1);
		// `currLevel`, not `currentLevel`: the reference implementation reads the
		// trait's level under this name, and a fixture that used the proficiency
		// spelling would pass against a codec that had the wrong one.
		const rows: readonly (readonly [string, string, number])[] = [
			["type", "gamedataTraitType", typeAt - elementAt],
			["unlocked", "Bool", unlockedAt - elementAt],
			["currLevel", "Int32", levelAt - elementAt],
		];
		for (const [position, [name, type, offset]] of rows.entries()) {
			const at = tableAt + position * 8;
			traits.patchU16(at, Math.max(0, poolIndex(POOL, name)));
			traits.patchU16(at + 2, Math.max(0, poolIndex(POOL, type)));
			traits.patchU32(at + 4, offset);
		}
	}

	return buildObject(
		[
			{
				name: "lifePath",
				type: "CName",
				data: [...lifePath.bytes],
			},
			{
				name: "devPoints",
				type: "CName",
				data: [
					...buildStructArray(
						[
							devPoint("Attribute", 3, 12),
							devPoint("Primary", 1, 8),
							devPoint("Secondary", 0, 2),
							devPoint("Espionage", 0, 0),
						],
						POOL,
					),
				],
			},
			{
				name: "attributes",
				type: "CName",
				data: [
					...buildStructArray(
						Object.entries(STARTING_ATTRIBUTES).map(([name, value]) =>
							attribute(name, value),
						),
						POOL,
					),
				],
			},
			{
				name: "proficiencies",
				type: "CName",
				data: [
					...buildStructArray(
						STARTING_SKILLS.map(([name, level, exp]) =>
							proficiency(name, level, exp),
						),
						POOL,
					),
				],
			},
			{
				name: "attributesData",
				type: "CName",
				data: [...attributesData.bytes],
			},
			{
				name: "perkAreas",
				type: "CName",
				// A 1.x save would have these; this fixture carries none, and the
				// codec must cope with an array of zero elements.
				data: [...new ByteList().u32(0).bytes],
			},
			{
				name: "traits",
				type: "CName",
				data: [...traits.bytes],
			},
		],
		POOL,
	);
};

/** The systems blob: the development object plus one the codec must ignore. */
const buildSystems = (): Bytes =>
	new Uint8Array(
		buildSystemsBlob(POOL, [
			{
				ctypename: "PlayerDevelopmentData",
				body: [...buildDevelopmentObject()],
			},
			{
				ctypename: "godModeSystem",
				// A subsystem this codec has no opinion about, carrying one field
				// whose bytes must survive a round trip untouched.
				body: [
					...buildObject(
						[{ name: "currLevel", type: "Int32", data: [1, 2, 3, 4] }],
						POOL,
					),
				],
			},
		]),
	);

/**
 * A complete synthetic save, shaped like a real one.
 *
 * The node list matches the top level the reference implementation searches: it
 * looks for `inventory`, `CharacetrCustomization_Appearances`, `FactsDB`,
 * `ScriptableSystemsContainer`, `godModeSystem`, `StatsSystem`,
 * `StatPoolsSystem` and `PSData` by name, so a fixture without them would not
 * exercise the lookup this codec depends on.
 */
export const buildFullSave = (): Bytes =>
	buildSave({
		nodes: [
			{
				name: "inventory",
				// A count of sub-inventories this codec does not parse. It must be
				// carried through untouched, which is the point of it being here.
				data: [1, 0, 0, 0, 42, 0, 0, 0, 0, 0, 0, 0],
			},
			{ name: "CharacetrCustomization_Appearances", data: [7, 0, 0, 0] },
			{ name: "FactsDB", data: [2, 0, 0, 0, 0, 0, 0, 0] },
			{
				name: "ScriptableSystemsContainer",
				data: [...buildSystems()],
			},
			{ name: "StatsSystem", data: [0] },
			{ name: "StatPoolsSystem", data: [0] },
			{ name: "PSData", data: [3, 1, 2, 3] },
		],
	});

/** A save with no `ScriptableSystemsContainer`, for the "unreadable" path. */
export const buildSaveWithoutDevelopment = (): Bytes =>
	buildSave({
		nodes: [
			{ name: "inventory", data: [1, 0, 0, 0] },
			{ name: "PSData", data: [3, 1, 2, 3] },
		],
	});
