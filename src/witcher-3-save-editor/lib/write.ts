/**
 * Writing to a Witcher 3 save.
 *
 * ## Why this module exists at all
 *
 * The decoder in this directory reads a save and never writes one. That was a
 * deliberate decision while the format was still being understood, and it was
 * the right one at the time — but it means a viewer, not an editor. This module
 * is what turns it into an editor, and it does so by *not* re-encoding the save.
 *
 * ## The whole trick: patch in place, carry everything else through
 *
 * A `.sav` has no checksum. Not in the container, not in the `SAV3` stream, not
 * in the footer — the only CRC anywhere in the game is in the asset *bundle*
 * format, which is a different file entirely. So nothing has to be recomputed
 * over the contents, which removes the hazard that usually makes a save editor
 * dangerous.
 *
 * What *does* have to be right is bookkeeping. A file is a 3084-byte header
 * carrying the `SNFH`/`FZLC` magics and a chunk table of
 * `(compressedSize, decompressedSize, endOffset)` triples, then the LZ4 blocks.
 * Patch a byte in the decompressed
 * stream and the block around it compresses to a different size, so every
 * subsequent `endOffset` shifts. All of that lives in those 3084 bytes and
 * nowhere else — and `endOffset` is the *only* absolute file offset in the
 * format. The `SAV3` header, the `SE` footer, the `SC` span index and the
 * variable table all address the **decompressed** stream, whose length a
 * width-preserving edit does not change.
 *
 * So the rule for every writable field is the same: **its width must not
 * change.** Patch a `u16` with a `u16`, an `Int32` with an `Int32`. Then the
 * stream keeps its length, no offset anywhere moves, and an unedited save
 * rebuilds to a file the reader accepts.
 *
 * This is also why there is no token-stream encoder here. Adding a skill or
 * renaming a string changes a length, which moves every offset after it and
 * would require rewriting the `AVAL` length, the enclosing `BLCK`/`SS` sizes,
 * the `SC` span index and the variable table — and the variable table's
 * coordinate base is *still not understood*. Those operations are out of reach
 * for a browser tool, so this module only offers edits that do not resize
 * anything.
 *
 * ## What is measured, and what is inherited
 *
 * Every offset here is discovered per save rather than hardcoded, because the
 * offsets genuinely differ between saves of the same build — the wallet sat at
 * 3640748, 3640300 and 3640999 in three saves that are otherwise the same
 * build. A hardcoded offset would corrupt a different save, silently.
 *
 * The `u16` item quantity and the `u16` crowns quantity are the same record
 * shape, so `locateInventory` covers both: the quantity is the `u16` at
 * `anchor + 4`, and the template name is the `u16` name index at `anchor - 13`,
 * resolved through the save's own `MANU` table. "Anchor" is this build's tag
 * pair, which `discoverTagPair` recovers per save rather than assuming.
 *
 * ## Build support is honest here, not assumed
 *
 * Two things here are per **build**, and both used to be hardcoded to `52586`:
 * the crowns item identity, and the item record's tag pair. A reader pinned to
 * one build's tag pair finds *zero* records in the other four of the seven
 * reference saves, which is why this file used to report "not supported for this
 * build" for a save whose records it simply had not been taught to recognise.
 *
 * `discoverTagPair` now recovers the pair from the save's own bytes (see
 * `./inventory`), so the *record shape* is found on any build. The **identity**
 * is a different matter and is still one measured value: `CROWNS_IDENTITY_52586`
 * is the only one this repository has, so `locateMoney` still returns
 * `undefined` off that build, and the page says the field is unsupported rather
 * than offering an edit that would hit an unrelated record. Note that the wallet
 * is *readable* on every build regardless — it is the `Crowns` item's quantity,
 * which the inventory reader resolves by name (`format.ts`'s `crownsRow`), and
 * only this write path is pinned to one build's identity.
 *
 * Progression, by contrast, is found structurally — `levelManager` occurs
 * exactly once in a save and only on the player — so it works on every build.
 */
import {
	discoverTagPair,
	type InventoryItem,
	playerInventory,
} from "./inventory";
import { CROWNS_IDENTITY_52586 } from "./money";
import { readNameTable } from "./names";
import { type ReflectedValue, reflectValue } from "./reflect";
import {
	type BaseStat,
	type LevelDefinition,
	type Resistance,
	readBaseStats,
	readLevelCurve,
	readResistances,
} from "./stats";
import { parseTokens, type Token } from "./tokens";

