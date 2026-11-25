import {
	type Bytes,
	editId,
	type FormatNote,
	formatBytes,
	isJsonObject,
	type JsonValue,
	objectAt,
	type QuickAction,
	type SaveCheat,
	type SaveCodec,
	type SaveEdit,
	type SummaryRow,
} from "../../shared";
import {
	type DecodedContainer,
	decodeContainer,
	encodeContainer,
	findNode,
	type SaveNode,
	type SaveVersion,
	walkNodes,
} from "./container";
import {
	applyPatches,
	type Development,
	type DevelopmentPoints,
	MAX_ATTRIBUTE,
	MAX_POINTS,
	MAX_SKILL,
	MAX_STREET_CRED,
	PROFICIENCY_ORDER,
	planPatches,
	RETIRED_ATTRIBUTES,
	readDevelopment,
	SCRIPTABLE_SYSTEMS_NODE,
	SPENDABLE_ATTRIBUTES,
} from "./development";
import {
	COMPONENT_STACKS,
	readComponents,
	readMoney,
	writeComponents,
	writeMoney,
} from "./items";
import {
	capacityBonusOf,
	capacityModifiers,
	carryCapacityBonus,
	setCapacityBonus,
	setCarryCapacity,
	setStatBonus,
	statBonus,
	statValues,
	writeStatValues,
} from "./stats";
import { STAT_TYPES } from "./stat-types";
import { readSystemsContainer } from "./systems";

const DEFAULT_PATH =
	"%LOCALAPPDATA%\\..\\..\\AppData\\Roaming\\CD Projekt Red\\Cyberpunk 2077\\";

const KEY_VERSION = "version";
const KEY_TREE = "tree";
const KEY_STATS = "stats";
const KEY_CHARACTER = "character";

const KEY_CONTAINER = "__container";

const POINT_ATTRIBUTES = "Attribute";
const POINT_PRIMARY = "Primary";
const POINT_SECONDARY = "Secondary";
const POINT_ESPIONAGE = "Espionage";
const POINT_LEVEL = "Level";
const POINT_STREET_CRED = "StreetCred";

const STATS_NODE = "StatsSystem";

const MAX_MONEY = 2_147_000_000;
const CAPACITY_BONUS = 100_000;
const COMPONENT_STACK = 9_999;
const CARRY_CAPACITY = 9_999;

type BonusStat = {
	readonly name: string;
	readonly label: string;
	readonly unit: string;
	readonly max: number;
};

const BONUS_STATS: readonly BonusStat[] = [
	{ name: "Health", label: "Bonus max health", unit: "HP", max: 100_000 },
	{ name: "Armor", label: "Bonus armor", unit: "armor", max: 100_000 },
	{ name: "Stamina", label: "Bonus max stamina", unit: "stamina", max: 100_000 },
	{ name: "Memory", label: "Cyberdeck RAM bonus", unit: "RAM", max: 500 },
	{ name: "MemoryRegenRateMult", label: "RAM regen multiplier", unit: "×", max: 1_000 },
	{ name: "MemoryCostReduction", label: "Quickhack RAM cost reduction", unit: "reduction", max: 1_000 },
	{ name: "MemoryCostModifier", label: "Quickhack RAM cost modifier", unit: "cost", max: 1_000 },
	{ name: "DeviceMemoryCostReductionMult", label: "Device hack RAM cost multiplier", unit: "×", max: 1_000 },
	{ name: "CritChance", label: "Bonus crit chance", unit: "%", max: 100 },
	{ name: "CritDamage", label: "Bonus crit damage", unit: "%", max: 1_000 },
	{ name: "MaxSpeed", label: "Bonus movement speed", unit: "m/s", max: 50 },
];

type CharacterSection = {
	readonly lifePath: string;
	readonly developmentPoints: ReadonlyMap<string, DevelopmentPoints>;
	readonly attributes: ReadonlyMap<string, number>;
	readonly skills: ReadonlyMap<string, { level: number; exp: number }>;
	readonly money: number | null;
	readonly cyberwareCapacityBonus: number | null;
	readonly inventoryCapacityBonus: number | null;
	readonly bonusStats: ReadonlyMap<string, number>;
	readonly components: ReadonlyMap<string, number>;
};

