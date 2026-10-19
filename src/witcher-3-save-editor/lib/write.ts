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

type PatchKind = "u8" | "u16" | "i32" | "f32";

export type PatchableScalar = {
	readonly id: string;
	readonly label: string;
	readonly value: number;
	readonly offset: number;
	readonly kind: PatchKind;
	readonly min: number;
	readonly max: number;
};

type PatchableSkill = {
	readonly name: string;
	readonly type?: number;
	readonly level?: number;
	readonly levelOffset?: number;
	readonly isNew?: boolean;
	readonly maxLevel?: number;
	readonly abilityName?: string;
	readonly isCoreSkill: boolean;
};

type PatchableSkillSlot = {
	readonly id: number;
	readonly group: number;
	readonly unlockedOnLevel: number;
	readonly unlocked: boolean;
	readonly skillType?: number;
};

type MutationSystem = {
	readonly enabled?: boolean;
	readonly enabledOffset?: number;
	readonly enabledPresent: boolean;
	readonly initialized?: boolean;
	readonly initializedOffset?: number;
	readonly initializedPresent: boolean;
	readonly equipped?: string;
	readonly equippedOffset?: number;
	readonly equippedPresent: boolean;
};

type DifficultyChoice = {
	readonly label: string;
	readonly index: number;
};

type DifficultyScalar = PatchableScalar & {
	readonly choices: readonly DifficultyChoice[];
};

type PatchablePoints = {
	readonly kind: "skill" | "exp";
	readonly free: number;
	readonly freeOffset: number;
	readonly used: number;
	readonly usedOffset: number;
};

type SavedMutation = {
	readonly type?: number;
	readonly name?: string;
	readonly colors: readonly string[];
	readonly progress?: Readonly<Record<string, number | undefined>>;
	readonly progressOffsets?: Readonly<Record<string, number>>;
	readonly requiredMutations: readonly string[];
	readonly localizationNameKey?: string;
};

type WritableSave = {
	readonly stats: CharacterSheet;
	readonly scan: {
		readonly names: readonly string[];
		readonly tokens: readonly Token[];
	};
	readonly money?: PatchableScalar;
	readonly level?: PatchableScalar;
	readonly difficulty?: DifficultyScalar;
	readonly points: readonly PatchablePoints[];
	readonly skills: readonly PatchableSkill[];
	readonly items: readonly (InventoryItem & {
		readonly quantityOffset: number;
	})[];
	readonly mutations: readonly SavedMutation[];
	readonly skillSlots: readonly PatchableSkillSlot[];
	readonly skillSlotsBytes: number;
	readonly skillAbilities: readonly string[];
	readonly skillAbilitiesBytes: number;
	readonly mutationSystem: MutationSystem;
	readonly equippedMutation?: string;
};

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

export const clampScalar = (target: PatchableScalar, next: number): number =>
	Math.min(target.max, Math.max(target.min, Math.trunc(next)));

const widthOf = (kind: PatchKind): number =>
	kind === "u8" ? 1 : kind === "f32" || kind === "i32" ? 4 : 2;

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

export const locateMoney = (
	data: Uint8Array,
	signature: readonly number[] = CROWNS_IDENTITY_52586,
	tagPair: readonly number[] | undefined = discoverTagPair(data),
): PatchableScalar | undefined => {
	if (tagPair === undefined) return undefined;
	for (let at = 0; at + 14 <= data.length; at += 1) {
		if (!tagPair.every((byte, i) => data[at + i] === byte)) continue;
		for (let idAt = at - 16; idAt <= at - 4; idAt += 1) {
			if (!signature.every((byte, i) => data[idAt + i] === byte)) continue;
			return {
				id: "money",
				label: "Crowns",
				value: u16(data, at + 4),
				offset: at + 4,
				kind: "u16",
				min: 0,
				max: 0xffff,
			};
		}
	}
	return undefined;
};

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

const enumName = (
	names: readonly string[],
	value: number | undefined,
): string | undefined =>
	value !== undefined && value >= 1 ? names[value - 1] : undefined;