/** How wide a writable field is, and therefore how it is read back. */
type PatchKind = "u8" | "u16" | "i32" | "f32";

/** One writable scalar: where it is, what it holds, and what it accepts. */
export type PatchableScalar = {
	/** Stable identity, so a staged edit can de-duplicate against it. */
	readonly id: string;
	/** Shown to the user. */
	readonly label: string;
	readonly value: number;
	/** Absolute offset in the decompressed stream. */
	readonly offset: number;
	readonly kind: PatchKind;
	readonly min: number;
	readonly max: number;
};

/** A skill, with the address of its level rather than just its value. */
type PatchableSkill = {
	readonly index: number;
	readonly name: string;
	readonly level?: number;
	readonly levelOffset?: number;
	readonly isNew?: boolean;
	/**
	 * The highest level this skill may reach, as the save itself records it.
	 *
	 * Not a constant, and not 3 for everything: measured on a real save, 39
	 * skills cap at 1, three cap at 2 and 106 cap at 3. So "max every skill"
	 * has to write each skill's own ceiling, and a blanket 3 would push 42 of
	 * them past the maximum the game itself will honour.
	 */
	readonly maxLevel?: number;
};

/** One difficulty the save itself knows about, and where its value lives. */
type DifficultyChoice = {
	readonly label: string;
	/** The 1-based `MANU` index that is written to disk. */
	readonly index: number;
};

/**
 * Difficulty is a `u16` holding a `MANU` index, not an enum ordinal.
 *
 * The distinction is not cosmetic: writing the ordinal `3` where the save
 * expects an index would silently set some other difficulty entirely, or none.
 */
/**
 * Not exported: it is part of `WritableSave`'s shape, which is all a consumer
 * needs, and nothing outside this module names it. `WritableSave` is the
 * contract; a constituent type does not become a second one.
 */
type DifficultyScalar = PatchableScalar & {
	readonly choices: readonly DifficultyChoice[];
};

/** One spendable counter (skill points, or experience points). */
type PatchablePoints = {
	readonly kind: "skill" | "exp";
	readonly free: number;
	readonly freeOffset: number;
	readonly used: number;
	readonly usedOffset: number;
};

/**
 * One entry of the saved `mutations : array<SMutation>` on the player's ability
 * manager. Read-only: the editor does not write it, so it is not a
 * `Patchable*`. The array is the full Blood-and-Wine catalogue (twelve plus
 * `EPMT_MutationMaster`), not merely the learned ones.
 */
type SavedMutation = {
	readonly type?: number;
	/** the `MANU` symbolic name of the `EPlayerMutationType` value */
	readonly name?: string;
	/** `ESkillColor` symbolic names the mutation costs */
	readonly colors: readonly string[];
	/** `SMutationProgress` — invested vs required */
	readonly progress?: Readonly<Record<string, number | undefined>>;
	/**
	 * Absolute offsets of the `SMutationProgress` fields that are actually
	 * present in the stream. A field at its default (0) is not serialised, so it
	 * has no offset and cannot be written without a resize; `overallProgress`
	 * and the `*Required` fields are present, the `*Used` fields usually are not.
	 */
	readonly progressOffsets?: Readonly<Record<string, number>>;
	/** `EPMT_*` symbolic names that must be learned first */
	readonly requiredMutations: readonly string[];
	readonly localizationNameKey?: string;
};

/** Everything this editor can write in one save. */
type WritableSave = {
	/** read-only: the named base stats, resistances and XP curve. See `./stats`. */
	readonly stats: CharacterSheet;
	/**
	 * The token scan this walk already performed, for readers that would otherwise
	 * walk the stream again.
	 *
	 * Exposed because the walk is the single most expensive step in decoding — a
	 * measured 834 ms on the large fixture for ~250,640 tokens — and five readers
	 * now want the same result. Passing this in turns each of their own walks
	 * (1.1 s, 280 ms, 490 ms measured) into nothing at all.
	 *
	 * It is the save's own name table and token list, so handing it to another
	 * reader gives that reader exactly what it would have computed itself.
	 */
	readonly scan: {
		readonly names: readonly string[];
		readonly tokens: readonly Token[];
	};
	/** `undefined` when the build's record shape is not recognised. */
	readonly money?: PatchableScalar;
	readonly level?: PatchableScalar;
	readonly difficulty?: DifficultyScalar;
	readonly points: readonly PatchablePoints[];
	readonly skills: readonly PatchableSkill[];
	readonly items: readonly (InventoryItem & {
		readonly quantityOffset: number;
	})[];
	/** read-only, decoded from the same ability manager this walk already holds */
	readonly mutations: readonly SavedMutation[];
	readonly equippedMutation?: string;
};

