/**
 * Cyberpunk 2077 `sav.dat` — the codec this app contributes to the workbench.
 *
 * ## What this file is responsible for
 *
 * The shared workbench knows how to read a document, stage edits against it,
 * re-encode, and prove the re-encode by decoding it again. It knows nothing
 * about VASC containers. This module supplies the game-specific half: turning a
 * `sav.dat` into the document the inspector walks, and turning that document
 * back into a file the game will load.
 *
 * ## The document shape, and why it carries the tree
 *
 * The document has three parts:
 *
 * 1. the **container header** and a **tree summary** — what the workbench's
 *    summary rows read;
 * 2. the **character** — attributes, skills, Street Cred and perk points,
 *    resolved from the game's own `PlayerDevelopmentData` object under its real
 *    field names, so both the summary and the quick actions can address them by
 *    name;
 * 3. the **tree** — the node tree and its bytes, carried verbatim.
 *
 * Part 3 is what makes this safe. A VASC save holds many subsystems, and this
 * codec can only name a few of them. Rather than reconstructing the whole file
 * from the fields it understands — which would silently delete everything else —
 * it carries the bytes and writes the character values *into* them at the
 * offsets they were read from. A subsystem this page cannot name is carried
 * through untouched, and an unedited save rebuilds to identical bytes.
 *
 * Writing a same-width scalar in place is what makes that possible: the blob
 * keeps its length, so no offset after it moves. Re-serialising a struct array
 * to change one number would move every offset after it and force the whole
 * save to be re-laid-out.
 *
 * ## What is not attempted
 *
 * The reference implementation this was ported from can push a modified save to
 * GOG Cloud, and can delegate its cheat command to a WolvenKit binary. Neither
 * is possible or wanted in a browser page: one needs credentials this page has
 * no business holding, the other needs a .NET runtime. Both are dropped rather
 * than stubbed, and nothing here refers to them.
 */
import {
	type Bytes,
	editId,
	type FormatNote,
	formatBytes,
	isJsonObject,
	type JsonValue,
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

/** The game's save directory, under GOG's Windows layout. */
const DEFAULT_PATH =
	"%LOCALAPPDATA%\\..\\..\\AppData\\Roaming\\CD Projekt Red\\Cyberpunk 2077\\";

/** Document keys, spelled out so a typo cannot pass silently. */
const KEY_VERSION = "version";
const KEY_TREE = "tree";
const KEY_CHARACTER = "character";

/**
 * The container's node names the reference implementation searches for.
 *
 * Spelled out because `findNode` looks the systems node up by name, and a typo
 * would produce an editor that silently finds nothing to edit.
 */

/** `gamedataDevelopmentPointType` members this codec writes. */
const POINT_ATTRIBUTES = "Attribute";
const POINT_PRIMARY = "Primary";
const POINT_SECONDARY = "Secondary";
const POINT_ESPIONAGE = "Espionage";

/** A character section as it appears in a document. */
type CharacterSection = {
	readonly lifePath: string;
	readonly developmentPoints: ReadonlyMap<string, DevelopmentPoints>;
	readonly attributes: ReadonlyMap<string, number>;
	readonly skills: ReadonlyMap<string, { level: number; exp: number }>;
};

/**
 * The node tree a decoded save was read from, keyed by that document.
 *
 * ## The shape of this problem, and what was tried
 *
 * The workbench's round-trip check decodes a rebuilt save and compares the
 * resulting *document* with the one that was encoded. So every field a document
 * exposes has to be a function of the save's bytes, or the check reports a
 * difference in a field nobody edited and calls the rebuild unsound.
 *
 * The node bytes are exactly such a field. `encode` writes the character values
 * into the tree it holds and serialises it, so decoding the result describes the
 * *patched* bytes while the document that was encoded still holds the *pre-patch*
 * ones. An ordinary `tree` field would therefore differ on every rebuild.
 *
 * Three alternatives fail, each for a reason worth keeping:
 *
 * - **Write the patched bytes back.** `encode` is handed the document as a value
 *   and cannot change what the caller holds.
 * - **Key a `WeakMap` by the document**, or attach the tree as a non-enumerable
 *   property *on the document*. Both keep it out of `JSON.stringify`, and both then
 *   fail: the workbench folds edits with `setAtPath`, which rebuilds the root with
 *   an object spread, and a spread copies only enumerable properties and produces a
 *   different object. The tree is gone by the time `encode` runs.
 *
 * What survives is that the bytes must ride through the spread, which means they
 * must be on a part of the document an edit cannot rebuild — and, being
 * non-enumerable, need not be compared.
 *
 * Hence: a non-enumerable property on the **version** section. `setAtPath` shares
 * every untouched branch by reference, and no character edit touches `version`, so
 * the tree survives every `withEdits` the workbench can produce; `JSON.stringify`
 * skips it, so the comparison sees only the readable projection — which is the part
 * a user can change and the part that has to round-trip.
 *
 * The cost is in the error `encode` raises: a document taken through `JSON.parse`,
 * or rebuilt by hand, has no tree behind it and is refused rather than silently
 * rebuilt from the half of the save this codec can name.
 */

/** The parts of a document this codec reads back on encode. */
type DecodedParts = {
	readonly version: SaveVersion;
	readonly nodeCount: number;
	readonly topLevel: readonly string[];
	readonly bytes: number;
	readonly ps4w: boolean;
	readonly character: CharacterSection;
};

/**
 * The object at `key`, or `undefined`.
 *
 * `isJsonObject` takes a `JsonValue`, and an indexed read of an object is
 * `JsonValue | undefined` under `noUncheckedIndexedAccess` — which is the honest
 * type, because the key may be absent. Narrowing it here once means every
 * read of this document says what it means, rather than each caller inventing a
 * cast or a truthiness test. A missing key and a non-object are the same thing
 * to a decoder: this document is not shaped the way this codec wrote it.
 */
const objectAt = (
	source: { readonly [key: string]: JsonValue },
	key: string,
): { readonly [key: string]: JsonValue } | undefined => {
	const value = source[key];
	return value !== undefined && isJsonObject(value) ? value : undefined;
};

/**
 * Builds a live node tree from a decoded one, renumbering as it goes.
 *
 * The links are filled in a second pass rather than during the walk, because a
 * node's `childIndex` is the index its *first child will take* — which is only
 * knowable once the walk has assigned it, and which the container's writer
 * recomputes anyway. `flatten` reads `children` for both links and the payload
 * order, so the fields it overwrites are already correct by then.
 *
 * Depth is bounded because a document can carry a tree deep enough to exhaust
 * the stack, and this runs on a document the user has edited.
 */
/**
 * Whether a value read off a document's hidden property is a node tree.
 *
 * The property is untyped because it is deliberately outside the document's
 * shape. This guard is what makes reading it safe instead of a cast: it checks
 * the fields `encode` actually uses, so a document that has been through
 * `JSON.parse` — or anything else that lost the property — is refused with a
 * message that says why rather than failing three frames later.
 */
const isSaveNode = (value: unknown): value is SaveNode =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as Partial<SaveNode>).name === "string" &&
	(value as Partial<SaveNode>).data instanceof Uint8Array &&
	(value as Partial<SaveNode>).afterChildren instanceof Uint8Array &&
	Array.isArray((value as Partial<SaveNode>).children);