type DecodedParts = {
	readonly version: SaveVersion;
	readonly stats: readonly { readonly name: string; readonly value: number }[];
	readonly nodeCount: number;
	readonly topLevel: readonly string[];
	readonly bytes: number;
	readonly ps4w: boolean;
	readonly character: CharacterSection;
};

const isDecodedContainer = (value: unknown): value is DecodedContainer =>
	typeof value === "object" &&
	value !== null &&
	(value as Partial<DecodedContainer>).root !== undefined &&
	(value as Partial<DecodedContainer>).bytes instanceof Uint8Array &&
	(value as Partial<DecodedContainer>).nodeData instanceof Uint8Array &&
	Array.isArray((value as Partial<DecodedContainer>).chunks);

const buildTree = (source: SaveNode): SaveNode => {
	let next = 0;
	const build = (node: SaveNode, depth: number, index: number): SaveNode => {
		if (depth > 512) {
			throw new Error("This save's node tree is deeper than any real save.");
		}
		return {
			index,
			offset: node.offset,
			name: node.name,
			nextIndex: -1,
			childIndex: -1,
			data: new Uint8Array(node.data),
			afterChildren: new Uint8Array(node.afterChildren),
			children: node.children.map((child) => {
				const childIndex = next;
				next += 1;
				return build(child, depth + 1, childIndex);
			}),
		};
	};
	const root = build(source, 0, -2);
	for (const node of walkNodes(root)) {
		const first = node.children[0];
		if (first !== undefined) node.childIndex = first.index;
		for (const [position, child] of node.children.entries()) {
			const following = node.children[position + 1];
			child.nextIndex = following === undefined ? -1 : following.index;
		}
	}
	return root;
};

const readDocument = (doc: JsonValue): DecodedParts => {
	if (!isJsonObject(doc)) {
		throw new Error("This file decoded, but it is not a Cyberpunk 2077 save.");
	}
	const version = objectAt(doc, KEY_VERSION);
	const character = objectAt(doc, KEY_CHARACTER);
	const tree = objectAt(doc, KEY_TREE);
	if (version === undefined || character === undefined) {
		throw new Error(
			"This document is not a Cyberpunk 2077 save: it has no player development data.",
		);
	}

	const number = (value: JsonValue | undefined): number =>
		typeof value === "number" ? value : 0;
	const pointsAt = (value: JsonValue | undefined): DevelopmentPoints => {
		const source =
			value === undefined ? undefined : objectAt({ v: value }, "v");
		return {
			unspent: number(source?.unspent),
			spent: number(source?.spent),
		};
	};
	const skillAt = (
		value: JsonValue | undefined,
	): { level: number; exp: number } => {
		const source =
			value === undefined ? undefined : objectAt({ v: value }, "v");
		return { level: number(source?.level), exp: number(source?.exp) };
	};

	const developmentPoints = new Map<string, DevelopmentPoints>();
	const attributes = new Map<string, number>();
	const skills = new Map<string, { level: number; exp: number }>();
	const components = new Map<string, number>();
	const bonusStats = new Map<string, number>();
	for (const [key, value] of Object.entries(character)) {
		if (key === "developmentPoints" && isJsonObject(value)) {
			for (const [name, entry] of Object.entries(value)) {
				developmentPoints.set(name, pointsAt(entry));
			}
		} else if (key === "attributes" && isJsonObject(value)) {
			for (const [name, entry] of Object.entries(value)) {
				attributes.set(name, number(entry));
			}
		} else if (key === "skills" && isJsonObject(value)) {
			for (const [name, entry] of Object.entries(value)) {
				skills.set(name, skillAt(entry));
			}
		} else if (key === "components" && isJsonObject(value)) {
			for (const [name, entry] of Object.entries(value)) {
				if (typeof entry === "number") components.set(name, entry);
			}
		} else if (key === "bonusStats" && isJsonObject(value)) {
			for (const [name, entry] of Object.entries(value)) {
				if (typeof entry === "number") bonusStats.set(name, entry);
			}
		}
	}

	const stats: { name: string; value: number }[] = [];
	const statsSource = isJsonObject(doc) ? doc[KEY_STATS] : undefined;
	if (Array.isArray(statsSource)) {
		for (const row of statsSource) {
			if (!isJsonObject(row)) continue;
			const rowName = row.name;
			const rowValue = row.value;
			if (typeof rowName === "string" && typeof rowValue === "number") {
				stats.push({ name: rowName, value: rowValue });
			}
		}
	}

	return {
		stats,
		version: {
			v1: number(version.v1),
			v2: number(version.v2),
			v3: number(version.v3),
			suk: typeof version.suk === "string" ? version.suk : "",
			uk0: number(version.uk0),
			uk1: number(version.uk1),
			ps4w: version.ps4w === true,
			tableEntriesCount: number(version.tableEntries) || undefined,
		},
		nodeCount: number(tree?.nodes),
		topLevel: Array.isArray(tree?.names)
			? (tree?.names ?? []).filter(
					(name): name is string => typeof name === "string",
				)
			: [],
		bytes: number(tree?.bytes),
		ps4w: version.ps4w === true,
		character: {
			lifePath:
				typeof character.lifePath === "string" ? character.lifePath : "",
			developmentPoints,
			attributes,
			skills,
			money: typeof character.money === "number" ? character.money : null,
			cyberwareCapacityBonus:
				typeof character.cyberwareCapacityBonus === "number"
					? character.cyberwareCapacityBonus
					: null,
			inventoryCapacityBonus:
				typeof character.inventoryCapacityBonus === "number"
					? character.inventoryCapacityBonus
					: null,
			bonusStats,
			components,
		},
	};
};

