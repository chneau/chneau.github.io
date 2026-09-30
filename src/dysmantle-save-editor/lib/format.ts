/**
 * DYSMANTLE — `profile.save`.
 *
 * ## The container
 *
 * 10TONS's own engine format, and there is no encryption anywhere in it. A file
 * is a 12-byte header and a zlib stream; inflating that gives a
 * `10TONS_CONTAINER`, which is a flat sequence of named segments, each one
 * `SEGMENT\0`, a total length, a NUL-terminated name, a content length and the
 * content, closed by `SEGMENT_END\0` and the whole thing by `CONTAINER_END\0`.
 *
 * A real save holds **48** of them, counted: two at the top level — `xml`,
 * which is the profile, and `bin`, which is itself another whole container — and
 * 46 more inside `bin`. Those are the world: harvested materials, discovered
 * objects, per-stage state, the cartographer's map. This codec walks only the
 * top level and never looks inside `bin`, which is why the nesting costs it
 * nothing.
 *
 * Those 47 are the reason this codec is shaped the way it is. The shared
 * `SaveCodec` contract is `encode(document) -> bytes`, with no access to the file
 * the document came from, and there is no honest way to satisfy that here: the
 * world segments exist *only* in those bytes, and synthesising them would mean
 * inventing a world. So the container with the `xml` segment's content removed —
 * the **scaffold** — travels inside the document, base64-encoded, and `encode`
 * splices the new XML back into it.
 *
 * That is a real cost, paid on purpose. It puts a 39 kB opaque string at the top
 * of the inspector's tree, where a user could edit it into something that does
 * not inflate. The alternative was worse: a codec that quietly returned a save
 * with the world missing. And the failure is contained — the workbench re-inflates
 * the rebuilt file and compares the profile before offering it, so a damaged
 * scaffold is caught before a file is downloaded rather than after.
 *
 * ## zlib, and the fallback that is deliberately not here
 *
 * The upstream tool tries `inflateSync` and falls back to `inflateRawSync`,
 * which reads as though the container might hold either. It does not: the
 * payload begins `78 DA`, a zlib header with the maximum-compression flag set,
 * and measured against a real save `zlibInflate` succeeds where `rawInflate`
 * fails with "inflate failed". A fallback that cannot fire is not resilience,
 * it is a second path through the reader that never gets exercised and would be
 * the wrong half of the guess the day the format did change. So there is one
 * reader, and it is the one the file actually uses.
 *
 * ## What a rebuilt file is and is not
 *
 * The scaffold is byte-exact — all 47 world segments, nested container and all,
 * are copied untouched — and so is every container field other than the two
 * lengths, which are recomputed.
 *
 * The XML is rebuilt in the game's own layout, which `xml.ts` measures in
 * detail; the short version is that a save the game wrote rebuilds to identical
 * XML, and a save a third-party editor has appended to rebuilds to a
 * semantically identical one, differing only in the line breaks that editor
 * omitted.
 *
 * The compressed bytes will differ regardless, and not because of anything this
 * codec does: the game deflates at level 9, which the web platform's
 * `CompressionStream` gives no way to request, so a rebuild uses its default.
 * The header carries both lengths and both are rewritten, so the file is
 * self-consistent — but an untouched *real* save reports `semantic` rather than
 * `identical` in the round-trip check, and that is the truth about this format
 * rather than a defect to be papered over. (The suite's synthetic fixture, which
 * is deflated by this same platform, does come back `identical` — which is the
 * stronger claim, and the one that says the codec itself loses nothing.)
 */
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
	zlibDeflate,
	zlibInflate,
} from "../../shared";
import {
	ARRAY_ELEMENT,
	childGroups,
	findElement,
	NODE_ELEMENT,
	projectXml,
	unprojectXml,
} from "./xml";

/** The compressed stream starts here; two little-endian lengths precede it. */
const HEADER_BYTES = 12;

const CONTAINER_MAGIC = "10TONS_CONTAINER\0";
const SEGMENT_OPEN = "SEGMENT\0";
const SEGMENT_CLOSE = "SEGMENT_END\0";
const XML_SEGMENT = "xml";

/** The four bytes a `.save` file opens with, measured on a real save. */
const CONTAINER_FILE_MAGIC = "10tc";

/**
 * Where the container's non-profile bytes live inside the document.
 *
 * A `$`-prefixed key, because `$` cannot begin an XML attribute name, so no
 * element in the file can ever be projected onto it and it cannot be confused
 * with a field the game wrote.
 */
const SCAFFOLD_KEY = "$scaffold";

/** The key the profile itself sits under, beside the scaffold. */
const ROOT = "root";

/** The byte strings are NUL-terminated, so they are matched as raw bytes. */
const matchesAt = (bytes: Bytes, at: number, text: string): boolean => {
	if (at + text.length > bytes.length) return false;
	for (const [offset, character] of [...text].entries()) {
		if (bytes[at + offset] !== character.charCodeAt(0)) return false;
	}
	return true;
};