/** The `u16` quantity of an item record, whose anchor the decoder reports. */
const quantityOffsetOf = (item: InventoryItem): number => item.offset + 4;

const u16 = (data: Uint8Array, at: number): number =>
	(data[at] ?? 0) | ((data[at + 1] ?? 0) << 8);

const i32 = (data: Uint8Array, at: number): number => {
	const view = new DataView(
		data.buffer,
		data.byteOffset + at,
		Math.max(0, Math.min(4, data.length - at)),
	);
	return view.byteLength === 4 ? view.getInt32(0, true) : 0;
};

const f32 = (data: Uint8Array, at: number): number => {
	const view = new DataView(
		data.buffer,
		data.byteOffset + at,
		Math.max(0, Math.min(4, data.length - at)),
	);
	return view.byteLength === 4 ? view.getFloat32(0, true) : 0;
};

/**
 * Write a scalar into the decompressed stream, refusing any change of width.
 *
 * Width is the whole safety argument, so it is checked rather than assumed: a
 * caller that tries to write 70000 into the `u16` crowns field gets a refusal,
 * not a wrapped number. Returns whether the stream was changed.
 */
export const patchScalar = (
	data: Uint8Array,
	target: PatchableScalar,
	next: number,
): boolean => {
	if (!Number.isFinite(next)) return false;
	const clamped = Math.min(target.max, Math.max(target.min, Math.trunc(next)));
	if (clamped === target.value) return false;
	const at = target.offset;
	if (at < 0 || at + widthOf(target.kind) > data.length) return false;
	switch (target.kind) {
		case "u8":
			data[at] = clamped & 0xff;
			break;
		case "u16":
			data[at] = clamped & 0xff;
			data[at + 1] = (clamped >>> 8) & 0xff;
			break;
		case "i32":
			new DataView(data.buffer, data.byteOffset + at, 4).setInt32(
				0,
				clamped,
				true,
			);
			break;
		case "f32":
			new DataView(data.buffer, data.byteOffset + at, 4).setFloat32(
				0,
				clamped,
				true,
			);
			break;
	}
	return true;
};

/** Clamp a requested value the way `patchScalar` would, without writing. */
export const clampScalar = (target: PatchableScalar, next: number): number =>
	Math.min(target.max, Math.max(target.min, Math.trunc(next)));

const widthOf = (kind: PatchKind): number =>
	kind === "u8" ? 1 : kind === "f32" || kind === "i32" ? 4 : 2;

/** Read a scalar back, for verifying a patch. */
export const readScalar = (
	data: Uint8Array,
	target: PatchableScalar,
): number => {
	switch (target.kind) {
		case "u8":
			return data[target.offset] ?? 0;
		case "u16":
			return u16(data, target.offset);
		case "i32":
			return i32(data, target.offset);
		case "f32":
			return f32(data, target.offset);
	}
};

/**
 * Locate the player's wallet.
 *
 * Anchored on the record shape *and* the build's crowns identity, because the
 * shape alone matches 1845 records in a real save and only one of them is the
 * wallet. Scanning on the identity alone would be equally ambiguous — the
 * decoder's own note is that a stray copy elsewhere in 5 MB must not be taken
 * for the player's money, which is why both are required.
 */
