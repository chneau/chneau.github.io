/**
 * Collected knowledge, unlock flags and map-pin discovery — the read-only
 * progression state that is neither a stat nor an inventory item.
 *
 * ## What is in here and why it is one module
 *
 * Three separate places in the save hold "the player has learned X" flags, and
 * they are shaped differently enough that one grammar cannot read all three:
 *
 *  - **The player's own lists** (`booksRead`, `craftingSchematics`,
 *    `alchemyRecipes`, `unlockedAppearances`, the three `expanded*Categories`)
 *    are class-reflection arrays on the player entity: `u32 count` followed by
 *    `count × 2-byte CName`. They reach `./reflect` and are read as ordinary
 *    arrays.
 *  - **The map manager's lists** (`KnownMapPinTags`, `DiscoveredMapPinTags`,
 *    `DisabledMapPinTags`, `DiscoveredAgentEntityTags`, `DiscoveredPaths`) are
 *    *not* class-reflection values. `CCommonMapManager` is an engine-native
 *    object written as a flat run of `BS`/`VL` tokens with no presence byte, no
 *    class header and no struct framing, so each list is
 *    `BS <name>` + `VL Size : Uint32` + `Size × VL MapPinTag : CName`.
 *  - **Visited regions** are the same flat run again: `BS CachedWorldDataMap` +
 *    `VL Size` + `Size × (CachedWorldDataPath, CachedWorldVisited, and three
 *    nested `…Map` containers)`.
 *
 * So the module reads one token walk and answers both a structured query (for
 * the player's arrays) and a flat-run query (for the map manager).
 *
 * ## A `CName` is a 1-based `MANU` index, and every one resolved
 *
 * Verified on both fixtures rather than taken from the reference decoder's note:
 * a `CName` is **2 bytes**, and `names[index - 1]` is its text. Measured: **0**
 * of the 700-odd tags across the two saves resolve to an index with no entry in
 * that save's own table, on either build. The arithmetic agrees independently —
 * `booksRead` is 26 bytes on the `8559a` save and `108 × 2 + 4` on the `52586`
 * one, which only holds at two bytes per tag.
 *
 * The consequence is the same one `ESkill` and `EBaseCharacterStats` carry: the
 * index is build-specific, so a tag is *only* meaningful as text resolved
 * through this save's table. The decoder's own figures (629 `booksRead`,
 * 430 `KnownMapPinTags`, 888 `DiscoveredMapPinTags`) are from a **different
 * save** (`ManualSave_f949c_…`, a 64/27 build) and are not comparable with
 * these two; the counts here are measured on the fixtures.
 *
 * ## A tag that resolves to a name is not always a *named* tag
 *
 * The `52586` save's `MANU` carries **9** entries whose text is
 * `MISSING_NAME_<GUID>` — the engine's own placeholder for a name it could not
 * find, and it points at a GUID. Measured: 9 of its 139 `DiscoveredMapPinTags`
 * and 2 of its 62 `DisabledMapPinTags` resolve to such a placeholder. They
 * *resolve* (there is a name at that index), so counting them as unresolved
 * would understate coverage; they are also not names a reader can show, so
 * counting them as resolved names would be a lie. Both numbers are reported.
 *
 * ## Counts are reported whole; sample lists are capped
 *
 * A late-game save holds hundreds of these records. Every list's **count** is
 * the measured length, never the cap, and every list that declares its length
 * reports the declaration beside the measurement so a disagreement is visible
 * rather than silently truncated. Measured on both fixtures: declared and
 * measured agree everywhere except the two custom-pin containers, where the
 * `Size` counts *pins* and each pin is three `VL` tokens — reading tokens
 * instead of pins would report three times the truth.
 *
 * ## Nothing here is written
 *
 * Every field is read-only. Granting a recipe or a map pin is a resize (the
 * `Size` grows, every offset after it moves) and is out of reach for a
 * width-preserving writer — see `./write`.
 */

