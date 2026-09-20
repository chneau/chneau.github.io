/**
 * Skill and knowledge editing, driven by the 100% reference data.
 *
 * Ported from `src/maximize.ts` of the `testing-decrypt-crimson-desert-savegame`
 * project. That project established the thing that matters here: the skill tree
 * is derived from *knowledge entries*, not from `_skillLearnSaveDataList`. A save
 * with the entries but no skill list at all still shows every skill unlocked,
 * and injecting the list into a save that never had it wrote type indices the
 * game could not resolve. So this module only ever touches knowledge entries.
 */

import type { DecodedSave } from "./container";
import {
	knowledgeKeysTable,
	referenceLevelsTable,
	skillKeysTable,
	skillLearnTable,
} from "./data";
import { describeError } from "./errors";
import {
	applyKnowledgeChange,
	type KnowledgeTarget,
	type LearnedRelevel,
} from "./knowledge-bulk";
import { readKnowledge } from "./knowledge-reader";

/** Which slice of the reference a change mirrors. */
export type SkillMode = "skills" | "knowledge" | "stats";

/** One explicit level override, on top of what the mode's reference sets. */
type SkillLevelEdit = {
	key: number;
	level: number;
};

type SkillGroup = "skillTree" | "abilities";

export type SkillEntry = {
	key: number;
	name: string;
	group: SkillGroup;
	/** Level to mirror from the 100% reference, when it has the key. */
	referenceLevel: number | null;
	/** Level in the open save; null when the entry is absent (unlearned). */
	currentLevel: number | null;
};

export type SkillDescription = {
	entries: SkillEntry[];
	/** Knowledge entries present in the save, and how many are learned. */
	knowledgeEntries: number;
	learnedEntries: number;
	skillTotal: number;
	skillsMissing: number;
	/** Per-mode plan against the open save, with no overrides applied. */
	modes: Record<SkillMode, SkillModePlan>;
	error: string | null;
};

export type SkillChange = {
	mode: SkillMode;
	levels?: SkillLevelEdit[];
};

/** What a mode would do to the open save, for the panel to show up front. */
type SkillModePlan = {
	mode: SkillMode;
	/** Keys the mode targets. */
	targets: number;
	/** Targets the save does not have yet, so they get injected. */
	injected: number;
	/** Targets that are present but sit at a different level. */
	patched: number;
	/** Present at level 0 and brought back up to a learned level. */
	relearned: number;
};

/**
 * The nine knowledge keys behind health / stamina / spirit, three variants
 * each. Their true caps are 12 / 14 / 18 in the reference — not 99, which the
 * game clamps away.
 */
const STAT_KEYS = [
	1005839, 1005840, 1005841, 1005842, 1005843, 1005844, 1005845, 1005846,
	1005847,
];

/** Level given to knowledge the reference has no entry for. */
const DEFAULT_LEVEL = 5;

type SkillReference = {
	/** knowledge key -> reference level */
	levels: Map<number, number>;
	/** skill-backing key -> level to write */
	skillTargets: Map<number, number>;
	/** skill-backing keys, ascending */
	skillKeys: number[];
	/** the subset of `skillKeys` the skill-learn list references */
	treeKeys: Set<number>;
	/** every known knowledge key, ascending */
	allKeys: number[];
	names: Map<number, string>;
	statKeys: number[];
};

let cachedReference: Promise<SkillReference> | undefined;

const loadSkillReference = async (): Promise<SkillReference> => {
	const [learn, extra, reference, knowledge] = await Promise.all([
		skillLearnTable(),
		skillKeysTable(),
		referenceLevelsTable(),
		knowledgeKeysTable(),
	]);

	const levels = new Map<number, number>();
	for (const [key, level] of Object.entries(reference)) {
		levels.set(Number(key), level);
	}
	const names = new Map<number, string>();
	for (const entry of knowledge) {
		names.set(
			entry.key,
			entry.display_name ?? entry.name ?? `Knowledge ${entry.key}`,
		);
	}

	// The 83 skill-learn keys mirror the reference where it has them, then the
	// 138 Elemental / life / mount entries join in at their own level — those are
	// not in the skill-learn list at all, which is why injecting only the 83 left
	// parts of the tree missing in game.
	const skillTargets = new Map<number, number>();
	for (const entry of learn) {
		const level = levels.get(entry.key);
		if (level !== undefined) skillTargets.set(entry.key, level);
	}
	for (const entry of extra) {
		if (!skillTargets.has(entry.key)) {
			skillTargets.set(entry.key, entry.level ?? 1);
		}
	}

	const allKeys = new Set<number>(levels.keys());
	for (const entry of knowledge) allKeys.add(entry.key);

	return {
		levels,
		skillTargets,
		skillKeys: [...skillTargets.keys()].sort((a, b) => a - b),
		treeKeys: new Set(learn.map((entry) => entry.key)),
		allKeys: [...allKeys].sort((a, b) => a - b),
		names,
		statKeys: STAT_KEYS,
	};
};

const skillReference = (): Promise<SkillReference> => {
	cachedReference ??= loadSkillReference();
	return cachedReference;
};

