import { readNameTable } from "./names";
import { type ReflectedValue, reflectValue } from "./reflect";
import { parseTokens, type Token } from "./tokens";

export const TAG_SAMPLE_LIMIT = 24;

export const QUEST_MAP_PIN_LIMIT = 32;

export const CUSTOM_MAP_PIN_LIMIT = 16;

export const CACHED_WORLD_LIMIT = 16;

type TagList = {
	readonly count: number;
	readonly declaredCount: number | null;
	readonly unresolved: number;
	readonly placeholder: number;
	readonly names: readonly (string | null)[];
};

type QuestMapPinState = {
	readonly objectiveGuid: string | null;
	readonly mapPinGuid: string | null;
	readonly state: boolean | null;
};

type QuestMapPinStates = {
	readonly count: number;
	readonly declaredCount: number | null;
	readonly states: readonly QuestMapPinState[];
};

type CustomMapPin = {
	readonly tag: string | null;
	readonly type: string | null;
	readonly showAlways: boolean | null;
};

type CustomMapPins = {
	readonly count: number;
	readonly declaredCount: number | null;
	readonly pins: readonly CustomMapPin[];
};

type CachedWorld = {
	readonly path: string | null;
	readonly visited: boolean | null;
	readonly cachedQuestPins: number | null;
};

type CachedWorlds = {
	readonly count: number;
	readonly declaredCount: number | null;
	readonly visited: number;
	readonly worlds: readonly CachedWorld[];
};

export type Unlocks = {
	readonly booksRead: TagList | null;
	readonly craftingSchematics: TagList | null;
	readonly alchemyRecipes: TagList | null;
	readonly unlockedAppearances: TagList | null;
	readonly expandedCraftingCategories: TagList | null;
	readonly expandedAlchemyCategories: TagList | null;
	readonly expandedBestiaryCategories: TagList | null;
	readonly itemsPerLevel: TagList | null;

	readonly questMapPinStates: QuestMapPinStates | null;
	readonly knownMapPinTags: TagList | null;
	readonly discoveredMapPinTags: TagList | null;
	readonly disabledMapPinTags: TagList | null;
	readonly discoveredAgentEntityTags: TagList | null;
	readonly discoveredPaths: TagList | null;
	readonly customEntityMapPins: CustomMapPins | null;
	readonly customAgentMapPins: CustomMapPins | null;
	readonly cachedWorlds: CachedWorlds | null;
};

const WORLD_NESTED = new Set([
	"CachedQuestMapPinsMap",
	"CachedShopkeeperDataMap",
	"CachedBoatDataArray",
]);

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

const valueOffsetOf = (token: Token): number =>
	token.offset + (token.tag === "VL" || token.tag === "OP" ? 6 : 12);

const cnameIndex = (token: Token | undefined): number | null => {
	if (token?.value?.type !== "CName") return null;
	return u16(token.value.bytes, 0);
};

const resolveTag = (
	names: readonly string[],
	index: number | null,
): string | null => {
	if (index === null || index < 1) return null;
	return names[index - 1] ?? null;
};

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

const boolOf = (token: Token | undefined): boolean | null => {
	if (token?.value?.type !== "Bool") return null;
	return (token.value.bytes[0] ?? 0) !== 0;
};

const guidOf = (token: Token | undefined): string | null => {
	if (token?.value?.type !== "CGUID") return null;
	return Array.from(token.value.bytes, (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
};

const countOf = (token: Token | undefined): number | null => {
	if (token?.value?.type !== "Uint32") return null;
	return u32(token.value.bytes, 0);
};

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
		const hasShowAlways = always?.name.endsWith("MapPinShowAlways") === true;
		pins.push({
			tag: resolveTag(names, cnameIndex(tag)),
			type: resolveTag(names, cnameIndex(type)),
			showAlways: hasShowAlways ? boolOf(always) : null,
		});
		index += hasShowAlways ? 3 : 2;
	}
	return {
		count: pins.length,
		declaredCount: declared,
		pins: pins.slice(0, CUSTOM_MAP_PIN_LIMIT),
	};
};

const readCachedWorlds = (
	tokens: readonly Token[],
	from: number,
): CachedWorlds | null => {
	const start = containerIndex(tokens, from, "CachedWorldDataMap");
	if (start < 0) return null;
	const declared = countOf(tokens[start + 1]);
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

export const readUnlocks = (data: Uint8Array): Unlocks | null => {
	const names = readNameTable(data).names;
	return readUnlocksFromScan(data, names, parseTokens(data, names).tokens);
};
