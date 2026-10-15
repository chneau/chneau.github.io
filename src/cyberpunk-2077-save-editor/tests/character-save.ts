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

export const POOL: readonly string[] = [
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
	"BodyAttributeData",
	"CoolAttributeData",
	"EspionageAttributeData",
	"IntelligenceAttributeData",
	"ReflexesAttributeData",
	"TechnicalAbilityAttributeData",
	"gamedataNewPerkType",
	"Body_Central_Milestone_1",
	"Reflexes_Central_Perk_1_1",
	"Reflexes_Central_Perk_1_2",
	"PlayerDevelopmentData",
	"ScriptableSystemsContainer",
	"godModeSystem",
];

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

const attribute = (name: string, value: number): TestStruct => ({
	fields: [
		{ name: "type", type: "gamedataStatType", value: name },
		{ name: "attributeName", type: "gamedataStatType", value: name },
		{ name: "value", type: "Int32", value },
	],
});

const proficiency = (name: string, level: number, exp: number): TestStruct => ({
	fields: [
		{ name: "type", type: "gamedataProficiencyType", value: name },
		{ name: "currentLevel", type: "Int32", value: level },
		{ name: "currentExp", type: "Int32", value: exp },
	],
});

export const STARTING_POINTS = {
	Attribute: { unspent: 3, spent: 12 },
	Primary: { unspent: 1, spent: 8 },
	Secondary: { unspent: 0, spent: 2 },
	Espionage: { unspent: 0, spent: 0 },
} as const;

export const STARTING_ATTRIBUTES: Readonly<Record<string, number>> = {
	Strength: 6,
	Reflexes: 5,
	TechnicalAbility: 4,
	Intelligence: 7,
	Cool: 3,
};

export const STARTING_SKILLS: readonly (readonly [string, number, number])[] = [
	["Assault", 4, 120],
	["Athletics", 3, 80],
	["Stealth", 6, 200],
	["Kenjutsu", 2, 40],
	["StreetCred", 12, 900],
	["Level", 7, 340],
	["ColdBlood", 1, 25],
];

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

const buildSystems = (): Bytes =>
	new Uint8Array(
		buildSystemsBlob(POOL, [
			{
				ctypename: "PlayerDevelopmentData",
				body: [...buildDevelopmentObject()],
			},
			{
				ctypename: "godModeSystem",
				body: [
					...buildObject(
						[{ name: "currLevel", type: "Int32", data: [1, 2, 3, 4] }],
						POOL,
					),
				],
			},
		]),
	);

export const buildFullSave = (): Bytes =>
	buildSave({
		nodes: [
			{
				name: "inventory",
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

export const buildSaveWithoutDevelopment = (): Bytes =>
	buildSave({
		nodes: [
			{ name: "inventory", data: [1, 0, 0, 0] },
			{ name: "PSData", data: [3, 1, 2, 3] },
		],
	});
