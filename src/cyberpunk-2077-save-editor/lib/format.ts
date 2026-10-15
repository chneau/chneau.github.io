import {
	type Bytes,
	editId,
	type FormatNote,
	formatBytes,
	isJsonObject,
	type JsonValue,
	objectAt,
	type QuickAction,
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
import { readSystemsContainer } from "./systems";

const DEFAULT_PATH =
	"%LOCALAPPDATA%\\..\\..\\AppData\\Roaming\\CD Projekt Red\\Cyberpunk 2077\\";

const KEY_VERSION = "version";
const KEY_TREE = "tree";
const KEY_CHARACTER = "character";

const KEY_TREE_BYTES = "__nodeTree";

const POINT_ATTRIBUTES = "Attribute";
const POINT_PRIMARY = "Primary";
const POINT_SECONDARY = "Secondary";
const POINT_ESPIONAGE = "Espionage";

type CharacterSection = {
	readonly lifePath: string;
	readonly developmentPoints: ReadonlyMap<string, DevelopmentPoints>;
	readonly attributes: ReadonlyMap<string, number>;
	readonly skills: ReadonlyMap<string, { level: number; exp: number }>;
};

type DecodedParts = {
	readonly version: SaveVersion;
	readonly nodeCount: number;
	readonly topLevel: readonly string[];
	readonly bytes: number;
	readonly ps4w: boolean;
	readonly character: CharacterSection;
};

const isSaveNode = (value: unknown): value is SaveNode =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as Partial<SaveNode>).name === "string" &&
	(value as Partial<SaveNode>).data instanceof Uint8Array &&
	(value as Partial<SaveNode>).afterChildren instanceof Uint8Array &&
	Array.isArray((value as Partial<SaveNode>).children);

const buildTree = (source: SaveNode): SaveNode => {
	let next = 0;
	const build = (node: SaveNode, depth: number, index: number): SaveNode => {
		if (depth > 512) {
			throw new Error("This save's node tree is deeper than any real save.");
		}
		return {
			index,
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
		}
	}

	return {
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

	const character: { [key: string]: JsonValue } = {
		lifePath: development?.lifePath ?? "",
		developmentPoints: {},
		attributes: {},
		skills: {},
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

	Object.defineProperty(version, KEY_TREE_BYTES, {
		value: container.root,
		enumerable: false,
		writable: true,
		configurable: true,
	});

	return {
		[KEY_VERSION]: version,
		[KEY_TREE]: {
			nodes: nodes.length,
			names: container.root.children.map((child) => child.name),
			bytes: container.nodeData.length,
		},
		[KEY_CHARACTER]: character,
	};
};

const encode = async (doc: JsonValue): Promise<Bytes> => {
	const document = readDocument(doc);
	const remembered: unknown = (() => {
		const version = isJsonObject(doc) ? objectAt(doc, KEY_VERSION) : undefined;
		return version === undefined ? undefined : version[KEY_TREE_BYTES];
	})();
	if (remembered === undefined) {
		throw new Error(
			"This save cannot be rebuilt: this document has no node tree behind it. Open the save from the file again.",
		);
	}
	if (!isSaveNode(remembered)) {
		throw new Error(
			"This save cannot be rebuilt: the node tree behind this document is not readable.",
		);
	}

	const root = buildTree(remembered);
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

	return encodeContainer({
		version: document.version,
		root,
		nodeData: new Uint8Array(0),
		padSize: 0,
	});
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
	if (name === "StreetCred") return MAX_STREET_CRED;
	if (name === "Espionage") return 1;
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
		title: "What this page cannot do",
		body: "It will not touch anything it cannot name. Unlocking every perk needs the game's own perk tree, which lives in the TweakDB rather than the save; money is an inventory item whose layout changes across the container revisions this codec supports. The reference tool's cheat command delegated to a WolvenKit binary and its sync command to GOG Cloud — neither a page in a browser tab can or should do. Those are absent rather than stubbed. Everything else stays editable in the inspector.",
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
};
