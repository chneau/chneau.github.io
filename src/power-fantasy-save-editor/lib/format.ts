import {
	aesCbcDecrypt,
	aesCbcEncrypt,
	type Bytes,
	editId,
	effectiveEdits,
	getAtPath,
	isJsonObject,
	type JsonValue,
	pbkdf2Sha1,
	type QuickAction,
	type SaveCodec,
	type SaveEdit,
	type SavePath,
	type SummaryRow,
} from "../../shared";

export const PASSWORD = "godisdad";

const KDF_ITERATIONS = 100;

const KEY_BYTES = 16;

const IV_BYTES = 16;

const MIN_FILE_BYTES = IV_BYTES + IV_BYTES;

type TypedRecord = {
	readonly __type: string;
	readonly value: JsonValue;
};

const isTypedRecord = (value: JsonValue | undefined): value is TypedRecord =>
	value !== undefined &&
	isJsonObject(value) &&
	typeof value.__type === "string" &&
	value.value !== undefined;

const intRecord = (value: number): JsonValue => ({ __type: "int", value });

export const headerIv = (bytes: Bytes): Bytes => {
	if (bytes.length < MIN_FILE_BYTES) {
		throw new Error(
			`That file is ${bytes.length} bytes long, which is too short to be a Power Fantasy save: one opens with a 16-byte key and at least one block of cipher text.`,
		);
	}
	return bytes.slice(0, IV_BYTES);
};

const NOT_A_SAVE =
	"That file did not decrypt to a Power Fantasy save. The password is baked into the game rather than chosen by you, so there is nothing to type — if you expected this file to load, it is probably a different game's .es3, or a save from a build whose format has moved on.";

const readsAsObject = (
	value: unknown,
): value is { readonly [key: string]: JsonValue } =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const decryptSave = async (
	bytes: Bytes,
	password = PASSWORD,
): Promise<JsonValue> => {
	const iv = headerIv(bytes);
	const key = await pbkdf2Sha1(password, iv, KDF_ITERATIONS, KEY_BYTES);
	let plain: Bytes;
	try {
		plain = await aesCbcDecrypt(key, iv, bytes.subarray(IV_BYTES));
	} catch {
		throw new Error(NOT_A_SAVE);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(plain));
	} catch {
		throw new Error(NOT_A_SAVE);
	}
	if (!readsAsObject(parsed)) {
		throw new Error(NOT_A_SAVE);
	}
	return parsed;
};

export const encryptSave = async (
	doc: JsonValue,
	iv: Bytes,
	password = PASSWORD,
): Promise<Bytes> => {
	const key = await pbkdf2Sha1(password, iv, KDF_ITERATIONS, KEY_BYTES);
	const cipher = await aesCbcEncrypt(
		key,
		iv,
		new TextEncoder().encode(JSON.stringify(doc)),
	);
	const out = new Uint8Array(IV_BYTES + cipher.length);
	out.set(iv, 0);
	out.set(cipher, IV_BYTES);
	return out;
};

const ACHIEVEMENT_PREFIX = "a_";

const BLOOD_PREFIX = "blood_";

const PASSIVE_PREFIX = "br_";

const INVENTORY_PREFIX = "inv/";
const INVENTORY_INDEX: SavePath = [`${INVENTORY_PREFIX}index`];

const HEROES = [
	"Aric",
	"Croak",
	"Daria",
	"Effy",
	"Ember",
	"Gundel",
	"Icicle",
	"Kaito",
	"Kaze",
	"Mad",
	"Misty",
	"Mothman",
	"Nova",
	"Nox",
	"Orb",
	"Santa",
	"Zikk",
] as const;

const PASSIVES = [
	"ButtonHealthRecovery",
	"ButtonHealth",
	"ButtonInvulnerability",
	"ButtonAddDash",
	"ButtonDashRecovery",
	"ButtonEvasion",
	"ButtonHealthPotions",
	"ButtonProjSpeed",
	"ButtonWalkSpeed",
	"ButtonLegendaryPerk",
	"ButtonPosMods",
	"ButtonXPGain",
	"ButtonEpicPerks",
	"ButtonDropRate",
	"ButtonGoldDroprate",
	"ButtonPotionDrops",
	"ButtonLootRange",
	"ButtonProj",
	"ButtonBossDamage",
	"ButtonMinDamage",
	"ButtonCrit",
	"ButtonProjDistance",
	"ButtonCritMulti",
	"ButtonNormalDamage",
	"ButtonMaxDamage",
	"ButtonAttackSpeed",
	"ButtonDamage",
] as const;

