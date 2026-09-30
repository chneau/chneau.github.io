/**
 * Power Fantasy (Lava Lamb Games) — `PowerFantasySave.es3`.
 *
 * Ported from a Bun CLI that could pull, decrypt, cheat and push the save. The
 * file format is:
 *
 * ```text
 * [ 16 bytes: AES initialisation vector ]
 * [ N × 16 bytes: AES-128-CBC of compact JSON ]
 * ```
 *
 * The key is never stored. It is derived the way Unity's
 * `Rfc2898DeriveBytes(string, byte[])` does by default — PBKDF2-SHA1 over a
 * password compiled into the game, salted with those same 16 header bytes, at
 * 100 iterations, truncated to a 128-bit key. Once derived, it is stock
 * AES-128-CBC in PKCS#7 padding, which is the one mode WebCrypto implements,
 * so `aesCbcDecrypt` reads a game-written save with no shim and
 * `aesCbcEncrypt` writes one the game reads back. Nothing here pads or strips
 * anything by hand.
 *
 * The plaintext is JSON in the shape Unity's own serialiser emits: a flat map
 * of save keys to `{__type, value}` records, where the type name says how to
 * read the value (`"int"`, `"bool"`, a fully qualified `System.Collections`
 * list type for the handful of keys that hold lists).
 *
 * ## The one decision worth arguing about
 *
 * A CBC cipher text is a function of its IV, so re-encrypting an unchanged
 * document with a *fresh* IV produces an entirely different file — which is
 * exactly what the original tool did, and why the repository also carries
 * `saves/PowerFantasySave-reencrypted.es3`: that file is the original tool's
 * output for the very save committed beside it, and the two differ on disk
 * while decrypting to byte-identical JSON.
 *
 * That makes "rebuild and check" a weak claim for this format, because a
 * rebuilt file can never match the input. So `decode` remembers the header it
 * read and `encode` reuses it. An untouched save then rebuilds to the exact
 * bytes it came from — the strongest statement the shared round-trip check is
 * able to make — and an edited one differs only from the point of the edit
 * onwards. Reusing the IV is also not a cryptographic sin here: the key is
 * *derived* from that IV, so the (key, IV) pair a rebuilt file carries is the
 * one the original file already published in its own header.
 */
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

/**
 * The password the game ships with.
 *
 * It is a constant in the shipped build, not a secret anyone chose, which is
 * the whole of this format's weakness — see the third note. It is named rather
 * than inlined because the codec has to be able to derive a key from something
 * other than it, so the tests can prove that the wrong password fails cleanly.
 */
export const PASSWORD = "godisdad";

/** Unity's `Rfc2898DeriveBytes` default, and this game's iteration count. */
const KDF_ITERATIONS = 100;

/** AES-128 takes a 128-bit key. */
const KEY_BYTES = 16;

/** Every AES-CBC IV is one cipher block. */
const IV_BYTES = 16;

/** A header plus at least one block of cipher text: the smallest legal file. */
const MIN_FILE_BYTES = IV_BYTES + IV_BYTES;

/**
 * One `{__type, value}` record, as the game writes it.
 *
 * `undefined` is accepted by the guard because `getAtPath` reports a key this
 * save does not have that way, and "this save has no such record" is the single
 * most common answer in this format — the game only writes a key once the
 * player has earned it.
 */
type TypedRecord = {
	readonly __type: string;
	readonly value: JsonValue;
};

const isTypedRecord = (value: JsonValue | undefined): value is TypedRecord =>
	value !== undefined &&
	isJsonObject(value) &&
	typeof value.__type === "string" &&
	value.value !== undefined;

/** The `{__type: "int", value: n}` record the game uses for every counter. */
const intRecord = (value: number): JsonValue => ({ __type: "int", value });

/**
 * A fresh IV, for the case where this codec is asked to write a save rather
 * than rebuild one — the same `randomBytes(16)` the original tool drew.
 */
const randomIv = (): Bytes => crypto.getRandomValues(new Uint8Array(IV_BYTES));

/** The 16 bytes that open every `.es3` file: IV and PBKDF2 salt in one. */
export const headerIv = (bytes: Bytes): Bytes => {
	if (bytes.length < MIN_FILE_BYTES) {
		throw new Error(
			`That file is ${bytes.length} bytes long, which is too short to be a Power Fantasy save: one opens with a 16-byte key and at least one block of cipher text.`,
		);
	}
	return bytes.slice(0, IV_BYTES);
};

/**
 * Everything that can go wrong reading a save, said once.
 *
 * Two different faults land here and they are deliberately not distinguished
 * for the reader: a wrong key makes the cipher's padding check fail (WebCrypto
 * raises `OperationError`), and even when it happens to pass — roughly one
 * chance in 256 — the bytes behind it are noise that will not parse as JSON.
 * Both are "this is not a save this codec can open", and the useful thing to
 * say about that is what to try instead.
 */