/** Latin-1 slice. The container is byte strings, not text. */
const latin1 = (bytes: Bytes, from: number, to: number): string => {
	let out = "";
	for (let at = from; at < to; at += 1) {
		out += String.fromCharCode(bytes[at] ?? 0);
	}
	return out;
};

/** Where one segment sits inside the inflated container. */
type Segment = {
	readonly name: string;
	/** Offset of the segment's total-length field. */
	readonly totalAt: number;
	/** Offset of the content-length field: the last four bytes before the content. */
	readonly lengthAt: number;
	readonly contentStart: number;
	readonly contentEnd: number;
};

/**
 * Walks the container's segment list.
 *
 * Strict about the framing and indifferent about the contents. An unexpected
 * trailer or a version field that does not match stops the walk, because the
 * bytes after them are still carried through verbatim and losing the walk would
 * mean losing them.
 */
const readSegments = (container: Bytes): readonly Segment[] => {
	if (!matchesAt(container, 0, CONTAINER_MAGIC)) {
		throw new Error(
			"This is not a DYSMANTLE save: its contents are not a 10TONS container.",
		);
	}
	// `10TONS_CONTAINER\0` + `VERSION\0` + u32 + `FILE_SIZE\0` + u32.
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

/**
 * The container with the profile segment's content removed.
 *
 * The two length fields in that segment's header are zeroed as well, and that is
 * what makes the scaffold a fixed point: they are the only bytes that move when
 * the profile's size moves, so removing the content and zeroing them leaves a
 * blob that is identical whichever profile it is rebuilt around. Verified on a
 * real save by decoding, rebuilding, and decoding the rebuild.
 */
const readScaffold = (container: Bytes, xml: Segment): Bytes => {
	const removed = xml.contentEnd - xml.contentStart;
	const scaffold = new Uint8Array(container.length - removed);
	scaffold.set(container.subarray(0, xml.contentStart), 0);
	scaffold.set(container.subarray(xml.contentEnd), xml.contentStart);
	writeU32(scaffold, xml.totalAt, 0);
	writeU32(scaffold, xml.lengthAt, 0);
	return scaffold;
};

/** Puts a profile back into a scaffold, restoring the two length fields. */
const writeProfile = (scaffold: Bytes, xml: Segment, content: Bytes): Bytes => {
	const out = new Uint8Array(scaffold.length + content.length);
	out.set(scaffold.subarray(0, xml.contentStart), 0);
	out.set(content, xml.contentStart);
	out.set(
		scaffold.subarray(xml.contentStart),
		xml.contentStart + content.length,
	);
	// The total covers the name field, the content-length field and the content,
	// which is what the game writes and what both segments of a real save show.
	writeU32(out, xml.totalAt, content.length + 8);
	writeU32(out, xml.lengthAt, content.length);
	return out;
};

/**
 * The profile as the game stores it: Latin-1 bytes, not UTF-8.
 *
 * The declaration says `iso-8859-1` and every byte of a real save's profile is
 * ASCII, so the two agree today. A character above U+00FF is written as `?`
 * rather than silently re-encoded as UTF-8, which would be two bytes where the
 * game expects one and would corrupt the segment it landed in.
 */
const encodeXml = (doc: JsonValue): Bytes => {
	let text = "";
	for (const character of unprojectXml(doc)) {
		const code = character.codePointAt(0) ?? 0;
		text += String.fromCharCode(code > 0xff ? 0x3f : code);
	}
	return new TextEncoder().encode(text);
};

/**
 * Reads a `.save` file into the shared model.
 *
 * The document is `{ $scaffold, root }`: the XML profile projected by `xml.ts`,
 * beside the container bytes needed to put it back. Both keys are named so the
 * inspector shows something recognisable at the top of the tree.
 */
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
		// Almost always a truncated or half-copied file, so it is named as such
		// rather than left as a bare "inflate failed".
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

/** Rebuilds a `.save` file from a document this codec produced. */
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

	// Four magic bytes, then the two lengths, then the stream. Both lengths are
	// the ones this rebuild actually produced and the game reads both. They are
	// little-endian, which is why the header is written here rather than
	// through the shared `ByteWriter` — that one is big-endian, for the Unreal
	// formats.
	const out = new Uint8Array(HEADER_BYTES + compressed.length);
	for (const [index, character] of [...CONTAINER_FILE_MAGIC].entries()) {
		out[index] = character.charCodeAt(0);
	}
	writeU32(out, 4, container.length);
	writeU32(out, 8, compressed.length);
	out.set(compressed, HEADER_BYTES);
	return out;
};