const INVENTORY_ITEMS = [
	"fish_bloodruby",
	"fish_common",
	"fish_epic",
	"fish_legendary",
	"fish_rare",
	"herb_common",
	"herb_epic",
	"herb_legendary",
	"herb_rare",
	"item_bait",
	"item_commonkey",
	"item_cosmetictoken",
	"item_emptyvial",
	"item_goldenkey",
	"item_infusion",
	"item_muck",
	"shard_boss",
	"shard_profession",
] as const;

const INFUSIONS: readonly (readonly [string, number])[] = [
	["infusion_xpgain", 100],
	["infusion_critmulti", 100],
	["infusion_health", 100],
	["infusion_globaldamage", 100],
	["infusion_projectiles", 10],
];

const CHARACTER_ACHIEVEMENTS = [
	"a_Aric_3",
	"a_Croak_0",
	"a_Croak_5",
	"a_Daria_0",
	"a_Daria_1",
	"a_Daria_2",
	"a_Daria_3",
	"a_Daria_5",
	"a_Effy_0",
	"a_Effy_1",
	"a_Effy_2",
	"a_Effy_3",
	"a_Effy_5",
	"a_Ember_0",
	"a_Ember_1",
	"a_Ember_2",
	"a_Ember_3",
	"a_Ember_5",
	"a_Gundel_0",
	"a_Gundel_1",
	"a_Gundel_2",
	"a_Gundel_3",
	"a_Gundel_5",
	"a_Icicle_0",
	"a_Icicle_1",
	"a_Icicle_2",
	"a_Icicle_3",
	"a_Icicle_5",
	"a_Kaito_0",
	"a_Kaito_1",
	"a_Kaito_2",
	"a_Kaito_3",
	"a_Kaze_0",
	"a_Kaze_3",
	"a_Kaze_5",
	"a_Mad_0",
	"a_Mad_1",
	"a_Mad_2",
	"a_Mad_3",
	"a_Mad_5",
	"a_Nova_0",
	"a_Nova_5",
	"a_Nox_0",
	"a_Nox_5",
	"a_Orb_0",
	"a_Orb_5",
	"a_Santa_0",
	"a_Santa_5",
	"a_Zikk_0",
	"a_Zikk_1",
	"a_Zikk_3",
	"a_Zikk_5",
	"a_ancienttroll",
	"a_balrog",
	"a_goblinking",
	"a_grimreaper",
	"a_skeletonking",
	"a_slimecube",
	"a_spiderqueen",
	"a_zombiegiant",
	"a_zombieminotaur",
	"a_entomologist",
] as const;

const CHARACTER_BLOOD_ITEMS = ["blood_draco", "blood_mothman"] as const;

const COMPANION_ACHIEVEMENTS = [
	"a_5companions",
	"a_beekeeper",
	"a_frogwhisperer",
	"a_gargoyle",
	"a_mimic",
	"a_ndragon",
	"a_companionmastery",
] as const;

const COMPANION_BLOOD_ITEMS = ["blood_beastmaster"] as const;

const DLC_ACHIEVEMENTS = [
	"a_Santa_0",
	"a_Santa_5",
	"a_Kaze_0",
	"a_Kaze_3",
	"a_Kaze_5",
	"a_Nova_0",
	"a_Nova_5",
	"a_Orb_0",
	"a_Orb_5",
] as const;

const UNLOCKED_COUNT = 99999;
const BLOOD_UNLOCKED_TIER = 10;

const CHEATED_RUBIES = 9999999;

const CHEATED_STACK = 999;

const keysWithPrefix = (doc: JsonValue, prefix: string): readonly string[] =>
	isJsonObject(doc)
		? Object.keys(doc).filter((key) => key.startsWith(prefix))
		: [];

const countPresent = (doc: JsonValue, names: readonly string[]): number =>
	names.filter((name) => getAtPath(doc, [name]) !== undefined).length;