/**
 * Resolve the keys a mode targets and the level each should end up at.
 * `skills` covers the keys that back a skill, `stats` the nine stat keys, and
 * `knowledge` every key the reference knows. Explicit `levels` are layered on
 * top, so the same function describes a plan and applies it.
 */
const modeTargets = (
	reference: SkillReference,
	change: SkillChange,
): KnowledgeTarget[] => {
	const targets = new Map<number, number>();
	if (change.mode === "knowledge") {
		for (const key of reference.allKeys) {
			targets.set(key, reference.levels.get(key) ?? DEFAULT_LEVEL);
		}
	} else if (change.mode === "stats") {
		for (const key of reference.statKeys) {
			targets.set(key, reference.levels.get(key) ?? 1);
		}
	} else {
		for (const [key, level] of reference.skillTargets) targets.set(key, level);
	}
	for (const edit of change.levels ?? []) {
		targets.set(edit.key, edit.level);
	}
	return [...targets]
		.map(([key, level]) => ({ key, level }))
		.sort((a, b) => a.key - b.key);
};

/**
 * `knowledge` mirrors the reference for everything already learned, so its plan
 * counts differ from its target list. Every other mode touches targets only.
 */
const relevelFor = (
	reference: SkillReference,
	mode: SkillMode,
): LearnedRelevel | undefined =>
	mode === "knowledge"
		? { reference: reference.levels, fallback: DEFAULT_LEVEL }
		: undefined;

/** Count what a mode would insert, re-level and bring back from level 0. */
const summarizeMode = (
	reference: SkillReference,
	mode: SkillMode,
	current: Map<number, number>,
): SkillModePlan => {
	const targets = modeTargets(reference, { mode });
	const desired = new Map(
		targets.map((entry) => [entry.key, entry.level] as const),
	);
	const relevel = relevelFor(reference, mode);
	if (relevel) {
		for (const [key, level] of current) {
			if (level >= 1 && !desired.has(key)) {
				desired.set(key, relevel.reference.get(key) ?? relevel.fallback);
			}
		}
	}
	let injected = 0;
	let patched = 0;
	let relearned = 0;
	for (const [key, level] of desired) {
		const before = current.get(key);
		if (before === undefined) {
			injected += 1;
			continue;
		}
		if (before === level) continue;
		patched += 1;
		if (before === 0 && level >= 1) relearned += 1;
	}
	return { mode, targets: targets.length, injected, patched, relearned };
};

const emptyPlan = (mode: SkillMode): SkillModePlan => ({
	mode,
	targets: 0,
	injected: 0,
	patched: 0,
	relearned: 0,
});

/** Read the open save's knowledge against the reference skill list. */
export const describeSkills = async (
	save: DecodedSave,
): Promise<SkillDescription> => {
	const reference = await skillReference();
	try {
		const records = readKnowledge(save.rawPayload);
		const current = new Map(
			records.map((record) => [record.key, record.level] as const),
		);
		const entries: SkillEntry[] = reference.skillKeys.map((key) => ({
			key,
			name: reference.names.get(key) ?? `Knowledge ${key}`,
			group: reference.treeKeys.has(key) ? "skillTree" : "abilities",
			referenceLevel: reference.levels.get(key) ?? null,
			currentLevel: current.get(key) ?? null,
		}));
		return {
			entries,
			knowledgeEntries: records.length,
			learnedEntries: records.filter((record) => record.level >= 1).length,
			skillTotal: entries.length,
			skillsMissing: entries.filter((entry) => (entry.currentLevel ?? 0) < 1)
				.length,
			modes: {
				skills: summarizeMode(reference, "skills", current),
				knowledge: summarizeMode(reference, "knowledge", current),
				stats: summarizeMode(reference, "stats", current),
			},
			error: null,
		};
	} catch (error) {
		return {
			entries: [],
			knowledgeEntries: 0,
			learnedEntries: 0,
			skillTotal: reference.skillKeys.length,
			skillsMissing: 0,
			modes: {
				skills: emptyPlan("skills"),
				knowledge: emptyPlan("knowledge"),
				stats: emptyPlan("stats"),
			},
			error: `Skill editing is unavailable for this save: ${describeError(
				error,
			)}`,
		};
	}
};

/**
 * Apply a skill / knowledge / stat change. `stats` touches only the nine stat
 * keys; `skills` only the keys that back a skill; `knowledge` injects every
 * known key and mirrors the reference level for everything already learned.
 * Explicit `levels` overrides are layered on top of the mode's targets.
 */
export const applySkills = async (
	sourceBytes: Uint8Array,
	change: SkillChange,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const reference = await skillReference();
	const knowledgeTargets = modeTargets(reference, change);

	return applyKnowledgeChange(sourceBytes, {
		targets: knowledgeTargets,
		relevel: relevelFor(reference, change.mode),
	}).then(([bytes, audit]) => [
		bytes,
		{
			...audit,
			mode: change.mode,
			requested_keys: knowledgeTargets.length,
			overrides: change.levels?.length ?? 0,
		},
	]);
};