/* ------------------------------------------------------------------ *
 * Reading the projected document
 *
 * Every name below was read out of a real 1.4.1.12 save rather than taken
 * from the upstream tool, which is the difference between a summary that is
 * right and one that looks right. Where a name the upstream tool uses is
 * absent from that save — `COLLECTIBLES` — it is treated as absent rather
 * than asserted, and the action that would have used it is not shipped.
 * ------------------------------------------------------------------ */

/** The `<array id="…">` with this id, and the path that reaches it. */
const arrayById = (
	doc: JsonValue,
	id: string,
): { readonly path: SavePath; readonly value: JsonValue } | undefined =>
	findElement(profileOf(doc), ARRAY_ELEMENT, id, [ROOT]);

/**
 * The projected profile inside a document this codec produced.
 *
 * Narrowed rather than indexed blindly, so a caller handed something that is
 * not a document gets `undefined` from the lookups below instead of a crash —
 * and so `summarise` on a malformed document returns no rows rather than
 * throwing inside the workbench's render.
 */
const profileOf = (doc: JsonValue): JsonValue => {
	if (!isJsonObject(doc)) return null;
	return doc[ROOT] ?? null;
};

/** A `<node id="…">` inside a named array, and the path that reaches it. */
const nodeById = (
	doc: JsonValue,
	arrayId: string,
	nodeId: string,
): { readonly path: SavePath; readonly value: JsonValue } | undefined => {
	const array = arrayById(doc, arrayId);
	if (array === undefined) return undefined;
	return findElement(array.value, NODE_ELEMENT, nodeId, array.path);
};

/** Reads a string attribute off a node, if it has one. */
const attributeOf = (node: JsonValue, name: string): string | undefined => {
	if (!isJsonObject(node)) return undefined;
	const value = node[name];
	return typeof value === "string" ? value : undefined;
};

/**
 * Every `<node>` in a named array, as `[id, path, node]` — or `undefined` when
 * the save has no such array, which is different from an array with no children
 * and is reported differently.
 */
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

/**
 * A staged edit for one attribute, or nothing.
 *
 * Both guards are the shared editing contract rather than caution of our own.
 * `setAtPath` throws when a path does not resolve, and the workbench folds edits
 * in during a `useMemo`, so an action that threw would take the page down with
 * it. So an attribute the save does not have is not written, and a value already
 * correct is not restaged.
 *
 * The first is a real limitation, not a stylistic one. A save from before a
 * player crafted anything has recipes with no `crafted` attribute, and "unlock
 * everything" leaves it absent rather than inventing it — `setAtPath`'s own
 * comment says why, and this codec is built to agree with it.
 */
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
			id: `${JSON.stringify(target)}=${JSON.stringify(after)}`,
			label: target.join("."),
			path: target,
			before: typeof before === "string" ? before : null,
			after,
		},
	];
};

/** The same, for a node found by id inside a named array. */
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

/** The fill level the upstream tool uses, and the one a reader recognises. */
const FILL = "9999";

/**
 * Fills every material stack, marks every material found, and enlarges every
 * inventory page.
 *
 * `material_storage` and `material_storage_alltime` each hold one attribute per
 * material — 59 in a real save — and `materials` holds a `found_…` flag per
 * material. Only attributes the save already has are written: the material list
 * is the game's, and inventing attributes for materials this version does not
 * know is how a rebuilt file stops loading.
 */