const intAt = (doc: JsonValue, path: SavePath): number | undefined => {
	const record = getAtPath(doc, path);
	return isTypedRecord(record) && typeof record.value === "number"
		? record.value
		: undefined;
};

const listLengthAt = (doc: JsonValue, path: SavePath): number | undefined => {
	const record = getAtPath(doc, path);
	return isTypedRecord(record) && Array.isArray(record.value)
		? record.value.length
		: undefined;
};

const raiseTo = (
	doc: JsonValue,
	path: SavePath,
	floor: number,
	label: string,
): SaveEdit | undefined => {
	const before = getAtPath(doc, path);
	if (before === undefined) return undefined;
	const current = intAt(doc, path) ?? 0;
	const after = intRecord(Math.max(current, floor));
	return { id: editId(path, after), label, path, before, after };
};

const kept = (
	candidates: readonly (SaveEdit | undefined)[],
): readonly SaveEdit[] => candidates.filter((edit) => edit !== undefined);

const plan = (
	doc: JsonValue,
	candidates: readonly (SaveEdit | undefined)[],
): readonly SaveEdit[] => effectiveEdits(kept(candidates), doc);

const raiseStacks = (doc: JsonValue, floor: number): SaveEdit | undefined => {
	const before = getAtPath(doc, INVENTORY_INDEX);
	if (!isTypedRecord(before) || !Array.isArray(before.value)) return undefined;
	const value = before.value.map((entry) => {
		if (!isJsonObject(entry) || typeof entry.itemId !== "string") return entry;
		const amount = typeof entry.amount === "number" ? entry.amount : 0;
		return { ...entry, amount: Math.max(amount, floor) };
	});
	const after: JsonValue = { ...before, value };
	return {
		id: editId(INVENTORY_INDEX, after),
		label: "Inventory stack list",
		path: INVENTORY_INDEX,
		before,
		after,
	};
};

const setInfusions = (doc: JsonValue, hero: string): SaveEdit | undefined => {
	const path: SavePath = [`${hero}_alchemy_infusions`];
	const before = getAtPath(doc, path);
	if (!isTypedRecord(before)) return undefined;
	const value = INFUSIONS.map(([infusionId, count]) => ({ infusionId, count }));
	const after: JsonValue = { ...before, value };
	return {
		id: editId(path, after),
		label: `Alchemy infusions for ${hero}`,
		path,
		before,
		after,
	};
};

const ACHIEVEMENT_EDITS = (doc: JsonValue, ids: readonly string[]) =>
	ids.map((id) =>
		raiseTo(doc, [id], UNLOCKED_COUNT, `Achievement ${id.slice(2)}`),
	);

const BLOOD_EDITS = (doc: JsonValue, ids: readonly string[]) =>
	ids.map((id) =>
		raiseTo(doc, [id], BLOOD_UNLOCKED_TIER, `Blood rune ${id.slice(6)}`),
	);

const cheat: QuickAction = {
	id: "cheat",
	label: "Fill the ruby purse",
	description:
		"Raises the Blood Ruby total to at least 9,999,999. The original command also swept the inventory up to 999; that is what “Fill every item” below does, and having it in two places would stage the same fields twice.",
	plan: (doc) =>
		plan(doc, [raiseTo(doc, ["s_bloodRuby"], CHEATED_RUBIES, "Blood Rubies")]),
};

const cheatItems: QuickAction = {
	id: "cheat-items",
	label: "Fill every item",
	description:
		"Raises all eighteen inventory counters to at least 999 and the stack list to match, so the game sees the same counts whichever of the two it reads.",
	plan: (doc) =>
		plan(doc, [
			...INVENTORY_ITEMS.map((item) =>
				raiseTo(doc, [INVENTORY_PREFIX + item], CHEATED_STACK, `Item ${item}`),
			),
			raiseStacks(doc, CHEATED_STACK),
		]),
};

const cheatPassives: QuickAction = {
	id: "cheat-passives",
	label: "Unlock every passive",
	description:
		"Sets the 27 blood-rune passives to learned for all 17 heroes — 459 counters, where the save records them.",
	plan: (doc) =>
		plan(
			doc,
			HEROES.flatMap((hero) =>
				PASSIVES.map((passive) =>
					raiseTo(
						doc,
						[`${PASSIVE_PREFIX}${hero}_${passive}`],
						1,
						`${hero}: ${passive.slice("Button".length)}`,
					),
				),
			),
		),
};