const NOT_A_SAVE =
	"That file did not decrypt to a Power Fantasy save. The password is baked into the game rather than chosen by you, so there is nothing to type — if you expected this file to load, it is probably a different game's .es3, or a save from a build whose format has moved on.";

/**
 * A JSON object, classified from `unknown`.
 *
 * `JSON.parse` of bytes that came off someone's disk is the one place in this
 * module where the type is genuinely unknown, and it is classified here rather
 * than cast at the point of use — so what leaves `decryptSave` is already a
 * document. The shared `isJsonObject` cannot do this job because it takes a
 * `JsonValue`, which is exactly what has not been established yet.
 */
const readsAsObject = (
	value: unknown,
): value is { readonly [key: string]: JsonValue } =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** The file's bytes to the document inside, with the game's password. */
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

/**
 * The document back to the game's bytes, under a chosen IV.
 *
 * Pure by construction — the IV is a parameter rather than module state — so
 * this is what a test pins the byte-exactness claim against, and it is why the
 * codec's own `encode` is the only place that has to decide *which* IV to use.
 *
 * `JSON.stringify` with no spacing is not a shortcut: the game's serialiser
 * emits compact JSON, so anything else would rebuild a file the game reads to
 * the same values from a different byte sequence, and the "unchanged saves
 * rebuild exactly" claim would quietly stop being true.
 */
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

// ---------------------------------------------------------------------------
// The save's own vocabulary
//
// Every name below was read out of `saves/PowerFantasySave.es3` rather than
// guessed. The game mints one key per thing the player can own or earn, so the
// lists are the game's catalogue, not ours, and a save that has not earned one
// yet simply has no key for it.
// ---------------------------------------------------------------------------

/** Prefix the game gives every achievement counter. */
const ACHIEVEMENT_PREFIX = "a_";

/** Prefix the game gives every blood-rune purchase. */
const BLOOD_PREFIX = "blood_";

/** Prefix of a learned passive, keyed `br_<Hero>_<Passive>`. */
const PASSIVE_PREFIX = "br_";

/** Inventory counters live under `inv/`, and the stack list is `inv/index`. */
const INVENTORY_PREFIX = "inv/";
const INVENTORY_INDEX: SavePath = [`${INVENTORY_PREFIX}index`];

/**
 * The seventeen playable heroes, alphabetical.
 *
 * Which is the order the save's own `<hero>_alchemy_infusions` keys come in,
 * and the seventeen names are exactly those keys' stems — so a hero the game
 * added later is a missing key, not a wrong one.
 */
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

/** The twenty-seven passives a hero's blood runes can open. */
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

/** The eighteen stackable items the inventory holds. */
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

/** The alchemy infusions, with the counts the original tool settled on. */
const INFUSIONS: readonly (readonly [string, number])[] = [
	["infusion_xpgain", 100],
	["infusion_critmulti", 100],
	["infusion_health", 100],
	["infusion_globaldamage", 100],
	["infusion_projectiles", 10],
];

/**
 * Achievements that unlock a hero.
 *
 * A flat list rather than a per-hero list, because the save does not record
 * which hero an achievement belongs to — the id does. Present in the fixture:
 * 62 of the 72.
 */
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

/** Blood runes that unlock a hero, and the one the fixture already has. */
const CHARACTER_BLOOD_ITEMS = ["blood_draco", "blood_mothman"] as const;

/** Achievements that unlock a companion. Four of the seven are in the fixture. */
const COMPANION_ACHIEVEMENTS = [
	"a_5companions",
	"a_beekeeper",
	"a_frogwhisperer",
	"a_gargoyle",
	"a_mimic",
	"a_ndragon",
	"a_companionmastery",
] as const;

/** The blood rune that opens companions; absent from the fixture. */
const COMPANION_BLOOD_ITEMS = ["blood_beastmaster"] as const;

/** The four characters the paid DLC adds. All nine ids are in the fixture. */
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

/**
 * The counts the original tool used.
 *
 * 99,999 is comfortably past every threshold in the game (`a_level_*` runs to
 * the high fifties, and the fishing and gambling achievements count in
 * hundreds), so it satisfies any of them rather than being the largest number
 * that happens to work today. A blood rune is a tiered purchase, and 10 is the
 * top of the track in this build.
 */
const UNLOCKED_COUNT = 99999;
const BLOOD_UNLOCKED_TIER = 10;

/** The ruby total the original `cheat` command defaulted to. */
const CHEATED_RUBIES = 9999999;

/** The stack size the original `cheat-items` command defaulted to. */
const CHEATED_STACK = 999;

// ---------------------------------------------------------------------------
// Reading the save
// ---------------------------------------------------------------------------