const buildTree = (source: SaveNode): SaveNode => {
	// A copy, because `encode` patches it and the remembered tree must stay as
	// the file had it — a second encode of the same document has to start from the
	// same bytes, or the offsets a patch is aimed at would be the ones the last
	// edit already moved.
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
	// The container's root is the synthetic one, which the format describes by its
	// position rather than by a descriptor — so it takes a negative index and
	// consumes none of the numbering, and its children start at 0. Renumbering it
	// as node 0 would shift every node by one and write four bytes too many.
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

/** Narrows a decoded value to the parts of a document this codec reads. */
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
			// The chunk table's reserved size is header state, not payload. Carrying
			// it is what keeps a rebuild's table the same length as the file's, and
			// so keeps an untouched save byte-identical rather than merely valid.
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

/**
 * The player's development data out of a decoded container.
 *
 * Returns `undefined` when the container has no `ScriptableSystemsContainer`, or
 * when its blob cannot be parsed. Both are gaps in the projection rather than
 * broken saves, and swallowing them here — and only here — is what lets the rest
 * of the file be inspected and rebuilt untouched.
 */
const developmentOf = (
	container: DecodedContainer,
): Development | undefined => {
	const node = findNode(container.root, SCRIPTABLE_SYSTEMS_NODE);
	if (node === undefined) return undefined;
	try {
		const development = readDevelopment(readSystemsContainer(node.data));
		// An empty result means the container parsed but held no
		// `PlayerDevelopmentData` object, which is a real answer rather than a
		// failure — but it is not worth reporting as character data.
		return development.skills.size === 0 &&
			development.attributes.size === 0 &&
			development.developmentPoints.size === 0
			? undefined
			: development;
	} catch {
		return undefined;
	}
};

/**
 * Bytes to the document the workbench edits.
 *
 * Asynchronous because the container inflates its chunks and yields between them;
 * projecting the character data off the parsed tree is then a few hundred
 * microseconds, which is not worth interrupting.
 */
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
		// The header's unknown words are carried verbatim. What they mean is not
		// known, but the game writes them and a rebuild that dropped them would not
		// be byte-identical to the file it read — which is the strongest result this
		// codec can offer and the one the workbench reports as "unchanged".
		suk: container.version.suk,
		uk0: container.version.uk0,
		uk1: container.version.uk1,
		ps4w: container.version.ps4w,
		tableEntries: container.version.tableEntriesCount ?? 0,
	};

	// The node tree rides along here, invisibly. See the note above this section
	// for why it is on `version` specifically: it is the one branch of the document
	// that a character edit cannot rebuild, so `setAtPath` shares it by reference,
	// and it is non-enumerable so `JSON.stringify` never compares it.
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