const cheatInfusions: QuickAction = {
	id: "cheat-infusions",
	label: "Max the alchemy infusions",
	description:
		"Gives every hero 100 of each of XP gain, critical chance, health and damage, and 10 projectiles.",
	plan: (doc) =>
		plan(
			doc,
			HEROES.map((hero) => setInfusions(doc, hero)),
		),
};

const unlockAll: QuickAction = {
	id: "unlock-all",
	label: "Unlock everything",
	description:
		"Raises every achievement and every blood rune this save records to the top of its track. Scoped to the save's own keys rather than a fixed list of ids, so a patch that adds an achievement is covered without a code change.",
	plan: (doc) =>
		plan(doc, [
			...keysWithPrefix(doc, ACHIEVEMENT_PREFIX).map((id) =>
				raiseTo(doc, [id], UNLOCKED_COUNT, `Achievement ${id.slice(2)}`),
			),
			...keysWithPrefix(doc, BLOOD_PREFIX).map((id) =>
				raiseTo(doc, [id], BLOOD_UNLOCKED_TIER, `Blood rune ${id.slice(6)}`),
			),
		]),
};

const unlockCharacters: QuickAction = {
	id: "unlock-characters",
	label: "Unlock the heroes",
	description:
		"Sets the hero achievements and their blood runes to the top of their track — the ids for Aric, Croak, Daria, Effy, Ember, Gundel, Icicle, Kaito, Mad, Misty, Mothman and Zikk.",
	plan: (doc) =>
		plan(doc, [
			...ACHIEVEMENT_EDITS(doc, CHARACTER_ACHIEVEMENTS),
			...BLOOD_EDITS(doc, CHARACTER_BLOOD_ITEMS),
		]),
};

const unlockCompanions: QuickAction = {
	id: "unlock-companions",
	label: "Unlock the companions",
	description:
		"Sets the companion achievements and the Beastmaster rune. A save that has not met a companion yet has no key for it, and that id is simply skipped.",
	plan: (doc) =>
		plan(doc, [
			...ACHIEVEMENT_EDITS(doc, COMPANION_ACHIEVEMENTS),
			...BLOOD_EDITS(doc, COMPANION_BLOOD_ITEMS),
		]),
};

const unlockUpgrades: QuickAction = {
	id: "unlock-upgrades",
	label: "Unlock everything else",
	description:
		"Every achievement and blood rune this save records, minus the hero and companion ones above — the shops, professions, perks, fishing and gambling tracks that are not characters.",
	plan: (doc) => {
		const characters = new Set<string>(CHARACTER_ACHIEVEMENTS);
		const companions = new Set<string>(COMPANION_ACHIEVEMENTS);
		const bloodHeroes = new Set<string>(CHARACTER_BLOOD_ITEMS);
		const bloodCompanions = new Set<string>(COMPANION_BLOOD_ITEMS);
		return plan(doc, [
			...keysWithPrefix(doc, ACHIEVEMENT_PREFIX)
				.filter((id) => !characters.has(id) && !companions.has(id))
				.map((id) =>
					raiseTo(doc, [id], UNLOCKED_COUNT, `Achievement ${id.slice(2)}`),
				),
			...keysWithPrefix(doc, BLOOD_PREFIX)
				.filter((id) => !bloodHeroes.has(id) && !bloodCompanions.has(id))
				.map((id) =>
					raiseTo(doc, [id], BLOOD_UNLOCKED_TIER, `Blood rune ${id.slice(6)}`),
				),
		]);
	},
};

const unlockDlc: QuickAction = {
	id: "unlock-dlc",
	label: "Unlock the DLC characters",
	description:
		"Sets the nine achievements belonging to Santa, Kaze, Nova and Orb, which the paid characters are gated behind.",
	plan: (doc) => plan(doc, ACHIEVEMENT_EDITS(doc, DLC_ACHIEVEMENTS)),
};

