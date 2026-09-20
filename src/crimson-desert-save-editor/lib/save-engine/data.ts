/**
 * Typed accessors for the JSON tables the save engine reads.
 *
 * The tables live in `lib/generated/` and are imported by the modules that need
 * them, so the engine reads no files from disk at runtime. The large catalogs
 * load through dynamic imports to keep them out of the entry chunk; each table
 * is read at most once per session.
 */

const tables = new Map<string, Promise<unknown>>();

const table = <T>(
	name: string,
	load: () => Promise<{ default: T }>,
): Promise<T> => {
	let cached = tables.get(name) as Promise<T> | undefined;
	if (!cached) {
		cached = load().then((module) => module.default);
		tables.set(name, cached);
	}
	return cached;
};

/** One entry of the generated item catalog, as the file carries it. */
export type ItemCatalogEntry = {
	name: string;
	description?: string;
	category?: string;
	legacy_category_hint?: string;
	max_stack?: number;
	legacy_max_stack_hint?: number;
	legacy_internal_name_hint?: string;
};

export type ItemCatalogFile = {
	schema_version: number;
	game: { steam_build_id?: string | null };
	sources: { iteminfo: { sha256: string } };
	items: Record<string, ItemCatalogEntry>;
};

/** One entry of the generated equipment catalog; every field is present. */
export type EquipmentCatalogEntry = {
	name: string;
	internalName: string;
	category: string;
	equipType: number;
	equipTypeName: string;
	defaultInventory: number;
	socketCap: number | null;
	blockedInGameData: boolean;
	characterEquipment: boolean;
	compatibleCharacters: string[];
	refinementLevels: number[];
	canRefine: boolean;
	initialUnlockedSockets: number;
	exclusionReason: string | null;
};

export type EquipmentCatalogFile = {
	schema_version: number;
	steam_build_id: string;
	source_sha256: string;
	source_layout: string;
	name_catalog: string;
	item_records_scanned: number;
	equipment_count: number;
	definitions_scanned: number;
	items: Record<string, EquipmentCatalogEntry>;
};

type SocketCapsCurrentGameFile = {
	game?: { steam_build_id?: string | null };
	items?: Record<string, { max_sockets: number }>;
};

type SocketCapsVerifiedFile = {
	game?: { tested_build_id?: string | null };
	items?: Record<
		string,
		{
			max_sockets: number;
			source?: string;
			confidence?: string;
			tested_build_id?: string | null;
			notes?: string;
		}
	>;
};

type SocketCapsGameDataFile =
	| Record<string, number>
	| { items: Record<string, number> };

export type AbyssGearRulesFile = {
	gear: Record<
		string,
		{
			/** Item identity, e.g. `Item_Stat_AbyssGear_CriticalRate_LV1`. */
			internalName: string;
			allowedEquipTypes: number[];
			allowedCategories: string[];
		}
	>;
	/** Equipment key -> equip-type hash. */
	equipmentTypes: Record<string, number>;
};

export type ItemKnowledgeMapFile = {
	items: Record<string, { knowledge_keys: number[] }>;
	no_discovery_item_keys: number[];
};

export type CompanionCatalogFile = {
	entries: Record<
		string,
		{
			name: string;
			category: string;
			addable?: boolean;
			ownershipGroup?: string;
		}
	>;
};

/** One serialized field, as `[name, typeName, metaKind, metaSize, metaAux]`. */
type CompanionTemplateField = Array<string | number>;

type CompanionTemplateLocator = {
	type: string;
	typeOffset: number;
	pointerOffset: number;
	schema: CompanionTemplateField[];
};

export type CompanionTemplate = {
	record: string;
	sha256: string;
	identities: Array<{ offset: number; kind: string }>;
	characterKeyOffset: number;
	locators: CompanionTemplateLocator[];
};

export type CompanionTemplatesFile = Record<
	string,
	/**
	 * `selected` is absent for the entries the game never selects — the camp
	 * workers (e.g. Grey-0), which are only ever cloned from `idle`.
	 */
	{ idle: CompanionTemplate; selected?: CompanionTemplate }
