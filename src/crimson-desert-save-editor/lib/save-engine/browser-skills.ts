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

export type SkillMode = "skills" | "knowledge" | "stats";

type SkillLevelEdit = {
	key: number;
	level: number;
};

type SkillGroup = "skillTree" | "abilities";

export type SkillEntry = {
	key: number;
	name: string;
	group: SkillGroup;
	referenceLevel: number | null;
	currentLevel: number | null;
};

export type SkillDescription = {
	entries: SkillEntry[];
	knowledgeEntries: number;
	learnedEntries: number;
	skillTotal: number;
	skillsMissing: number;
	modes: Record<SkillMode, SkillModePlan>;
	error: string | null;
};

export type SkillChange = {
	mode: SkillMode;
	levels?: SkillLevelEdit[];
};

type SkillModePlan = {
	mode: SkillMode;
	targets: number;
	injected: number;
	patched: number;
	relearned: number;
};

const STAT_KEYS = [
	1005839, 1005840, 1005841, 1005842, 1005843, 1005844, 1005845, 1005846,
	1005847,
];

const DEFAULT_LEVEL = 5;

type SkillReference = {
	levels: Map<number, number>;
	skillTargets: Map<number, number>;
	skillKeys: number[];
	treeKeys: Set<number>;
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

const relevelFor = (
	reference: SkillReference,
	mode: SkillMode,
): LearnedRelevel | undefined =>
	mode === "knowledge"
		? { reference: reference.levels, fallback: DEFAULT_LEVEL }
		: undefined;

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