const summarise: (doc: JsonValue) => readonly SummaryRow[] = (doc) => {
	const rubies = intAt(doc, ["s_bloodRuby"]);
	const heroes = countPresent(
		doc,
		HEROES.map((hero) => `s_level_${hero}`),
	);
	const stacks = listLengthAt(doc, INVENTORY_INDEX);
	const wins = intAt(doc, ["totalWins_"]);
	const banishes = intAt(doc, ["s_totalBanish"]);
	return [
		{
			label: "Blood Rubies",
			value:
				rubies === undefined ? "not recorded" : rubies.toLocaleString("en-GB"),
			emphasis: rubies !== undefined && rubies < 1000,
		},
		{
			label: "Heroes with a saved level",
			value: `${heroes} of ${HEROES.length}`,
		},
		{
			label: "Runs won",
			value: wins === undefined ? "not recorded" : String(wins),
		},
		{
			label: "Banishes, all time",
			value: banishes === undefined ? "not recorded" : String(banishes),
		},
		{
			label: "Inventory stacks",
			value: stacks === undefined ? "not recorded" : String(stacks),
		},
		{
			label: "Passives recorded",
			value: String(keysWithPrefix(doc, PASSIVE_PREFIX).length),
		},
		{
			label: "Achievements recorded",
			value: String(keysWithPrefix(doc, ACHIEVEMENT_PREFIX).length),
		},
		{
			label: "Saved values",
			value: String(isJsonObject(doc) ? Object.keys(doc).length : 0),
		},
	];
};

let openedIv: Bytes | null = null;

export const powerFantasy: SaveCodec = {
	game: "Power Fantasy",
	formatLabel: "AES-128-CBC over Unity JSON",
	extensions: ["es3"],
	defaultPath:
		"%USERPROFILE%\\AppData\\LocalLow\\Lava Lamb Games\\Power Fantasy\\PowerFantasySave.es3",
	notes: [
		{
			title: "The save really is encrypted",
			body: "Power Fantasy writes a Unity JSON document, serialises it compactly, and seals it with AES-128-CBC. The 128-bit key is never stored: it is derived with PBKDF2-SHA1 from a password compiled into the game, salted with the file's own first sixteen bytes, at one hundred iterations, and truncated to 128 bits. That is precisely what Unity's Rfc2898DeriveBytes does by default, which is the only reason the derivation can be reproduced outside the game at all.",
		},
		{
			title: "Sixteen bytes of header, and nothing else",
			body: "The first sixteen bytes of the file are the AES initialisation vector, and they double as the salt PBKDF2 hashes. That is the entire layout: open the file, take the first sixteen bytes, derive a key from them, decrypt everything after. There is no magic number, no version field and no length prefix — the cipher text runs to the end of the file, in whole sixteen-byte blocks, and whatever is behind it is one compact JSON object.",
		},
		{
			title: "Encryption theatre, not security",
			body: "A password that ships inside the game is not a secret, and a hundred PBKDF2 iterations is a rounding error to anything with a graphics card. The encryption is there to stop a curious player opening the save in a text editor, not to keep anything from them — which is exactly why this page can read and rewrite it. What the game does get is integrity by accident: a file that has been tampered with decrypts to noise, and the game will reject it.",
		},
		{
			title: "Why an untouched save rebuilds to the same bytes",
			body: "A CBC cipher text is a function of its initialisation vector, so re-encrypting the same document with a fresh vector produces a completely different file. That is what the original command-line tool did, and this repository keeps its output next to the save it came from: both files decrypt to byte-identical JSON and differ on disk. This editor reuses the sixteen bytes it read from the file you opened, so an untouched save comes back exactly as it was and an edited one differs only from the point of your edit onwards. That is what lets the page claim a byte-for-byte check instead of merely saying the file parsed again.",
		},
	],
	decode: async (bytes) => {
		const doc = await decryptSave(bytes);
		openedIv = headerIv(bytes);
		return doc;
	},
	encode: async (doc) => {
		if (openedIv === null) {
			throw new Error(
				"This codec rebuilds a save it was given, so it has to decode one before it can encode: no initialisation vector has been read yet.",
			);
		}
		return encryptSave(doc, openedIv);
	},
	summarise,
	actions: [
		cheat,
		cheatItems,
		cheatPassives,
		cheatInfusions,
		unlockAll,
		unlockCharacters,
		unlockCompanions,
		unlockUpgrades,
		unlockDlc,
	],
};