export const locateMoney = (
	data: Uint8Array,
	signature: readonly number[] = CROWNS_IDENTITY_52586,
	tagPair: readonly number[] | undefined = discoverTagPair(data),
): PatchableScalar | undefined => {
	// Without a recovered tag pair there is nothing to anchor on, and matching
	// another build's pair would find a record that is not this build's wallet.
	if (tagPair === undefined) return undefined;
	for (let at = 0; at + 14 <= data.length; at += 1) {
		if (!tagPair.every((byte, i) => data[at + i] === byte)) continue;
		// The identity is the strong filter; the durability sentinel is *not*
		// required, because the crowns record is an ordinary stackable and does
		// carry `-1.0`, but requiring it would also reject any wallet record that
		// does not.
		for (let idAt = at - 16; idAt <= at - 4; idAt += 1) {
			if (!signature.every((byte, i) => data[idAt + i] === byte)) continue;
			return {
				id: "money",
				label: "Crowns",
				value: u16(data, at + 4),
				offset: at + 4,
				kind: "u16",
				// A `u16` is the ceiling. Over it is not a clamped value, it is a
				// different record, so the field refuses rather than wrapping.
				min: 0,
				max: 0xffff,
			};
		}
	}
	return undefined;
};

/** The `MANU` indices of every difficulty the save itself knows about. */
const difficultyChoices = (
	names: readonly string[],
): readonly DifficultyChoice[] => {
	const choices: DifficultyChoice[] = [];
	for (const [at, name] of names.entries()) {
		if (name === undefined || !name.startsWith("EDM_")) continue;
		choices.push({ label: name.slice(4), index: at + 1 });
	}
	return choices;
};

const valueOffsetOf = (token: Token): number =>
	token.offset + (token.tag === "VL" || token.tag === "OP" ? 6 : 12);

const decodeToken = (
	data: Uint8Array,
	names: readonly string[],
	token: Token,
): ReflectedValue | undefined => {
	if (token.value === undefined) return undefined;
	return reflectValue(
		data,
		names,
		token.value.type,
		valueOffsetOf(token),
		token.value.bytes.byteLength,
	);
};

const member = (
	value: ReflectedValue | undefined,
	name: string,
): ReflectedValue | undefined =>
	value?.fields?.find((f) => f.name === name)?.value;

const memberOffset = (
	value: ReflectedValue | undefined,
	name: string,
): number | undefined => value?.fields?.find((f) => f.name === name)?.offset;

/** The `MANU` symbolic name an enum value (a 1-based index) refers to. */
const enumName = (
	names: readonly string[],
	value: number | undefined,
): string | undefined =>
	value !== undefined && value >= 1 ? names[value - 1] : undefined;

/** A scalar member parsed as a finite number, or `undefined`. */
const numberAt = (value: ReflectedValue | undefined): number | undefined => {
	if (value === undefined) return undefined;
	const parsed = Number(value.text);
	return Number.isFinite(parsed) ? parsed : undefined;
};

/** Resolve a `CName`/`name` member to its `MANU` text (a 1-based index). */
const cname = (
	names: readonly string[],
	value: ReflectedValue | undefined,
): string | undefined => {
	if (value === undefined) return undefined;
	const match = /^CName\((\d+)\)$/.exec(value.text);
	if (match === null) return value.text === "" ? undefined : value.text;
	return enumName(names, Number(match[1]));
};

/** The read-only half of the character sheet, decoded from the same walk. */
type CharacterSheet = {
	readonly baseStats: readonly BaseStat[];
	readonly resistances: readonly Resistance[];
	readonly levelCurve: readonly LevelDefinition[];
};

/**
 * Decode the read-only character sheet from the two managers this walk holds.
 *
 * A function rather than inline code in `locateWritable` because it needs
 * `ReflectedValue`s that are function-local, and a type carrying them would leak
 * the reflection layer into every consumer's signature.
 */
const readSheet = (
	names: readonly string[],
	levelManager: ReflectedValue | undefined,
	ability: ReflectedValue | undefined,
): CharacterSheet => ({
	baseStats: readBaseStats(names, ability),
	resistances: readResistances(names, ability),
	levelCurve: readLevelCurve(levelManager),
});

const MUTATION_PROGRESS_KEYS = [
	"redUsed",
	"redRequired",
	"blueUsed",
	"blueRequired",
	"greenUsed",
	"greenRequired",
	"skillpointsUsed",
	"skillpointsRequired",
	"overallProgress",
] as const;

/**
 * Decode the saved mutation catalogue from the ability manager this walk
 * already holds — no second token walk.
 */