import { readNameTable } from "./names";
import { type ReflectedValue, reflectValue } from "./reflect";
import { parseTokens, type Token } from "./tokens";

/**
 * How many resolved names each tag list keeps as a sample.
 *
 * A cap rather than a projection rule: `booksRead` is 108 entries on the
 * `52586` save and `KnownMapPinTags` 157, and a document carrying all of them
 * is unreadable. What is dropped is the *tail of the sample only* — `count`
 * still states the full length, and the sample keeps the save's own order so
 * the first entries are the ones the game wrote first.
 */
export const TAG_SAMPLE_LIMIT = 24;

/**
 * How many quest map-pin states are kept.
 *
 * `QuestMapPinStates` is 59 entries on the `52586` save; the cap keeps the
 * document bounded and `count` carries the whole number.
 */
export const QUEST_MAP_PIN_LIMIT = 32;

/** How many custom map pins are kept per container. Largest measured: 15. */
export const CUSTOM_MAP_PIN_LIMIT = 16;

/**
 * How many cached worlds are kept. Largest measured: 10 (the `8559a` save,
 * which adds a `dummy.w2w` to the nine shipped levels).
 */
export const CACHED_WORLD_LIMIT = 16;

/** One list of `CName` tags, with the measurement beside the declaration. */
type TagList = {
	/** elements actually walked out of the stream */
	readonly count: number;
	/** the length the save declares, or `null` where it declares none */
	readonly declaredCount: number | null;
	/** tags whose `MANU` index has no entry in this save's table */
	readonly unresolved: number;
	/** tags that resolve to the engine's `MISSING_NAME_<GUID>` placeholder */
	readonly placeholder: number;
	/** at most `TAG_SAMPLE_LIMIT` entries, in the save's own order */
	readonly names: readonly (string | null)[];
};

/** One `QuestMapPinStates` record: which pin, on which objective, shown or not. */
type QuestMapPinState = {
	/** 16-byte `CGUID` as hex, or `null` when the field is absent */
	readonly objectiveGuid: string | null;
	readonly mapPinGuid: string | null;
	/** the pin's visibility, `null` when the save does not state it */
	readonly state: boolean | null;
};

/** The `QuestMapPinStates` list. */
type QuestMapPinStates = {
	readonly count: number;
	readonly declaredCount: number | null;
	readonly states: readonly QuestMapPinState[];
};

/** One entry of a `CustomEntityMapPins` / `CustomAgentMapPins` container. */
type CustomMapPin = {
	/** the `…MapPinTag` name */
	readonly tag: string | null;
	/** the `…MapPinType` name: `MonsterNest`, `QuestAvailable`, … */
	readonly type: string | null;
	/** `…MapPinShowAlways`, `null` when the field is absent from the element */
	readonly showAlways: boolean | null;
};

/** One custom-pin container. */
type CustomMapPins = {
	/**
	 * Entries walked. **Not** the number of `VL` tokens: each pin is three
	 * (`Tag`, `Type`, `ShowAlways`), so counting tokens would report 3× — which
	 * is exactly the mistake that makes `declaredCount` and `count` disagree.
	 */
	readonly count: number;
	readonly declaredCount: number | null;
	readonly pins: readonly CustomMapPin[];
};

/** One entry of `CachedWorldDataMap`: a level the save knows of. */
type CachedWorld = {
	/** the `.w2w` path, verbatim */
	readonly path: string | null;
	/** the engine's own "has the player been here" flag, or `null` if absent */
	readonly visited: boolean | null;
	/** `CachedQuestMapPinsMap` size for this level: quest pins cached for it */
	readonly cachedQuestPins: number | null;
};

/** The `CachedWorldDataMap` list. */
type CachedWorlds = {
	readonly count: number;
	readonly declaredCount: number | null;
	/** how many of the measured entries are `visited = true` */
	readonly visited: number;
	readonly worlds: readonly CachedWorld[];
};

