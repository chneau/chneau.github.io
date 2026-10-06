/**
 * The player's derived character sheet: resistances, base stats and the
 * experience curve.
 *
 * All three live on the two script objects `locateWritable` already decodes —
 * `abilityManager : handle:W3AbilityManager` (concrete class
 * `W3PlayerAbilityManager`) and `levelManager : handle:W3LevelManager` — so
 * nothing here needs a second token walk or a new parser. This module reads the
 * reflected values those walks already hold and gives them names.
 *
 * ## Nothing here is written
 *
 * Every field is read-only, and that is a property of the bytes rather than a
 * choice. `statPoints` is an `array<SBaseStat>` and `resistStats` an
 * `array<SResistanceValue>` on the ability manager: the engine recomputes the
 * displayed values from the character's *allocated points*, and a record whose
 * `current` disagrees with the allocations that produced it is exactly the kind
 * of edit ADR-0007 exists to keep out of reach. The characters' four core
 * attributes — Might, Agility, Sign Power, Courage — are **not here at all**:
 * they live on `charStats : handle:CCharacterStats`, which reflects as an empty
 * 11-byte class because its fields are engine-native and unserialised by name.
 * Reading them is blocked on decoding that native struct, so no row here claims
 * otherwise.
 *
 * ## An enum is a name-table index, and the index differs per build
 *
 * `SBaseStat.type` and `SResistanceValue.type` are **1-based indices into the
 * save's own `MANU` table**, not enum ordinals. Measured across the two fixtures:
 * `CDS_PhysicalRes` is index 90 on one and 240 on the other, for the same
 * resistance. An ordinal would resolve to the wrong name on one of them, so every
 * name here goes through the save's table — the same rule `write.ts` follows for
 * `ESkill` and `EDifficultyMode`.
 */

import type { ReflectedValue } from "./reflect";

/** One `SBaseStat`: a named pool with a current and a maximum. */
export type BaseStat = {
	/** the `EBaseCharacterStats` symbolic name, or `null` when unresolvable */
	readonly name: string | null;
	readonly current: number | null;
	readonly max: number | null;
};

/**
 * One `SResistanceValue`: a named damage type and the multipliers applied to it.
 *
 * `percent` and `points` are the two halves the engine keeps: the `percents`
 * multiplier is the character's resistance as a fraction (0.25 = 25%), and
 * `points` is the allocation feeding it. Which one the game shows depends on the
 * damage type, and that choice is not in the save, so both are reported.
 */
export type Resistance = {
	/** the `ECharacterDefenseStats` symbolic name, or `null` */
	readonly name: string | null;
	/** `percents.valueBase`, the resistance as a fraction of incoming damage */
	readonly percent: number | null;
	/** `points.valueBase`, the allocation behind it */
	readonly points: number | null;
};

/** One entry of the saved `levelDefinitions` XP curve. */
export type LevelDefinition = {
	/** the level this row describes; `-1` is the curve's sentinel row */
	readonly level: number;
	/** cumulative experience required to *be* this level */
	readonly requiredTotalExp: number | null;
	/** skill points granted on reaching it */
	readonly addedSkillPoints: number | null;
	/**
	 * Experience one level costs, once the curve runs out.
	 *
	 * On the sentinel row (`level === -1`) this is the **per-level increment for
	 * levels above the table**, which is what makes New Game+ levels computable
	 * from the save alone. Measured: the sentinel holds `2000`, the table's last
	 * explicit row is level 50 at `requiredTotalExp = 84000`, and a level-55
	 * character's `experience.used` is exactly `84000 + 5 × 2000 = 94000` — which
	 * is the identity `experienceToNextLevel` checks, so the synthesis is the
	 * save's own arithmetic rather than a curve fit.
	 *
	 * `1` on every other row, which is why it was easy to leave out: it looks like
	 * a constant until the table ends.
	 */
	readonly requiredExp: number | null;
};

/** First member of a struct/object value with this name. */
const member = (
	value: ReflectedValue | undefined,
	name: string,
): ReflectedValue | undefined =>
	value?.fields?.find((field) => field.name === name)?.value;