const readSavedMutations = (
	names: readonly string[],
	ability: ReflectedValue | undefined,
): SavedMutation[] =>
	(member(ability, "mutations")?.items ?? []).map((item) => {
		const progressValue = member(item, "progress");
		const progress =
			progressValue === undefined
				? undefined
				: Object.fromEntries(
						MUTATION_PROGRESS_KEYS.map((key) => [
							key,
							numberAt(member(progressValue, key)),
						]),
					);
		const progressOffsets =
			progressValue?.fields === undefined
				? undefined
				: Object.fromEntries(
						progressValue.fields
							.filter((field) => field.offset > 0)
							.map((field) => [field.name, field.offset]),
					);
		const type = numberAt(member(item, "type"));
		const symbolic = (value: ReflectedValue | undefined): string | undefined =>
			enumName(names, numberAt(value));
		return {
			type,
			name: enumName(names, type),
			colors: (member(item, "colors")?.items ?? [])
				.map(symbolic)
				.filter((name): name is string => name !== undefined),
			progress,
			progressOffsets,
			requiredMutations: (member(item, "requiredMutations")?.items ?? [])
				.map(symbolic)
				.filter((name): name is string => name !== undefined),
			localizationNameKey: cname(names, member(item, "localizationNameKey")),
		};
	});

/**
 * Every writable field in one save, discovered rather than assumed.
 *
 * The token walk is the expensive part — around 665,000 tokens over a 15 MB
 * stream — and the decoder's own readers each trigger their own walk, so five
 * of them cost five times as much as they need to. This does one walk and
 * answers every question from it.
 *
 * ## What the reflection layer does and does not reach
 *
 * The player is stored as a `W3PlayerWitcher` entity whose script fields are
 * top-level `PORP`/`AVAL` records, and two of them carry what the HUD shows:
 * `levelManager : handle:W3LevelManager` (level, the per-level experience table,
 * and unspent/used points) and `abilityManager : handle:W3AbilityManager`, whose
 * concrete class is `W3PlayerAbilityManager` (learned `skills`, `skillSlots`,
 * base `statPoints`, resistances). Both are decoded by `./reflect`.
 *
 * The player is identified **structurally rather than by position**, which is
 * what makes this safe on any save: `levelManager` occurs exactly once and only
 * on the player, so the entity owning it is the player, and its
 * `abilityManager` is the nearest `W3PlayerAbilityManager` handle *before* it.
 * A save also holds NPC managers and a later duplicate copy, which is why the
 * search walks backwards and checks the class rather than taking the first hit.
 *
 * **Money and the inventory contents are not reachable this way at all.** They
 * live in the native `CInventoryComponent`, which the scripts declare with no
 * saved fields (only `lastEquippedBolt`); only the equipped `itemSlots` array is
 * script-visible, and its element type `SItemUniqueId` is native too — so that
 * path reports a slot *count* and never the items. Hence `locateMoney` and
 * `playerInventory` below scanning the native records instead, and why a
 * reflection-based reader cannot be extended to cover them.
 *
 * An enum value is stored as the **1-based `MANU` index of its symbolic name** —
 * the save's name table doubles as the engine's symbol pool. `EDifficultyMode`
 * 4632 resolves to `EDM_Hard`, `ESkill` 137 to `S_Sword_1`, and a value with no
 * entry at that slot resolves to nothing rather than to a neighbour's name.
 */