/** Everything this module reads, or `null` fields where the save says nothing. */
export type Unlocks = {
	// The player's own class-reflection arrays. Each is `null` when the field is
	// not in the stream at all, which is not the same as an empty list: an
	// absent field has no byte to write and a staged edit could not read back.
	readonly booksRead: TagList | null;
	readonly craftingSchematics: TagList | null;
	readonly alchemyRecipes: TagList | null;
	readonly unlockedAppearances: TagList | null;
	readonly expandedCraftingCategories: TagList | null;
	readonly expandedAlchemyCategories: TagList | null;
	readonly expandedBestiaryCategories: TagList | null;
	/**
	 * Not an unlock list, but the same shape and on the same entity: a
	 * level-indexed table of the item names the player has reached. Carried
	 * because it is one of the eight `array<CName>` fields on the player and a
	 * reader that stopped at the unlock list would leave it the only one out.
	 */
	readonly itemsPerLevel: TagList | null;

	// `CCommonMapManager`'s flat run.
	readonly questMapPinStates: QuestMapPinStates | null;
	readonly knownMapPinTags: TagList | null;
	readonly discoveredMapPinTags: TagList | null;
	readonly disabledMapPinTags: TagList | null;
	readonly discoveredAgentEntityTags: TagList | null;
	/** measured empty (`Size = 0`) on both fixtures; kept because it is there */
	readonly discoveredPaths: TagList | null;
	readonly customEntityMapPins: CustomMapPins | null;
	readonly customAgentMapPins: CustomMapPins | null;
	readonly cachedWorlds: CachedWorlds | null;
};

/** The nested containers each `CachedWorldDataMap` entry carries after its flag. */
const WORLD_NESTED = new Set([
	"CachedQuestMapPinsMap",
	"CachedShopkeeperDataMap",
	"CachedBoatDataArray",
]);

/** The engine's placeholder for a name it could not resolve. */
const MISSING_NAME_PREFIX = "MISSING_NAME_";

const u8 = (data: Uint8Array, at: number): number => data[at] ?? 0;

const u16 = (data: Uint8Array, at: number): number =>
	u8(data, at) | (u8(data, at + 1) << 8);

const u32 = (data: Uint8Array, at: number): number =>
	(u8(data, at) |
		(u8(data, at + 1) << 8) |
		(u8(data, at + 2) << 16) |
		(u8(data, at + 3) << 24)) >>>
	0;

/** Where a token's value starts: a `VL`/`OP` header is 6 bytes, `AVAL`/`PORP` 12. */
const valueOffsetOf = (token: Token): number =>
	token.offset + (token.tag === "VL" || token.tag === "OP" ? 6 : 12);

/** A `CName` token's `MANU` index, or `null` when the token is not a `CName`. */
const cnameIndex = (token: Token | undefined): number | null => {
	if (token?.value?.type !== "CName") return null;
	return u16(token.value.bytes, 0);
};

/**
 * One tag's text through this save's own table.
 *
 * `null` for an index with no entry: the save's table is its own symbol pool and
 * a name from another build's table would be a plausible lie. `CName(0)` is
 * the engine's "no name" and resolves to `null` for the same reason.
 */
const resolveTag = (
	names: readonly string[],
	index: number | null,
): string | null => {
	if (index === null || index < 1) return null;
	return names[index - 1] ?? null;
};

/** Build a `TagList` from already-resolved names. */
const tagListOf = (
	resolved: readonly (string | null)[],
	declaredCount: number | null,
): TagList => ({
	count: resolved.length,
	declaredCount,
	unresolved: resolved.filter((name) => name === null).length,
	placeholder: resolved.filter((name) => name?.startsWith(MISSING_NAME_PREFIX))
		.length,
	names: resolved.slice(0, TAG_SAMPLE_LIMIT),
});

/** A `Bool` token read as a boolean, or `null` when it is not one. */
const boolOf = (token: Token | undefined): boolean | null => {
	if (token?.value?.type !== "Bool") return null;
	return (token.value.bytes[0] ?? 0) !== 0;
};