const planFillMaterials = (doc: JsonValue): readonly SaveEdit[] => {
	const edits: SaveEdit[] = [];
	for (const storageId of ["material_storage", "material_storage_alltime"]) {
		const storage = nodeById(doc, "PLAYER_STATE", storageId);
		if (storage === undefined || !isJsonObject(storage.value)) continue;
		for (const name of Object.keys(storage.value)) {
			// `id` names the node rather than holding a stack.
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

/**
 * Raises the player level.
 *
 * Two nodes carry it — `experience_level` and `acknowledged_experience_level`,
 * both at 50 in a real save — and they are written together, because the game
 * treats the second as the level it has shown the player and raising one alone
 * leaves the save disagreeing with itself.
 */
const planMaxLevel = (doc: JsonValue): readonly SaveEdit[] => [
	...setOn(doc, "PLAYER_STATE", "experience_level", "value", "50"),
	...setOn(doc, "PLAYER_STATE", "acknowledged_experience_level", "value", "50"),
];

/**
 * Banks unspent skill points.
 *
 * `num_skills_to_pick` is what the game shows as available — 10 in a real save,
 * beside `num_skills_picked` at 89, which matches the 89 `SKILL_` recipes that
 * save has learned. Only the first is written, because the second is a record of
 * what has been spent.
 */
const planSkillPoints = (doc: JsonValue): readonly SaveEdit[] =>
	setOn(doc, "PLAYER_STATE", "num_skills_to_pick", "value", "20");

/**
 * Unlocks every skill and every recipe, and raises the upgradable ones to 9.
 *
 * Skills and recipes share one array — 417 children in a real save, 89 of them
 * `SKILL_…` — and both are unlocked with the same three attributes, so one pass
 * covers both. The ids are the save's own: this walks the array rather than
 * carrying a list of several hundred names, which is the difference between an
 * action that works on this version and one that half-works on the next.
 *
 * `level` is written only where a node already has one; 144 of the 328
 * non-skill recipes in a real save do, and the rest are not upgradable.
 */
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

/**
 * Unlocks every game feature.
 *
 * `FEATURES` is a flat array of eight `<node>`s in a real save —
 * `CAMPFIRE_FAST_TRAVEL`, `GATHERER`, `ANIMAL_FRIEND`, `ANIMAL_PETTING`,
 * `SCAVENGER`, `COOKING_POT`, `MAP`, `COOKING_STAND` — each with an `available`
 * flag and nothing else. So the action sets `available` on whatever the save
 * lists, which is right whether the game has seven features or nine.
 */
const planUnlockFeatures = (doc: JsonValue): readonly SaveEdit[] => {
	const edits: SaveEdit[] = [];
	for (const [, path, value] of nodesOf(doc, "FEATURES") ?? []) {
		edits.push(...setExisting(value, path, "available", "1"));
	}
	return edits;
};

/**
 * Makes every tracked item available and resets every use counter.
 *
 * `ITEMS` holds 176 `<node>`s in a real save, each an `items/….nut` path with an
 * `available` flag; `INVENTORY_0_ITEM_USES` holds the same 176 with a
 * `times_used` count. The game writes both lists, so this walks them rather than
 * deriving item paths from recipe names — the upstream tool's `getItemPath` is
 * 150 lines precisely because that derivation is unreliable, and a wrong path is
 * a node the game does not recognise.
 *
 * The upstream tool also unlocks lockpicks in a `COLLECTIBLES` array. There is
 * no such array in the save this codec was verified against, so nothing is
 * written there: inventing an array the game did not write is the failure this
 * codec exists to avoid.
 */
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

/**
 * The `items/tools/<name>.nut` path for a recipe id, or nothing when this codec
 * will not claim to know it.
 *
 * Restricted to the shape a real save confirms: a tool's item path is its recipe
 * id lower-cased with underscores turned into dashes, under `items/tools/`. All
 * 66 tool items in a real save follow it, and the save has a recipe for every one
 * of them. Anything else — a headgear, a special, a backpack — belongs in a
 * different subdirectory, and guessing there is how the upstream tool ended up
 * with a 150-line exception table. So this returns nothing rather than something
 * plausible, and the action still unlocks the recipe.
 */
const toolItemPath = (recipeId: string): string | undefined => {
	if (!/^[A-Z0-9_]+$/.test(recipeId)) return undefined;
	if (recipeId.startsWith("SKILL_")) return undefined;
	return `items/tools/${recipeId.toLowerCase().replace(/_/g, "-")}.nut`;
};

/**
 * Unlocks one weapon or tool.
 *
 * The upstream tool takes the name on the command line; a browser has no command
 * line, so the same logic is exposed per weapon from a list, and each button
 * greys itself out when this save has no such recipe — which is what returning
 * no edits means to the workbench. Three arrays are touched, all confirmed in a
 * real save: the recipe in `RECIPES` gets `unlocked`/`new`/`crafted`/`level`,
 * and the item in `ITEMS` and its counter in `INVENTORY_0_ITEM_USES` get
 * `available` and `times_used`.
 */
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

/**
 * Weapons offered as one-click actions.
 *
 * Each id is present in the `RECIPES` array of the save this codec was verified
 * against, and each resolves to an `items/tools/….nut` path that save also
 * contains, so none of these buttons is a guess and a save lacking one simply
 * greys it out.
 */
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

/**
 * Headline facts, every one read from a name a real save contains.
 *
 * A name this save does not have is left out rather than reported as a zero: a
 * save from another game version genuinely does not have it, and a zero would be
 * a claim about the player's progress that nobody measured. That applies to the
 * counts as much as to the scalars — "Recipes and skills: 0" on a save with no
 * `RECIPES` array is a statement about the game version, not about the player.
 */
const summarise = (doc: JsonValue): readonly SummaryRow[] => {
	const rows: SummaryRow[] = [];
	const scalar = (label: string, arrayId: string, nodeId: string): void => {
		const node = nodeById(doc, arrayId, nodeId);
		if (node === undefined) return;
		const value = attributeOf(node.value, "value");
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
		(node) => attributeOf(node, "id")?.startsWith("SKILL_") === true,
	);
	count(
		"Recipes still locked",
		"RECIPES",
		(node) => attributeOf(node, "unlocked") !== "1",
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
	id: "dysmantle-save-editor",
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
