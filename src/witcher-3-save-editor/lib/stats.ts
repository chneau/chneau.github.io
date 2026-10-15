import type { ReflectedValue } from "./reflect";

export type BaseStat = {
	readonly name: string | null;
	readonly current: number | null;
	readonly max: number | null;
};

export type Resistance = {
	readonly name: string | null;
	readonly percent: number | null;
	readonly points: number | null;
};

export type LevelDefinition = {
	readonly level: number;
	readonly requiredTotalExp: number | null;
	readonly addedSkillPoints: number | null;
	readonly requiredExp: number | null;
};

const member = (
	value: ReflectedValue | undefined,
	name: string,
): ReflectedValue | undefined =>
	value?.fields?.find((field) => field.name === name)?.value;

const scalar = (
	value: ReflectedValue | undefined,
	name: string,
): number | undefined => {
	const found = member(value, name);
	if (found === undefined) return undefined;
	const parsed = Number(found.text);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const enumName = (
	names: readonly string[],
	value: number | undefined,
): string | undefined =>
	value !== undefined && value >= 1 ? names[value - 1] : undefined;

const orNull = (value: number | undefined): number | null =>
	value === undefined ? null : value;

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

export const readLevelCurve = (
	levelManager: ReflectedValue | undefined,
): readonly LevelDefinition[] =>
	(member(levelManager, "levelDefinitions")?.items ?? []).map((item) => ({
		level: scalar(item, "number") ?? -1,
		requiredTotalExp: orNull(scalar(item, "requiredTotalExp")),
		addedSkillPoints: orNull(scalar(item, "addedSkillPoints")),
		requiredExp: orNull(scalar(item, "requiredExp")),
	}));

const levelDefinitionFor = (
	curve: readonly LevelDefinition[],
	level: number,
): LevelDefinition | undefined =>
	curve.find((definition) => definition.level === level);

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

export const experienceToNextLevel = (
	curve: readonly LevelDefinition[],
	level: number | null,
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
	const current = requiredTotalExpAt(curve, level);
	const next = requiredTotalExpAt(curve, level + 1);
	if (current === null || next === null) return null;
	if (experience.used !== current) return null;
	return Math.max(0, next - current - experience.free);
};