/** A `CGUID` token as 32 hex characters, or `null` when it is not one. */
const guidOf = (token: Token | undefined): string | null => {
	if (token?.value?.type !== "CGUID") return null;
	return Array.from(token.value.bytes, (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
};

/** A `Uint32` token read as a number, or `null` when it is not one. */
const countOf = (token: Token | undefined): number | null => {
	if (token?.value?.type !== "Uint32") return null;
	return u32(token.value.bytes, 0);
};

/**
 * The player's `array<CName>` field of this name, or `undefined`.
 *
 * Anchored on `levelManager`, which the decoder measured to occur **exactly
 * once per save and only on the player**, and then takes the nearest matching
 * token *before* it. A search from the start of the stream would be ambiguous:
 * a save also holds NPC entities, and `expandedBestiaryCategories`-shaped names
 * are not unique across the whole stream — the anchor is what makes "the
 * player's" a fact rather than a hope.
 */
const playerArrayToken = (
	tokens: readonly Token[],
	levelIndex: number,
	name: string,
): Token | undefined => {
	for (let index = levelIndex; index >= 0; index -= 1) {
		const token = tokens[index];
		if (token?.name !== name) continue;
		if (token.value?.type !== "array:2,0,CName") continue;
		return token;
	}
	return undefined;
};

/**
 * One `array<CName>` read off the player's entity, named.
 *
 * `declaredCount` is the array's own `u32` and `count` is what the walk
 * actually produced, kept side by side: `reflect` rejects a value whose width
 * disagrees with the framing, so the two agreeing is a statement about the
 * bytes rather than about the reader.
 */
const readPlayerArray = (
	data: Uint8Array,
	names: readonly string[],
	token: Token | undefined,
): TagList | null => {
	if (token?.value === undefined) return null;
	const value: ReflectedValue | undefined = reflectValue(
		data,
		names,
		token.value.type,
		valueOffsetOf(token),
		token.value.bytes.byteLength,
	);
	if (value?.kind !== "array") return null;
	const resolved = (value.items ?? []).map((item) => {
		const match = /^CName\((\d+)\)$/.exec(item.text);
		return resolveTag(names, match === null ? null : Number(match[1]));
	});
	return tagListOf(resolved, value.count ?? null);
};

/**
 * Index of the flat-run container `name`, searching forward from `from`.
 *
 * Only a `BS` token opens one of these containers: a `VL` of the same name
 * would be a *value* inside the previous container, and taking it would read
 * the wrong list.
 */
const containerIndex = (
	tokens: readonly Token[],
	from: number,
	name: string,
): number => {
	for (let index = from; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token?.tag === "BS" && token.name === name) return index;
	}
	return -1;
};

/**
 * Read a flat-run `BS <name>` + `VL Size` + `N × VL …` container as a tag list.
 *
 * The run ends at the next `BS`, which is what makes `Size` checkable rather
 * than believed: the walk is bounded by the container boundary and then
 * compared against the declaration.
 */
const readFlatTagList = (
	tokens: readonly Token[],
	names: readonly string[],
	from: number,
	container: string,
): TagList | null => {
	const start = containerIndex(tokens, from, container);
	if (start < 0) return null;
	const declared = countOf(tokens[start + 1]);
	const resolved: (string | null)[] = [];
	for (let index = start + 2; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token?.tag === "BS") break;
		resolved.push(resolveTag(names, cnameIndex(token)));
	}
	return tagListOf(resolved, declared);
};

/**
 * `QuestMapPinStates`: `Size × (ObjectiveGuid, MapPinGuid, MapPinState)`.
 *
 * Triples rather than records — the flat run has no element framing, so the
 * element width is asserted from the field names rather than assumed, and a
 * run that is not a whole number of triples is read as short rather than
 * padded with a fabricated record.
 */