const developmentOf = (
	container: DecodedContainer,
): Development | undefined => {
	const node = findNode(container.root, SCRIPTABLE_SYSTEMS_NODE);
	if (node === undefined) return undefined;
	try {
		const development = readDevelopment(readSystemsContainer(node.data));
		return development.skills.size === 0 &&
			development.attributes.size === 0 &&
			development.developmentPoints.size === 0
			? undefined
			: development;
	} catch {
		return undefined;
	}
};

const decode = async (bytes: Bytes): Promise<JsonValue> => {
	const container = await decodeContainer(bytes);
	const development = developmentOf(container);
	const nodes = walkNodes(container.root);

	const statsBytes =
		findNode(container.root, STATS_NODE)?.data ?? new Uint8Array(0);
	const statValuesOf = statValues(statsBytes, STAT_TYPES);
	const character: { [key: string]: JsonValue } = {
		lifePath: development?.lifePath ?? "",
		developmentPoints: {},
		attributes: {},
		skills: {},
		components: Object.fromEntries(readComponents(container.root)),
		money: readMoney(container.root),
		cyberwareCapacityBonus: capacityBonusOf(capacityModifiers(statsBytes)),
		inventoryCapacityBonus: carryCapacityBonus(statsBytes),
		bonusStats: Object.fromEntries(
			BONUS_STATS.map((stat) => [stat.name, statBonus(statsBytes, stat.name) ?? 0]),
		),
	};
	if (development !== undefined) {
		character.developmentPoints = Object.fromEntries(
			development.developmentPoints,
		);
		character.attributes = Object.fromEntries(development.attributes);
		character.skills = Object.fromEntries(development.skills);
	}

	const version: { [key: string]: JsonValue } = {
		v1: container.version.v1,
		v2: container.version.v2,
		v3: container.version.v3,
		suk: container.version.suk,
		uk0: container.version.uk0,
		uk1: container.version.uk1,
		ps4w: container.version.ps4w,
		tableEntries: container.version.tableEntriesCount ?? 0,
	};

	Object.defineProperty(version, KEY_CONTAINER, {
		value: container,
		enumerable: false,
		writable: true,
		configurable: true,
	});

	const tree: { [key: string]: JsonValue } = {
		names: container.root.children.map((child) => child.name),
	};
	Object.defineProperties(tree, {
		nodes: { value: nodes.length, enumerable: false },
		bytes: { value: container.nodeData.length, enumerable: false },
	});

	return {
		[KEY_VERSION]: version,
		[KEY_TREE]: tree,
		[KEY_CHARACTER]: character,
		[KEY_STATS]: STAT_TYPES.map((name, index) => ({
			name,
			value: statValuesOf[index] ?? 0,
		})),
	};
};