const numberAt = (value: ReflectedValue | undefined): number | undefined => {
	if (value === undefined) return undefined;
	const parsed = Number(value.text);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const cname = (
	names: readonly string[],
	value: ReflectedValue | undefined,
): string | undefined => {
	if (value === undefined) return undefined;
	const match = /^CName\((\d+)\)$/.exec(value.text);
	if (match === null) return value.text === "" ? undefined : value.text;
	return enumName(names, Number(match[1]));
};

type CharacterSheet = {
	readonly baseStats: readonly BaseStat[];
	readonly resistances: readonly Resistance[];
	readonly levelCurve: readonly LevelDefinition[];
};

export type AbilityManagerView = {
	readonly token: Token;
	readonly valueAt: number;
	readonly object: ReflectedValue;
};

export const readAbilityManager = (
	data: Uint8Array,
	names: readonly string[],
	tokens: readonly Token[],
): AbilityManagerView | undefined => {
	const levelIndex = tokens.findIndex(
		(t) =>
			t.name === "levelManager" && t.value?.type === "handle:W3LevelManager",
	);
	for (let i = levelIndex - 1; i >= 0; i -= 1) {
		const token = tokens[i];
		if (token === undefined || token.name !== "abilityManager") continue;
		const value = token.value;
		if (value === undefined) continue;
		const bytes = value.bytes;
		if (bytes.byteLength < 8 || bytes[0] !== 0) continue;
		const classIndex = (bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8);
		if (names[classIndex - 1] !== "W3PlayerAbilityManager") continue;
		const valueAt = token.offset + 12;
		const object = reflectValue(
			data,
			names,
			value.type,
			valueAt,
			bytes.byteLength,
		);
		if (object !== undefined) return { token, valueAt, object };
	}
	return undefined;
};

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

	const view = readAbilityManager(data, names, tokens);
	const ability = view?.object;

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
			const name =
				skillTypeMember === undefined
					? `empty slot ${index}`
					: skillType >= 1
						? (names[skillType - 1] ?? `skill ${skillType}`)
						: `skill ${index}`;
			return {
				name,
				type: skillType >= 1 ? skillType : undefined,
				level:
					levelMember === undefined
						? undefined
						: Number(levelMember.value.text) || 0,
				levelOffset: levelMember?.offset,
				isNew: member(item, "isNew")?.text === "true",
				maxLevel:
					levelMember === undefined
						? undefined
						: (() => {
								const cap = Number(member(item, "maxLevel")?.text);
								return Number.isFinite(cap) && cap > 0 ? cap : undefined;
							})(),
				abilityName: cname(names, member(item, "abilityName")),
				isCoreSkill: member(item, "isCoreSkill")?.text === "true",
			};
		},
	);

	const items = (playerInventory(data, names) ?? []).map((item) => ({
		...item,
		quantityOffset: quantityOffsetOf(item),
	}));

	const skillSlots: PatchableSkillSlot[] = (
		member(ability, "skillSlots")?.items ?? []
	).map((item, index) => {
		const field = (name: string) =>
			item.fields?.find((entry) => entry.name === name);
		const number = (name: string): number | undefined => {
			const found = field(name);
			if (found === undefined) return undefined;
			const parsed = Number(found.value.text);
			return Number.isFinite(parsed) ? parsed : undefined;
		};
		const skillType = number("socketedSkill");
		return {
			id: number("id") ?? index + 1,
			group: number("groupID") ?? -1,
			unlockedOnLevel: number("unlockedOnLevel") ?? 0,
			unlocked: field("unlocked")?.value.text === "true",
			skillType:
				skillType !== undefined && skillType >= 1 ? skillType : undefined,
		};
	});

	const skillAbilities = (member(ability, "skillAbilities")?.items ?? [])
		.map((item) => cname(names, item))
		.filter((name): name is string => name !== undefined);

	const enabledField = member(ability, "isMutationSystemEnabled");
	const initializedField = member(ability, "mutationSkillSlotsInitialized");
	const mutationSystem: MutationSystem = {
		enabled: enabledField?.text === "true",
		enabledOffset: memberOffset(ability, "isMutationSystemEnabled"),
		enabledPresent: enabledField !== undefined,
		initialized: initializedField?.text === "true",
		initializedOffset: memberOffset(ability, "mutationSkillSlotsInitialized"),
		initializedPresent: initializedField !== undefined,
		equipped: enumName(names, numberAt(member(ability, "equippedMutation"))),
		equippedOffset: memberOffset(ability, "equippedMutation"),
		equippedPresent: member(ability, "equippedMutation") !== undefined,
	};

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
		skillSlots,
		skillSlotsBytes: member(ability, "skillSlots")?.width ?? 0,
		skillAbilities,
		skillAbilitiesBytes: member(ability, "skillAbilities")?.width ?? 0,
		mutationSystem,
		equippedMutation: enumName(
			names,
			numberAt(member(ability, "equippedMutation")),
		),
	};
};