/** The non-enumerable property on `version` carrying the node tree. */
const KEY_TREE_BYTES = "__nodeTree";

/**
 * The document back to bytes.
 *
 * Take the tree `decode` remembered for this document, write the character values
 * into the systems blob at the offsets they were read from, and re-serialise the
 * container. Everything the character section does not name is carried through
 * byte for byte, which is what makes a cheat on one attribute leave the quest
 * facts and the inventory alone.
 *
 * The tree is rebuilt rather than reused, because a patch writes into it and a
 * second `encode` of the same document has to start from the bytes the file
 * actually had. Reusing the patched tree would aim the second build's patches at
 * offsets an earlier edit had already moved.
 */
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
	// The property is written by `decode` above and by nothing else, so it is a
	// `SaveNode` — but it is untyped here, because it is deliberately not part of
	// the document's shape. This guard is what makes reading it safe rather than a
	// cast, and it is what turns "this document went through JSON.parse" into a
	// sentence a user can act on.
	if (!isSaveNode(remembered)) {
		throw new Error(
			"This save cannot be rebuilt: the node tree behind this document is not readable.",
		);
	}
	if (remembered === undefined) {
		throw new Error(
			"This save cannot be rebuilt: this document has no node tree behind it. Open the save from the file again.",
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
		// Written in place, into the tree that is about to be serialised. A patch
		// aimed at a copy would land in a temporary and be discarded — which is the
		// bug this line's comment exists to prevent.
		applyPatches(planPatches(readSystemsContainer(node.data), desired));
	}

	return encodeContainer({
		version: document.version,
		root,
		nodeData: new Uint8Array(0),
		padSize: 0,
	});
};

/** Header rows, which every save has whatever else it contains. */
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

/**
 * Character rows, from the document's character section.
 *
 * Only names the save actually holds are shown. A save with no readable
 * development data gets an explicit line saying so, because five rows of zeroes
 * would be indistinguishable from a level-1 character.
 */
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

/** An edit setting one path to one number. */
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

/**
 * The level a named proficiency should be set to.
 *
 * `undefined` means "leave it alone", which is what happens to `Level` and to
 * any proficiency this codec does not recognise — inventing a target for an
 * unrecognised name is how a cheat writes a value the game then rejects.
 *
 * The names come from the game's `gamedataProficiencyType` enum, transcribed in
 * the reference implementation and confirmed against the game's `CEnums`
 * catalogue: the five 2.0 skills are `<Attribute>Skill`, everything else listed
 * is a legacy 1.x proficiency, `StreetCred` and `Espionage` are handled apart.
 */
const targetSkillLevel = (name: string): number | undefined => {
	if (name === "StreetCred") return MAX_STREET_CRED;
	if (name === "Espionage") return 1;
	if (name.endsWith("Skill")) return MAX_SKILL;
	return PROFICIENCY_ORDER.includes(name) ? 20 : undefined;
};

/**
 * Quick actions, each a pure function of the document.
 *
 * `plan` never touches anything: it returns the edits a button would stage, so
 * a test can assert exactly what a cheat does and the workbench can show a
 * preview before anything changes. An action that does not apply to the loaded
 * save returns an empty list, which is how it greys itself out.
 *
 * ## Which cheats are here, and why
 *
 * Kept, each matching the reference implementation:
 *
 * - **Attributes to 20** — the five spendable attributes, capped at
 *   `MAX_ATTRIBUTE`. The two attributes the 2.0 tree retired are pinned to zero
 *   rather than raised, which is what the reference does and what keeps perk
 *   spending consistent.
 * - **Development points** — `Attribute` and `Primary` to the 720 cap,
 *   `Secondary` to 12, `Espionage` to 0. Spent points are left alone, so the
 *   total a character has earned does not change.
 * - **Skills and Street Cred** — the five 2.0 skills to 60, the legacy 1.x
 *   proficiencies to 20, Street Cred to 50, Espionage to 1. Character level is
 *   deliberately left alone, as the reference does.
 *
 * Dropped, with reasons:
 *
 * - **Unlock every perk** — needs the game's own perk tree, which lives in the
 *   TweakDB rather than in the save. The reference synthesises it from an 11 kB
 *   template of 2.0 perk names; writing those into a save without the matching
 *   game data would produce a character the game cannot reconcile.
 * - **Money** — `Items.money` is an inventory item whose quantity is an unsigned
 *   32-bit field inside a nested `itemData` node, reached through a
 *   version-dependent `ItemID` whose layout changes three times across the
 *   container revisions this codec supports. Writing it needs those layouts, and
 *   no committed save confirms them.
 * - **Character level** — a proficiency like the others here, and reachable in
 *   the inspector.
 */
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

/** Notes shown beside the drop target: what the format is, and what it is not. */
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

/**
 * This game's codec.
 *
 * `extensions` is `dat` alone. The file is named `sav.dat` by the game, and a
 * picker offering every `.dat` on the disk would be claiming to open things this
 * page cannot.
 */
export const cyberpunk2077: SaveCodec = {
	id: "cyberpunk-2077-save-editor",
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