const encode = async (doc: JsonValue): Promise<Bytes> => {
	const document = readDocument(doc);
	const remembered: unknown = (() => {
		const version = isJsonObject(doc) ? objectAt(doc, KEY_VERSION) : undefined;
		return version === undefined ? undefined : version[KEY_CONTAINER];
	})();
	if (!isDecodedContainer(remembered)) {
		throw new Error(
			"This save cannot be rebuilt: this document has no container behind it. Open the save from the file again.",
		);
	}

	const root = buildTree(remembered.root);
	const node = findNode(root, SCRIPTABLE_SYSTEMS_NODE);
	if (node !== undefined) {
		const desired: Development = {
			...document.character,
			perkTrees: [],
			legacyPerks: [],
			traits: [],
		};
		applyPatches(planPatches(readSystemsContainer(node.data), desired));
	}

	const { money, cyberwareCapacityBonus, inventoryCapacityBonus, components } =
		document.character;
	if (money !== null) writeMoney(root, money);
	writeComponents(root, components);
	const stats = findNode(root, STATS_NODE);
	if (stats !== undefined) {
		if (cyberwareCapacityBonus !== null) {
			setCapacityBonus(stats.data, cyberwareCapacityBonus);
		}
		if (inventoryCapacityBonus !== null) {
			setCarryCapacity(stats.data, inventoryCapacityBonus);
		}
		for (const [name, value] of document.character.bonusStats) {
			setStatBonus(stats.data, name, value);
		}
		writeStatValues(stats.data, document.stats);
	}

	return encodeContainer({ ...remembered, root });
};

const summariseHeader = (document: DecodedParts): readonly SummaryRow[] => [
	{
		label: "Container format",
		value: `v${document.version.v1} (game build ${document.version.v2})`,
	},
	{ label: "Nodes in the tree", value: String(document.nodeCount) },
	{
		label: "Chunks",
		value: document.ps4w ? "stored uncompressed" : "LZ4-compressed",
	},
	{ label: "Node data", value: formatBytes(document.bytes) },
	{ label: "Top-level nodes", value: String(document.topLevel.length) },
];