/**
 * The save's own keys carrying `prefix`.
 *
 * `Object.keys` here is not the mistake the codebase warns about. That warning
 * is about iterating a typed record's keys instead of its canonical list; here
 * the keys *are* the data — the game mints one `a_`-prefixed counter per
 * achievement it records — so the save is the only authority on which
 * achievements it holds, and a name table frozen at one game build would go
 * quietly stale after a patch added an achievement.
 */
const keysWithPrefix = (doc: JsonValue, prefix: string): readonly string[] =>
	isJsonObject(doc)
		? Object.keys(doc).filter((key) => key.startsWith(prefix))
		: [];

/** How many of `names` this save actually records. */
const countPresent = (doc: JsonValue, names: readonly string[]): number =>
	names.filter((name) => getAtPath(doc, [name]) !== undefined).length;

/** The `value` of an `int` record, or `undefined` if it is not one. */
const intAt = (doc: JsonValue, path: SavePath): number | undefined => {
	const record = getAtPath(doc, path);
	return isTypedRecord(record) && typeof record.value === "number"
		? record.value
		: undefined;
};

/** The length of a list record, or `undefined` if it is not one. */
const listLengthAt = (doc: JsonValue, path: SavePath): number | undefined => {
	const record = getAtPath(doc, path);
	return isTypedRecord(record) && Array.isArray(record.value)
		? record.value.length
		: undefined;
};

// ---------------------------------------------------------------------------
// Planning edits
// ---------------------------------------------------------------------------

/**
 * An edit raising the `int` record at `path` to at least `floor`, or
 * `undefined` if this save does not record that field.
 *
 * Returning nothing is the whole safety argument for these actions. `setAtPath`
 * refuses a path the save does not already have, because a key the game never
 * wrote is precisely what stops a rebuilt save from loading — and the original
 * tool, which built a fresh object and assigned into it, wrote keys the game had
 * never seen. Staging only what the file records means the workbench never
 * throws mid-render and never invents a field.
 *
 * A floor rather than an assignment, which is a deliberate departure from the
 * original tool. It wrote 99,999 into every achievement and 999 into every
 * stack, and the fixture shows what that costs: three achievements already read
 * 193,517 and one reads 100,000, and a blind write would quietly hand the player
 * *less* than they had earned. Nothing here writes a number downwards, and an
 * edit that would only lower is filtered out as the no-op it is.
 */
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

/** Drops the candidates that have nothing to write to. */
const kept = (
	candidates: readonly (SaveEdit | undefined)[],
): readonly SaveEdit[] => candidates.filter((edit) => edit !== undefined);

/**
 * The planned edits, with the no-ops removed.
 *
 * `effectiveEdits` rather than staging everything: an action that writes the
 * value already in the file is noise in the staged list, and a list full of it
 * makes the rebuild claim work it did not do. It is also what greys a button
 * out — `SaveWorkbench` disables an action whose plan is empty — so a save that
 * has already been cheated at honestly shows nothing left to do.
 */
const plan = (
	doc: JsonValue,
	candidates: readonly (SaveEdit | undefined)[],
): readonly SaveEdit[] => effectiveEdits(kept(candidates), doc);

/**
 * Rewrites `inv/index`, the stack list the game reads to know what is carried.
 *
 * The per-item `inv/<id>` counters and this list have to agree: the original
 * tool learned that the hard way, which is why it writes both. Each amount is
 * raised to the floor rather than set to it, for the same reason `raiseTo` does.
 * The list's `__type` is read off the record rather than hardcoded — Unity's
 * generic type name is long, and a copy of it is a string that can be wrong
 * after a game update while the save in front of the user is right.
 */
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

/**
 * Rewrites a hero's alchemy infusions.
 *
 * Same reasoning as the inventory: the `__type` comes off the record in the
 * save, and a hero whose key the file does not carry is left alone. The counts
 * are a proportion the game spends down, so these are written outright rather
 * than raised — the ratios are the ceiling the player is asking for.
 */
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

// ---------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------

/**
 * What is in the save, read off the save.
 *
 * Every row names a key that exists in `saves/PowerFantasySave.es3`. A summary
 * that guessed at field names across game versions would be worse than one that
 * reports what it can actually see, and every row falls back to a plain
 * "not recorded" rather than inventing a value for a key this file has not
 * earned yet.
 */
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

/**
 * The IV of the file most recently opened.
 *
 * Held here rather than in the document because it is not part of the document:
 * it is the container's header, and the document is what the inspector shows
 * and the cheats edit. It is written only after a save has decoded cleanly, and
 * `SaveWorkbench` decodes before it ever encodes, so by the time a rebuild runs
 * this holds the header of the file the user actually opened.
 */
let openedIv: Bytes | null = null;

export const powerFantasy: SaveCodec = {
	id: "power-fantasy-save-editor",
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
	encode: async (doc) => encryptSave(doc, openedIv ?? randomIv()),
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
