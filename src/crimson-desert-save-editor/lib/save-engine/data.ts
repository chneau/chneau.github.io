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
			internalName: string;
			allowedEquipTypes: number[];
			allowedCategories: string[];
		}
	>;
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

type ReferenceLevelsFile = Record<string, number>;

type SkillLearnFile = Array<{
	key: number;
	count: number;
	ownerType: number;
}>;

type SkillKeysFile = Array<{
	key: number;
	name: string;
	display: string;
	level: number | null;
}>;

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
			stages: number[] | null;
		}
	>;
};

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