const summariseCharacter = (document: DecodedParts): readonly SummaryRow[] => {
	const { character } = document;
	const rows: SummaryRow[] = [];

	if (character.attributes.size === 0 && character.skills.size === 0) {
		return [
			{
				label: "Player development data",
				value: "not readable in this save",
				emphasis: true,
			},
		];
	}

	if (character.lifePath !== "") {
		rows.push({ label: "Life path", value: character.lifePath });
	}
	const perkPoints = character.developmentPoints.get(POINT_ATTRIBUTES);
	if (perkPoints !== undefined) {
		rows.push({
			label: "Perk points",
			value: `${perkPoints.unspent} unspent, ${perkPoints.spent} spent`,
		});
	}
	const attributePoints = character.developmentPoints.get(POINT_PRIMARY);
	if (attributePoints !== undefined) {
		rows.push({
			label: "Attribute points",
			value: `${attributePoints.unspent} unspent, ${attributePoints.spent} spent`,
		});
	}

	const attributes = [...character.attributes];
	rows.push({
		label: "Attributes",
		value:
			attributes.length === 0
				? "none recorded"
				: attributes.map(([name, value]) => `${name} ${value}`).join(", "),
	});

	const streetCred = character.skills.get("StreetCred");
	if (streetCred !== undefined) {
		rows.push({
			label: "Street Cred",
			value: `${streetCred.level} (${streetCred.exp} progress)`,
		});
	}
	const skills = [...character.skills].filter(
		([name]) => name !== "Level" && name !== "StreetCred",
	);
	rows.push({
		label: "Skills",
		value:
			skills.length === 0
				? "none recorded"
				: skills.map(([name, value]) => `${name} ${value.level}`).join(", "),
	});
	const level = character.skills.get("Level");
	if (level !== undefined) {
		rows.push({ label: "Character level", value: String(level.level) });
	}
	if (character.money !== null) {
		rows.push({
			label: "Money",
			value: character.money.toLocaleString("en-GB"),
		});
	}
	if (character.cyberwareCapacityBonus !== null) {
		rows.push({
			label: "Cyberware capacity bonus",
			value: `+${character.cyberwareCapacityBonus.toLocaleString("en-GB")}`,
		});
	}
	const bonuses = BONUS_STATS.filter(
		(stat) => (character.bonusStats.get(stat.name) ?? 0) !== 0,
	).map((stat) => `${stat.label.replace("Bonus ", "")} +${character.bonusStats.get(stat.name)}`);
	if (bonuses.length > 0) {
		rows.push({ label: "Bonus stats", value: bonuses.join(", ") });
	}
	if (character.inventoryCapacityBonus !== null) {
		rows.push({
			label: "Inventory capacity bonus",
			value: `+${character.inventoryCapacityBonus.toLocaleString("en-GB")}`,
		});
	}
	for (const [family, label] of [
		["item", "Item components"],
		["upgrade", "Upgrade components"],
		["quickhack", "Quickhack components"],
	] as const) {
		const values = COMPONENT_STACKS.filter(
			(stack) => stack.family === family,
		).map((stack) => character.components.get(stack.label) ?? 0);
		if (values.length === 0) continue;
		rows.push({ label, value: values.join(" / ") });
	}
	return rows;
};

const numberEdit = (
	path: readonly (string | number)[],
	label: string,
	before: JsonValue,
	after: number,
): SaveEdit => ({
	id: editId(path, after),
	label,
	path,
	before,
	after,
});

const targetSkillLevel = (name: string): number | undefined => {
	if (name === POINT_LEVEL) return 60;
	if (name === POINT_STREET_CRED) return MAX_STREET_CRED;
	if (name === POINT_ESPIONAGE) return 1;
	if (name.endsWith("Skill")) return MAX_SKILL;
	return PROFICIENCY_ORDER.includes(name) ? 20 : undefined;
};