>;

export const itemCatalogTable = (): Promise<ItemCatalogFile> => {
	return table(
		"items",
		() => import("../generated/items-steam-build-25050808.json"),
	);
};

export const equipmentCatalogTable = (): Promise<EquipmentCatalogFile> => {
	return table(
		"equipment",
		() => import("../generated/equipment-catalog.json"),
	);
};

export const socketCapsGameDataTable = (): Promise<SocketCapsGameDataFile> => {
	return table("socketCapsGame", () => import("../generated/item-limits.json"));
};

export const socketCapsCurrentGameTable =
	(): Promise<SocketCapsCurrentGameFile> => {
		return table(
			"socketCapsCurrent",
			() => import("../generated/socket-caps-current-game.json"),
		);
	};

export const socketCapsVerifiedTable = (): Promise<SocketCapsVerifiedFile> => {
	return table(
		"socketCapsVerified",
		() => import("../generated/socket-caps-verified.json"),
	);
};

export const abyssGearRulesTable = (): Promise<AbyssGearRulesFile> => {
	return table(
		"abyssGear",
		() => import("../generated/abyss-gear-compatibility.json"),
	);
};

export const itemKnowledgeTable = (): Promise<ItemKnowledgeMapFile> => {
	return table(
		"itemKnowledge",
		() => import("../generated/item-knowledge-map.json"),
	);
};

/** Knowledge key -> level, as learned in the 100% reference save. */
type ReferenceLevelsFile = Record<string, number>;

/** `SkillLearnElementSaveData` entries: the artifact counts behind each skill. */
type SkillLearnFile = Array<{
	key: number;
	/** _usedArtifactCount */
	count: number;
	/** _skillPointOwnerType */
	ownerType: number;
}>;

/**
 * Knowledge entries that back a skill but are missing from the skill-learn
 * list: Elemental powers, the life skills and the mount/machine abilities.
 * `level` is null where the reference save has no such entry.
 */
type SkillKeysFile = Array<{
	key: number;
	name: string;
	display: string;
	level: number | null;
}>;

/**
 * The names the game's own tables give the keys a save stores. Generated by
 * `scripts/build-game-names.ts` from a Crimson Desert data dump, so the quest,
 * bond and region editors label their rows instead of showing numbers.
 */
export type GameNamesFile = {
	schema_version: number;
	characters: Record<string, string>;
	sublevels: Record<string, string>;
	missions: Record<string, string>;
	questGauges: Record<string, string>;
	dyeColorGroups: Record<string, string>;
	quests: Record<
		string,
		{
			name: string;
			category: string | null;
			/** Stage keys the quest owns, when the data dump has them. */
			stages: number[] | null;
		}
	>;
};

/** Every knowledge key, with its internal and player-facing names. */
type KnowledgeKeysFile = Array<{
	key: number;
	name?: string;
	display_name?: string;
}>;

export const referenceLevelsTable = (): Promise<ReferenceLevelsFile> => {
	return table(
		"referenceLevels",
		() => import("../generated/reference-levels.json"),
	);
};

export const skillLearnTable = (): Promise<SkillLearnFile> => {
	return table("skillLearn", () => import("../generated/skill-learn.json"));
};

export const skillKeysTable = (): Promise<SkillKeysFile> => {
	return table("skillKeys", () => import("../generated/skill-keys.json"));
};

export const knowledgeKeysTable = (): Promise<KnowledgeKeysFile> => {
	return table(
		"knowledgeKeys",
		() => import("../generated/knowledge-keys.json"),
	);
};

export const gameNamesTable = (): Promise<GameNamesFile> => {
	return table("gameNames", () => import("../generated/game-names.json"));
};

export const companionCatalogTable = (): Promise<CompanionCatalogFile> => {
	return table(
		"companionCatalog",
		() => import("../generated/companion-catalog.json"),
	);
};

export const companionTemplatesTable = (): Promise<CompanionTemplatesFile> => {
	return table(
		"companionTemplates",
		() => import("../generated/companion-templates.json"),
	);
};