const readQuestMapPinStates = (
	tokens: readonly Token[],
	from: number,
): QuestMapPinStates | null => {
	const start = containerIndex(tokens, from, "QuestMapPinStates");
	if (start < 0) return null;
	const declared = countOf(tokens[start + 1]);
	const states: QuestMapPinState[] = [];
	let index = start + 2;
	while (index < tokens.length) {
		const token = tokens[index];
		if (token?.tag === "BS") break;
		const objective = token;
		const pin = tokens[index + 1];
		const state = tokens[index + 2];
		if (pin?.name !== "MapPinGuid" || state?.name !== "MapPinState") break;
		states.push({
			objectiveGuid: guidOf(objective),
			mapPinGuid: guidOf(pin),
			state: boolOf(state),
		});
		index += 3;
	}
	return {
		count: states.length,
		declaredCount: declared,
		states: states.slice(0, QUEST_MAP_PIN_LIMIT),
	};
};

/**
 * A `CustomEntityMapPins` / `CustomAgentMapPins` container.
 *
 * The two are read by the same code and differ only in their field names, so
 * the names are matched on the `…MapPinTag` / `…MapPinType` /
 * `…MapPinShowAlways` suffix rather than hardcoded per container: `52586`'s
 * table has `CustomEntityMapPinShowAlways` at a *different* index from
 * `CustomAgentMapPinShowAlways`, and `8559a`'s has neither (measured: both
 * containers are empty there), so the identity of a field is its suffix.
 */
const readCustomMapPins = (
	tokens: readonly Token[],
	names: readonly string[],
	from: number,
	container: string,
): CustomMapPins | null => {
	const start = containerIndex(tokens, from, container);
	if (start < 0) return null;
	const declared = countOf(tokens[start + 1]);
	const pins: CustomMapPin[] = [];
	let index = start + 2;
	while (index < tokens.length) {
		const tag = tokens[index];
		if (tag?.tag === "BS") break;
		const type = tokens[index + 1];
		if (type === undefined || !type.name.endsWith("MapPinType")) break;
		const always = tokens[index + 2];
		pins.push({
			tag: resolveTag(names, cnameIndex(tag)),
			type: resolveTag(names, cnameIndex(type)),
			showAlways:
				always?.name.endsWith("MapPinShowAlways") === true
					? boolOf(always)
					: null,
		});
		index += 3;
	}
	return {
		count: pins.length,
		declaredCount: declared,
		pins: pins.slice(0, CUSTOM_MAP_PIN_LIMIT),
	};
};

/**
 * `CachedWorldDataMap`: one entry per `.w2w` the save has heard of.
 *
 * The list is the game's **full level catalogue**, not the player's history:
 * measured, the `52586` save knows all nine shipped levels (including the Blood
 * and Wine `bob` world and the `the_spiral` endgame world) and marks four of
 * them visited, and the `8559a` save knows the same nine plus a `dummy.w2w`
 * and marks two. Only `CachedWorldVisited` carries state.
 *
 * The run ends at the next `BS` that is not one of the three nested containers
 * an entry carries (`CachedQuestMapPinsMap`, `CachedShopkeeperDataMap`,
 * `CachedBoatDataArray`) — `MapPinFilterHiddenList` on both fixtures.
 */
const readCachedWorlds = (
	tokens: readonly Token[],
	from: number,
): CachedWorlds | null => {
	const start = containerIndex(tokens, from, "CachedWorldDataMap");
	if (start < 0) return null;
	const declared = countOf(tokens[start + 1]);
	// Built mutable and frozen at the end: an entry's `cachedQuestPins` is
	// discovered *after* the entry, because the three nested containers follow
	// the path and the visited flag rather than preceding them. Reading them
	// forward would attribute Novigrad's 42 cached pins to no world at all.
	const open: {
		path: string | null;
		visited: boolean | null;
		cachedQuestPins: number | null;
	}[] = [];
	for (let index = start + 2; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token?.tag === "BS") {
			const current = open[open.length - 1];
			if (WORLD_NESTED.has(token.name)) {
				const size = countOf(tokens[index + 1]);
				if (current !== undefined && token.name === "CachedQuestMapPinsMap") {
					current.cachedQuestPins = size;
				}
				continue;
			}
			break;
		}
		if (token?.name !== "CachedWorldDataPath") continue;
		const visited = tokens[index + 1];
		open.push({
			path: token.value?.text ?? null,
			visited: visited?.name === "CachedWorldVisited" ? boolOf(visited) : null,
			cachedQuestPins: null,
		});
	}
	const worlds: readonly CachedWorld[] = open.map((world) => ({
		path: world.path,
		visited: world.visited,
		cachedQuestPins: world.cachedQuestPins,
	}));
	return {
		count: worlds.length,
		declaredCount: declared,
		visited: worlds.filter((world) => world.visited === true).length,
		worlds: worlds.slice(0, CACHED_WORLD_LIMIT),
	};
};