const ACTIONS: readonly QuickAction[] = [
	{
		id: "attributes-20",
		label: "Max attributes (20)",
		description:
			"Set Body, Reflexes, Technical Ability, Intelligence and Cool to 20. The two attributes the 2.0 perk tree retired are set to 0, because raising one the game no longer spends desynchronises the character's perks.",
		plan: (doc) => {
			const { character } = readDocument(doc);
			const edits: SaveEdit[] = [];
			for (const name of SPENDABLE_ATTRIBUTES) {
				const current = character.attributes.get(name);
				if (current === undefined || current === MAX_ATTRIBUTE) continue;
				edits.push(
					numberEdit(
						[KEY_CHARACTER, "attributes", name],
						`${name} → ${MAX_ATTRIBUTE}`,
						current,
						MAX_ATTRIBUTE,
					),
				);
			}
			for (const name of RETIRED_ATTRIBUTES) {
				const current = character.attributes.get(name);
				if (current === undefined || current === 0) continue;
				edits.push(
					numberEdit(
						[KEY_CHARACTER, "attributes", name],
						`${name} → 0`,
						current,
						0,
					),
				);
			}
			return edits;
		},
	},
	{
		id: "points",
		label: "Refill perk and attribute points",
		description:
			"Set unspent Attribute and Primary points to the game's cap of 720, Secondary to 12 and Espionage to 0. Spent points are left exactly as they are.",
		plan: (doc) => {
			const { character } = readDocument(doc);
			const wanted: readonly (readonly [string, number])[] = [
				[POINT_ATTRIBUTES, MAX_POINTS],
				[POINT_PRIMARY, MAX_POINTS],
				[POINT_SECONDARY, 12],
				[POINT_ESPIONAGE, 0],
			];
			const edits: SaveEdit[] = [];
			for (const [name, value] of wanted) {
				const current = character.developmentPoints.get(name);
				if (current === undefined || current.unspent === value) continue;
				edits.push(
					numberEdit(
						[KEY_CHARACTER, "developmentPoints", name, "unspent"],
						`${name} points → ${value}`,
						current.unspent,
						value,
					),
				);
			}
			return edits;
		},
	},
	{
		id: "skills",
		label: "Max skills (60) and Street Cred (50)",
		description:
			"Set the five 2.0 skills to level 60, the legacy 1.x proficiencies to 20, Street Cred to 50 and Espionage to 1. Character level is left alone: it is a proficiency like the rest, and the inspector edits it.",
		plan: (doc) => {
			const { character } = readDocument(doc);
			const edits: SaveEdit[] = [];
			for (const [name, skill] of character.skills) {
				if (name === "Level") continue;
				const target = targetSkillLevel(name);
				if (target === undefined || skill.level === target) continue;
				edits.push({
					id: editId([KEY_CHARACTER, "skills", name], {
						level: target,
						exp: skill.exp,
					}),
					label: `${name} → ${target}`,
					path: [KEY_CHARACTER, "skills", name],
					before: { level: skill.level, exp: skill.exp },
					after: { level: target, exp: skill.exp },
				});
			}
			return edits;
		},
	},
	{
		id: "money",
		label: "Money to 2 billion",
		description:
			"Set the wallet to 2,000,000,000 eddies. The game stores money as a signed 32-bit integer, so 2,147,483,647 is its ceiling; 99 billion cannot be represented and would wrap negative. The stash is a separate record and is left alone.",
		plan: (doc) => {
			const { character } = readDocument(doc);
			if (character.money === null || character.money === MAX_MONEY) return [];
			return [
				numberEdit(
					[KEY_CHARACTER, "money"],
					`money → ${MAX_MONEY}`,
					character.money,
					MAX_MONEY,
				),
			];
		},
	},
	{
		id: "cyberware-capacity",
		label: "Cyberware capacity +100,000",
		description:
			"Set the extra capacity the save adds on top of what the game computes from level, Technical Ability, perks and capacity shards. It is the same additive Humanity modifier a capacity shard writes, so it shows up as a larger bar at the ripperdoc.",
		plan: (doc) => {
			const { character } = readDocument(doc);
			if (
				character.cyberwareCapacityBonus === null ||
				character.cyberwareCapacityBonus === CAPACITY_BONUS
			) {
				return [];
			}
			return [
				numberEdit(
					[KEY_CHARACTER, "cyberwareCapacityBonus"],
					`extra capacity → ${CAPACITY_BONUS}`,
					character.cyberwareCapacityBonus,
					CAPACITY_BONUS,
				),
			];
		},
	},
	{
		id: "inventory-capacity",
		label: "Inventory capacity +9,999",
		description:
			"Repurpose one spare Humanity modifier into an additive CarryCapacity one, so the weight bar at the top of the backpack grows by 9,999 on top of what Body and its perks already grant.",
		plan: (doc) => {
			const { character } = readDocument(doc);
			if (character.inventoryCapacityBonus === CARRY_CAPACITY) return [];
			return [
				numberEdit(
					[KEY_CHARACTER, "inventoryCapacityBonus"],
					`inventory capacity → ${CARRY_CAPACITY}`,
					character.inventoryCapacityBonus,
					CARRY_CAPACITY,
				),
			];
		},
	},
	{
		id: "components",
		label: "9,999 of every component",
		description:
			"Stock every tier of Item, Upgrade and Quickhack Components this save carries to 9,999. Stacks the save does not carry are left alone: adding a stack means adding a node, and a rebuilt node table is what the game rejects as damaged data.",
		plan: (doc) => {
			const { character } = readDocument(doc);
			const edits: SaveEdit[] = [];
			for (const [label, current] of character.components) {
				if (current === COMPONENT_STACK) continue;
				edits.push(
					numberEdit(
						[KEY_CHARACTER, "components", label],
						`${label} → ${COMPONENT_STACK}`,
						current,
						COMPONENT_STACK,
					),
				);
			}
			return edits;
		},
	},
];