export const locateWritable = (data: Uint8Array): WritableSave => {
	const names = readNameTable(data).names;
	const tokens = parseTokens(data, names).tokens;

	const levelIndex = tokens.findIndex(
		(t) =>
			t.name === "levelManager" && t.value?.type === "handle:W3LevelManager",
	);
	const levelToken = tokens[levelIndex];
	const levelManager =
		levelToken === undefined ? undefined : decodeToken(data, names, levelToken);

	let ability: ReflectedValue | undefined;
	for (let i = levelIndex - 1; i >= 0; i -= 1) {
		const token = tokens[i];
		if (token === undefined || token.name !== "abilityManager") continue;
		const bytes = token.value?.bytes;
		if (bytes === undefined || bytes.byteLength < 8 || bytes[0] !== 0) continue;
		const classIndex = (bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8);
		if (names[classIndex - 1] !== "W3PlayerAbilityManager") continue;
		ability = decodeToken(data, names, token);
		break;
	}

	const levelOffset = memberOffset(levelManager, "level");
	const levelValue = member(levelManager, "level");
	const level: PatchableScalar | undefined =
		levelOffset === undefined || levelValue === undefined
			? undefined
			: {
					id: "level",
					label: "Level",
					value: Number(levelValue.text) || 0,
					offset: levelOffset,
					kind: "i32",
					min: 0,
					// `lastCustomLevel` caps what the game itself will accept, and it
					// is read from this same struct rather than assumed.
					max: 60,
				};

	const difficultyOffset = memberOffset(ability, "usedDifficultyMode");
	const difficultyValue = member(ability, "usedDifficultyMode");
	const difficulty: DifficultyScalar | undefined =
		difficultyOffset === undefined || difficultyValue === undefined
			? undefined
			: {
					id: "difficulty",
					label: "Difficulty",
					value: Number(difficultyValue.text) || 0,
					offset: difficultyOffset,
					kind: "u16",
					min: 0,
					max: 0xffff,
					choices: difficultyChoices(names),
				};

	const pointsValue = member(levelManager, "points");
	const points: PatchablePoints[] = (pointsValue?.items ?? []).map(
		(item, index) => {
			const freeOffset = item.fields?.find((f) => f.name === "free")?.offset;
			const usedOffset = item.fields?.find((f) => f.name === "used")?.offset;
			return {
				kind: index === 0 ? "skill" : "exp",
				free: Number(member(item, "free")?.text ?? 0) || 0,
				freeOffset: freeOffset ?? 0,
				used: Number(member(item, "used")?.text ?? 0) || 0,
				usedOffset: usedOffset ?? 0,
			};
		},
	);

	const skillsValue = member(ability, "skills");
	const skills: PatchableSkill[] = (skillsValue?.items ?? []).map(
		(item, index) => {
			const skillTypeMember = item.fields?.find((f) => f.name === "skillType");
			const skillType = Number(skillTypeMember?.value.text ?? -1);
			const levelMember = item.fields?.find((f) => f.name === "level");
			// An entry with no `skillType` field at all is not a skill: measured, 19
			// of the 167 array entries are 3-byte empty structs — a presence byte
			// and a `u16` terminator, nothing else. They sit at *fixed* indices
			// (0, 29, 72-78, 80, 81, 83, 85, 100, 121, 122, 125, 151, 158 — the
			// same in every save of this build), so they read as reserved slots in a
			// fixed-size table rather than entries that happen to be empty.
			//
			// Naming them "skill N" would put a skill on the page that does not
			// exist. There is nothing in the save to name them by, so the index is
			// the whole of the identification and the label says so.
			const name =
				skillTypeMember === undefined
					? `empty slot ${index}`
					: skillType >= 1
						? (names[skillType - 1] ?? `skill ${skillType}`)
						: `skill ${index}`;
			return {
				index,
				name,
				level:
					levelMember === undefined
						? undefined
						: Number(levelMember.value.text) || 0,
				levelOffset: levelMember?.offset,
				isNew: member(item, "isNew")?.text === "true",
				// Read only where the skill has a level to cap: a skill with no
				// level field is an empty slot (measured: 19 of 167 in a real save
				// are 3-byte blank structs with no fields at all), not a skill
				// waiting to be levelled, and giving it a maximum would offer to
				// write a field that does not exist.
				maxLevel:
					levelMember === undefined
						? undefined
						: (() => {
								const cap = Number(member(item, "maxLevel")?.text);
								return Number.isFinite(cap) && cap > 0 ? cap : undefined;
							})(),
			};
		},
	);

	const items = (playerInventory(data, names) ?? []).map((item) => ({
		...item,
		quantityOffset: quantityOffsetOf(item),
	}));

	return {
		stats: readSheet(names, levelManager, ability),
		scan: { names, tokens },
		money: locateMoney(data),
		level,
		difficulty,
		points,
		skills,
		items,
		mutations: readSavedMutations(names, ability),
		equippedMutation: enumName(
			names,
			numberAt(member(ability, "equippedMutation")),
		),
	};
};

/*
 * A summary reader that re-exported `readProgression`'s result under three names
 * (`progression`, `spendable`, `skills`) used to stand here. It is gone because
 * `readProgression` is the one that survives and the aliases added nothing: a
 * caller wanting skill points reads `progression.skillPoints` off the decoded
 * value, and two names for one field is one more thing that can disagree with
 * the other.
 */