/**
 * Every unlock, flag and map-pin list in one save, read from one token walk.
 *
 * The walk is the expensive part — 39,309 tokens on the `8559a` save and
 * 250,640 on the `52586` one, measured at 71 ms and 245 ms — so it is a
 * parameter rather than something this module repeats. `names` and `tokens`
 * must come from the same `readNameTable`/`parseTokens` pair, since every tag
 * is resolved through that table.
 *
 * Returns `null` only when neither the player nor the map manager can be found
 * at all, which is the honest "this is not a save this reader understands"
 * answer; an individual list that is absent from the stream is `null` in the
 * result rather than an empty list.
 */
export const readUnlocksFromScan = (
	data: Uint8Array,
	names: readonly string[],
	tokens: readonly Token[],
): Unlocks | null => {
	const levelIndex = tokens.findIndex(
		(token) =>
			token.name === "levelManager" &&
			token.value?.type === "handle:W3LevelManager",
	);
	const mapIndex = tokens.findIndex(
		(token) => token.name === "CCommonMapManager",
	);
	if (levelIndex < 0 && mapIndex < 0) return null;

	const player = (name: string): TagList | null =>
		levelIndex < 0
			? null
			: readPlayerArray(
					data,
					names,
					playerArrayToken(tokens, levelIndex, name),
				);
	const map = (container: string): TagList | null =>
		mapIndex < 0 ? null : readFlatTagList(tokens, names, mapIndex, container);

	return {
		booksRead: player("booksRead"),
		craftingSchematics: player("craftingSchematics"),
		alchemyRecipes: player("alchemyRecipes"),
		unlockedAppearances: player("unlockedAppearances"),
		expandedCraftingCategories: player("expandedCraftingCategories"),
		expandedAlchemyCategories: player("expandedAlchemyCategories"),
		expandedBestiaryCategories: player("expandedBestiaryCategories"),
		itemsPerLevel: player("itemsPerLevel"),

		questMapPinStates:
			mapIndex < 0 ? null : readQuestMapPinStates(tokens, mapIndex),
		knownMapPinTags: map("KnownMapPinTags"),
		discoveredMapPinTags: map("DiscoveredMapPinTags"),
		disabledMapPinTags: map("DisabledMapPinTags"),
		discoveredAgentEntityTags: map("DiscoveredAgentEntityTags"),
		discoveredPaths: map("DiscoveredPaths"),
		customEntityMapPins:
			mapIndex < 0
				? null
				: readCustomMapPins(tokens, names, mapIndex, "CustomEntityMapPins"),
		customAgentMapPins:
			mapIndex < 0
				? null
				: readCustomMapPins(tokens, names, mapIndex, "CustomAgentMapPins"),
		cachedWorlds: mapIndex < 0 ? null : readCachedWorlds(tokens, mapIndex),
	};
};

/**
 * `readUnlocksFromScan` for a caller that has not walked the tokens yet.
 *
 * Costs one walk of its own, so a caller that already holds a scan should call
 * `readUnlocksFromScan` instead. `./format` does not yet hand its walk out, so
 * this is the entry point a projection can use today.
 */
export const readUnlocks = (data: Uint8Array): Unlocks | null => {
	const names = readNameTable(data).names;
	return readUnlocksFromScan(data, names, parseTokens(data, names).tokens);
};