const attributeCheats: readonly SaveCheat[] = SPENDABLE_ATTRIBUTES.map(
	(name) => ({
		id: `attribute-${name}`,
		label: name,
		description: `The ${name} attribute, in the same field the perk tree reads. The game caps it at ${MAX_ATTRIBUTE}.`,
		group: "Attributes",
		path: [KEY_CHARACTER, "attributes", name],
		min: 0,
		max: MAX_ATTRIBUTE,
	}),
);

const skillCheats: readonly SaveCheat[] = PROFICIENCY_ORDER.flatMap((name) => {
	const max = targetSkillLevel(name);
	if (max === undefined) return [];
	return [
		{
			id: `skill-${name}`,
			label: name,
			description: `The ${name} proficiency level. The game caps this one at ${max}.`,
			group: "Skills",
			path: [KEY_CHARACTER, "skills", name, "level"],
			min: 0,
			max,
		},
	];
});

const pointCheats: readonly SaveCheat[] = [
	{
		id: "points-attribute",
		label: "Perk points",
		description:
			"Unspent perk points. Spending them in the game is the only way to unlock a perk; this cannot pick the perk for you.",
		group: "Points",
		path: [KEY_CHARACTER, "developmentPoints", POINT_ATTRIBUTES, "unspent"],
		min: 0,
		max: MAX_POINTS,
	},
	{
		id: "points-primary",
		label: "Attribute points",
		description:
			"Unspent attribute points, capped by the game at the same 720 the refill action uses.",
		group: "Points",
		path: [KEY_CHARACTER, "developmentPoints", POINT_PRIMARY, "unspent"],
		min: 0,
		max: MAX_POINTS,
	},
	{
		id: "points-secondary",
		label: "Secondary points",
		description:
			"The secondary point pool the 2.0 tree spends on the two attributes it retired.",
		group: "Points",
		path: [KEY_CHARACTER, "developmentPoints", POINT_SECONDARY, "unspent"],
		min: 0,
		max: 12,
	},
];

const componentCheats: readonly SaveCheat[] = COMPONENT_STACKS.map((stack) => ({
	id: `component-${stack.family}-${stack.tier}`,
	label: stack.label,
	description: `How many ${stack.label.toLowerCase()} the save carries. Ripperdocs spend item, upgrade and quickhack components to improve gear; a family this save does not carry is left alone.`,
	group: "Components",
	path: [KEY_CHARACTER, "components", stack.label],
	min: 0,
	max: 2_147_483_647,
}));

const CHEATS: readonly SaveCheat[] = [
	{
		id: "money",
		label: "Money",
		description:
			"The wallet balance, a signed 32-bit integer, so 2,147,483,647 is the ceiling and anything above it wraps negative.",
		group: "Wallet",
		path: [KEY_CHARACTER, "money"],
		min: 0,
		max: MAX_MONEY,
	},
	{
		id: "cyberware-capacity",
		label: "Cyberware capacity bonus",
		description:
			"Extra capacity added on top of what the game computes from level, Technical Ability, perks and capacity shards.",
		group: "Cyberware",
		path: [KEY_CHARACTER, "cyberwareCapacityBonus"],
		min: 0,
	},
	...BONUS_STATS.map(
		(stat): SaveCheat => ({
			id: `bonus-${stat.name}`,
			label: stat.label,
			description: `An additive bonus on top of the ${stat.unit} the game computes from gear, attributes and perks. A save with no spare stat modifier cannot take one.`,
			group: "Bonus stats",
			path: [KEY_CHARACTER, "bonusStats", stat.name],
			min: 0,
			max: stat.max,
		}),
	),
	{
		id: "inventory-capacity",
		label: "Inventory capacity bonus",
		description:
			"Extra carry weight added on top of what Body and its perks grant, written into the same modifier the carrying capacity shard uses.",
		group: "Cyberware",
		path: [KEY_CHARACTER, "inventoryCapacityBonus"],
		min: 0,
	},
	...attributeCheats,
	...skillCheats,
	...pointCheats,
	...componentCheats,
];