/** A scalar member parsed as a finite number, or `undefined`. */
const scalar = (
	value: ReflectedValue | undefined,
	name: string,
): number | undefined => {
	const found = member(value, name);
	if (found === undefined) return undefined;
	const parsed = Number(found.text);
	return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * The symbolic name a 1-based `MANU` index refers to, or `undefined`.
 *
 * An enum value with no entry at that slot resolves to nothing rather than to a
 * neighbour's name — a save's table is its own symbol pool, and a name from a
 * different build's table would be a plausible lie.
 */
const enumName = (
	names: readonly string[],
	value: number | undefined,
): string | undefined =>
	value !== undefined && value >= 1 ? names[value - 1] : undefined;

/** `null` rather than `undefined`: the document's own absent convention. */
const orNull = (value: number | undefined): number | null =>
	value === undefined ? null : value;

/** The `statPoints : array<SBaseStat>` list, named. */
export const readBaseStats = (
	names: readonly string[],
	ability: ReflectedValue | undefined,
): readonly BaseStat[] =>
	(member(ability, "statPoints")?.items ?? []).map((item) => {
		const type = scalar(item, "type");
		return {
			name: enumName(names, type) ?? null,
			current: orNull(scalar(item, "current")),
			max: orNull(scalar(item, "max")),
		};
	});

/**
 * The `resistStats : array<SResistanceValue>` list, named.
 *
 * Only the player's own resistances — the second list on the same manager,
 * `resistStatsItems`, holds the per-item modifiers and is not the character's
 * sheet. It is left unread deliberately: 32 entries whose element type is a
 * nested array, and nothing in the save says which item each modifies.
 */
export const readResistances = (
	names: readonly string[],
	ability: ReflectedValue | undefined,
): readonly Resistance[] =>
	(member(ability, "resistStats")?.items ?? []).map((item) => {
		const type = scalar(item, "type");
		return {
			name: enumName(names, type) ?? null,
			percent: orNull(scalar(member(item, "percents"), "valueBase")),
			points: orNull(scalar(member(item, "points"), "valueBase")),
		};
	});

/**
 * The whole `levelDefinitions` XP curve, in the save's own order.
 *
 * It is in the file because the engine loads the curve from the game's data at
 * load time and then re-saves it verbatim, which is why a save carries a copy of
 * a table the game could have looked up. Row `n` is not level `n`: index 0 is a
 * sentinel row (`number = -1`), so the rows are keyed by their own `number` and
 * not by position — see the lookup in `experienceToNextLevel`.
 *
 * Rows are read as they are rather than by count, and a row missing a field is
 * `null` rather than zero, because the writer omits a value at its default: the
 * sentinel row has no `requiredTotalExp` in one fixture and `2000` in another.
 */
export const readLevelCurve = (
	levelManager: ReflectedValue | undefined,
): readonly LevelDefinition[] =>
	(member(levelManager, "levelDefinitions")?.items ?? []).map((item) => ({
		level: scalar(item, "number") ?? -1,
		requiredTotalExp: orNull(scalar(item, "requiredTotalExp")),
		addedSkillPoints: orNull(scalar(item, "addedSkillPoints")),
		requiredExp: orNull(scalar(item, "requiredExp")),
	}));

/**
 * The curve row for one level, located by the row's own `number`.
 *
 * Keyed by `number` rather than by index because the curve's first row is a
 * sentinel, so `curve[level]` is off by one against `level` on both fixtures —
 * a lookup by index silently reports the wrong level's requirement, which is
 * the kind of off-by-one that typechecks and looks plausible.
 */
const levelDefinitionFor = (
	curve: readonly LevelDefinition[],
	level: number,
): LevelDefinition | undefined =>
	curve.find((definition) => definition.level === level);

/**
 * Cumulative experience required to *be* `level`, synthesising past the table.
 *
 * The saved curve stops at level 50; a New Game+ character goes beyond it, and
 * a lookup that only found explicit rows returned `null` for every such save —
 * which the summary rendered as "not derivable" for three of the seven reference
 * saves, all at level 55.
 *
 * The sentinel row (`level === -1`) is what the game inserts for exactly this:
 * its `requiredExp` is the per-level increment **above** the table, so
 * `requiredTotalExp(L) = requiredTotalExp(last) + (L - last) × sentinel.requiredExp`.
 * Checked against the save rather than assumed: a level-55 character's
 * `experience.used` is `84000 + 5 × 2000 = 94000` exactly, which is the identity
 * the caller verifies.
 *
 * `null` when the table has no explicit row above 0, no sentinel, or the level is
 * *below* the table (which would mean a gap, not an extension).
 */
const requiredTotalExpAt = (
	curve: readonly LevelDefinition[],
	level: number,
): number | null => {
	const explicit = levelDefinitionFor(curve, level);
	if (explicit !== undefined) return explicit.requiredTotalExp;
	if (level <= 0) return null;
	const sentinel = curve.find(
		(definition) => definition.level < 0 && definition.requiredExp !== null,
	);
	if (sentinel === undefined || sentinel.requiredExp === null) return null;
	let highest: LevelDefinition | undefined;
	for (const definition of curve) {
		if (definition.level <= 0 || definition.requiredTotalExp === null) continue;
		if (highest === undefined || definition.level > highest.level) {
			highest = definition;
		}
	}
	if (highest === undefined || highest.requiredTotalExp === null) return null;
	if (level <= highest.level) return null;
	return (
		highest.requiredTotalExp + (level - highest.level) * sentinel.requiredExp
	);
};

/**
 * Experience still owed before the next level, or `null` when it cannot be
 * derived.
 *
 * Derived from three things the save carries, and **derived on purpose**: this
 * number is not in the file, so putting it in the document would give the
 * projection a field that no byte can confirm and that the round-trip check
 * would then be comparing against itself.
 *
 * The relation is exact on both fixtures: the experience counter's `used` field
 * equals the current level's `requiredTotalExp` (6000 at level 7, 3000 at level
 * 4), so the counter's `free` field is the experience banked *within* the current
 * level, and what remains is the next level's cumulative requirement less the
 * total already earned. `null` rather than a guess whenever any of those three
 * facts is missing, or when `used` does not match the curve — the identity is
 * what makes this arithmetic sound, so it is checked rather than assumed.
 */
export const experienceToNextLevel = (
	curve: readonly LevelDefinition[],
	level: number | null,
	// `used` is nullable because the document reports `null` when the save carries
	// no `used` field at all — the same rule as `free`. A caller must not fold that
	// to `0` and compare, which would read as "the counter disagrees with the
	// curve" rather than "this save does not carry the field".
	experience: { free: number | null; used: number | null } | null,
): number | null => {
	if (
		level === null ||
		experience === null ||
		experience.free === null ||
		experience.used === null
	) {
		return null;
	}
	// `requiredTotalExpAt`, not the raw row: past level 50 the table has no row and
	// the value is synthesised from the sentinel. Both ends use it, so the current
	// level's requirement cannot come from one source and the next level's from
	// another.
	const current = requiredTotalExpAt(curve, level);
	const next = requiredTotalExpAt(curve, level + 1);
	if (current === null || next === null) return null;
	if (experience.used !== current) return null;
	return Math.max(0, next - current - experience.free);
};