const NOTES: readonly FormatNote[] = [
	{
		title: "A VASC container around an object tree",
		body: "A save.dat opens with a VASC (also seen as CSAV) tag and three version numbers, then keeps its payload in compressed chunks. The chunk table sits between the header and the chunks, so the regions have to be found by seeking rather than by reading forwards, and the last eight bytes of the file are the node table's offset and a DONE tag.",
	},
	{
		title: "The chunks are LZ4 blocks, not a compressed stream",
		body: "Each chunk is an XLZ4 tag, its uncompressed size, and a raw LZ4 block. A block carries no header, no checksum and no size of its own — which is why the size it inflates to comes from the chunk table, and why the block codec is written out here rather than delegated to the browser: DecompressionStream understands deflate, deflate-raw and gzip, and none of those is LZ4.",
	},
	{
		title: "Inside is a REDengine 4 node tree",
		body: "Inflating the chunks gives one byte stream. Each node descriptor names a range of it, and every node's payload starts with its own index — a redundancy the reader checks and this codec enforces on the way out, so a save reassembled in the wrong order is refused rather than misread. Gaps between a node's own data and its children are real payload, and they are carried through untouched.",
	},
	{
		title: "Names are indices into a string pool",
		body: "Every field name, type name and enum value inside the systems container is a 16-bit index into a per-system string pool. The readable character data on this page — attributes, skills, Street Cred, perk points — comes out of the game's own PlayerDevelopmentData object under its real field names, and the enum orders used to identify elements positionally are transcribed from the game's CEnums catalogue rather than guessed.",
	},
	{
		title: "Items are identified by a TweakDBID",
		body: 'An inventory stack is a short record that opens with its item id: the name\'s length in the high 32 bits and its CRC-32 in the low 32, so "Items.money" is 0x0000000bf5e188ec. Its quantity is a signed 32-bit integer 21 bytes in, which is why money tops out at 2,147,483,647 rather than the billions a decimal wallet would allow. The wallet is the money stack the game does not use as its 10,000-eddie sentinel.',
	},
	{
		title: "Cyberware capacity is an additive stat modifier",
		body: "The capacity bar is computed on load from level, Technical Ability, perks and capacity shards; each shard is a constant additive modifier on the Humanity stat, serialised as the class name, the stat's 64-bit FNV-1a hash and a float value. Raising the bar means rewriting those floats, which this page does in place. A save that carries no such modifier cannot gain one here: growing the stats buffer would move every slice after it.",
	},
	{
		title: "What this page cannot do",
		body: "It will not touch anything it cannot name. Unlocking every perk needs the game's own perk tree, which lives in the TweakDB rather than the save. The reference tool's sync command went to GOG Cloud, which a page in a browser tab can or should not do. Those are absent rather than stubbed. Everything else stays editable in the inspector.",
	},
];

export const cyberpunk2077: SaveCodec = {
	game: "Cyberpunk 2077",
	formatLabel: "VASC container, LZ4 chunks, REDengine 4 nodes",
	extensions: ["dat"],
	defaultPath: DEFAULT_PATH,
	notes: NOTES,
	decode,
	encode,
	summarise: (doc) => {
		const document = readDocument(doc);
		return [...summariseHeader(document), ...summariseCharacter(document)];
	},
	actions: ACTIONS,
	cheats: CHEATS,
	tables: [
		{
			id: "stats",
			label: "Stats",
			path: [KEY_STATS],
			emptyMessage: "This save exposes no stat modifiers.",
			columns: [
				{ label: "Stat", path: ["name"], readOnly: true, width: "320px" },
				{ label: "Value", path: ["value"] },
			],
		},
	],
};
