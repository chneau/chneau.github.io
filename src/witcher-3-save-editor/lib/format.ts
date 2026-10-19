import type { Bytes } from "../../shared/save/bytes";
import { describeError } from "../../shared/save/errors";
import {
	arrayAt,
	isJsonObject,
	type JsonValue,
	numberAt,
	objectAt,
	requireArrayAt,
	requireStringAt,
	stringAt,
} from "../../shared/save/json";
import type {
	FormatNote,
	QuickAction,
	SaveCodec,
	SaveEdit,
	SaveTable,
	SummaryRow,
} from "../../shared/save/types";
import { addItemsToPayload } from "./add-item";
import { localizedString, questTitle } from "./catalog";
import { decompressContainer, type SaveContainer } from "./container";
import { buildContainer } from "./container-write";
import { readDialogues } from "./dialogues";
import { readEntityFlags } from "./entities";
import { readFactDB } from "./facts";
import { readHeader, readSaveVersion, readU32 } from "./inner";
import { readContainers } from "./inventory";
import { readJournal } from "./journal";
import { maxMutationsInPayload } from "./max-mutations";
import { readNameTable } from "./names";
import { readObjectTree } from "./objects";
import {
	CHUNK_BYTES,
	type Resizable,
	replaceRange,
	writeU32,
} from "./payload-resize";
import { readPlayer } from "./player";
import { questStepDetail } from "./quest-steps";
import { questProgress } from "./quests";
import {
	ABILITY_FIELD_NAMES,
	SLOT_FIELD_NAMES,
	slotWidth,
	syncSkillState,
} from "./skill-slots";
import { experienceToNextLevel, type LevelDefinition } from "./stats";
import { parseTokens } from "./tokens";
import { readUnlocksFromScan } from "./unlocks";
import {
	locateWritable,
	type PatchableScalar,
	patchScalar,
	readAbilityManager,
} from "./write";

const ID = "witcher-3-save-editor";

type Scaffold = {
	readonly payload: Uint8Array;
	readonly chunks: readonly {
		readonly index: number;
		readonly compressedSize: number;
		readonly decompressedSize: number;
		readonly endOffset: number;
		readonly start: number;
	}[];
};

const SCAFFOLD_KEY = "scaffold";

const isScaffold = (value: unknown): value is Scaffold => {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as { payload?: unknown; chunks?: unknown };
	return (
		candidate.payload instanceof Uint8Array && Array.isArray(candidate.chunks)
	);
};

const attachScaffold = (doc: JsonValue, scaffold: Scaffold): void => {
	if (!isJsonObject(doc)) return;
	const branch = doc[SCAFFOLD_KEY];
	if (branch === undefined || !isJsonObject(branch)) return;
	const holder: Record<string, unknown> = branch;
	Object.defineProperty(holder, "bytes", {
		value: scaffold,
		enumerable: false,
		writable: false,
		configurable: true,
	});
};

const readScaffold = (doc: JsonValue): Scaffold | undefined => {
	if (!isJsonObject(doc)) return undefined;
	const branch = doc[SCAFFOLD_KEY];
	if (branch === undefined || !isJsonObject(branch)) return undefined;
	const holder: Record<string, unknown> = branch;
	const scaffold: unknown = holder.bytes;
	return isScaffold(scaffold) ? scaffold : undefined;
};

type SkillRow = {
	readonly name: string;
	readonly type: number | null;
	readonly level: number | null;
	readonly maxLevel: number | null;
	readonly abilityName: string | null;
	readonly isCoreSkill: boolean;
};

type SkillSlotRow = {
	readonly id: number;
	readonly group: number;
	readonly unlockedOnLevel: number;
	readonly unlocked: boolean;
	readonly skill: string | null;
	readonly skillType: number | null;
};

type MutagenSlotRow = {
	readonly group: number;
	readonly unlockedAtLevel: number;
	readonly equipmentSlot: number;
	readonly item: number | null;
};

type MutationRow = {
	readonly name: string | null;
	readonly colors: readonly string[];
	readonly progress: Readonly<Record<string, number | null>> | null;
	readonly requiredMutations: readonly string[];
	readonly nameKey: string | null;
	readonly label: string | null;
	readonly researched: boolean;
};

const mutationResearched = (
	progress: Readonly<Record<string, number | undefined>> | undefined,
): boolean => {
	if (progress === undefined) return false;
	const overall = progress.overallProgress;
	if (overall !== undefined) return overall >= 100;
	let required = 0;
	let used = 0;
	for (const color of ["red", "blue", "green", "skillpoints"]) {
		required += progress[`${color}Required`] ?? 0;
		used += progress[`${color}Used`] ?? 0;
	}
	return required > 0 && used >= required;
};

const difficultyLabel = (doc: JsonValue): string => {
	const branch = objectAt(doc, "difficulty");
	if (branch === undefined) return "unknown";
	const index = numberAt(branch, "index");
	if (index === undefined || index === null) return "unknown";
	if (!Array.isArray(branch.choices)) return `index ${index}`;
	for (const choice of branch.choices) {
		if (!isJsonObject(choice)) continue;
		if (numberAt(choice, "index") !== index) continue;
		return stringAt(choice, "label") ?? `index ${index}`;
	}
	return `index ${index}`;
};

const project = (container: SaveContainer): JsonValue => {
	const found = locateWritable(container.data);
	const saveVersion = readSaveVersion(container.data);
	const entityRoots = readObjectTree(container.data).roots;
	const dialogueRead = readDialogues(
		container.data,
		found.scan.names,
		found.scan.tokens,
		entityRoots,
	);
	const skill = found.points.find((p) => p.kind === "skill");
	const experience = found.points.find((p) => p.kind === "exp");
	const facts = readFactDB(container.data);
	const journal = readJournal(container.data, {
		names: found.scan.names,
		roots: entityRoots,
	});

	return {
		format: ID,
		game: "The Witcher 3: Wild Hunt",
		container: {
			chunks: container.chunks.length,
			headerSize: container.headerSize,
			payloadBytes: container.data.length,
			chunkBytes: container.chunks[0]?.decompressedSize ?? 0,
			skillSlotsBytes: found.skillSlotsBytes,
			skillSlotNamesBytes: missingNameBytes(found.scan.names, SLOT_FIELD_NAMES),
			skillAbilitiesBytes: found.skillAbilitiesBytes,
			skillAbilityNamesBytes: missingNameBytes(
				found.scan.names,
				ABILITY_FIELD_NAMES,
			),
		},
		saveVersion,
		level: found.level?.value ?? null,
		difficulty: {
			index: found.difficulty?.value ?? null,
			choices: (found.difficulty?.choices ?? []).map((choice) => ({
				label: choice.label,
				index: choice.index,
			})),
		},
		skillPoints: skill
			? {
					free: skill.freeOffset > 0 ? skill.free : null,
					used: skill.usedOffset > 0 ? skill.used : null,
				}
			: null,
		experience: experience
			? {
					free: experience.freeOffset > 0 ? experience.free : null,
					used: experience.usedOffset > 0 ? experience.used : null,
				}
			: null,
		items: found.items.map((item) => ({
			name: item.name,
			quantity: item.quantity,
			slot: item.slot,
			durability: item.durability,
		})),
		containers: readContainers(
			container.data,
			found.scan.names,
			found.scan.tokens,
			entityRoots,
		)
			.filter((c) => c.label !== "player" && c.items.length > 0)
			.map((c) => ({
				label: c.label,
				items: c.items.map((item) => ({
					name: item.name,
					quantity: item.quantity,
				})),
			})),
		position: (() => {
			const player = readPlayer(container.data, found.scan.tokens);
			return player === undefined
				? null
				: { template: player.template, x: player.x, y: player.y, z: player.z };
		})(),
		quests: (() => {
			if (facts === undefined) return [];
			return questProgress(facts.facts)
				.map((q) => ({
					id: q.id,
					title: questTitle(q.id) ?? null,
					inferredState: q.state,
					done: q.done,
					total: q.total,
				}))
				.sort((a, b) => (a.title ?? a.id).localeCompare(b.title ?? b.id));
		})(),
		questSteps:
			facts === undefined
				? []
				: questStepDetail(facts.facts)
						.slice(0, QUEST_STEPS_LIMIT)
						.map((quest) => ({
							id: quest.id,
							title: quest.title ?? null,
							stepsTotal: quest.stepsTotal,
							stepsFired: quest.stepsFired,
							events: quest.events,
							stepsDropped: quest.stepsDropped,
							steps: quest.steps,
							stepNameSample: quest.stepNameSample,
							stepNamesSampledOut: quest.stepNamesSampledOut,
							eventTimeSample: quest.eventTimeSample,
							eventTimesSampledOut: quest.eventTimesSampledOut,
						})),
		skills: found.skills.map(
			(s): SkillRow => ({
				name: s.name,
				type: s.type ?? null,
				level: s.level ?? null,
				maxLevel: s.maxLevel ?? null,
				abilityName: s.abilityName ?? null,
				isCoreSkill: s.isCoreSkill,
			}),
		),
		skillSlots: found.skillSlots.map(
			(s): SkillSlotRow => ({
				id: s.id,
				group: s.group,
				unlockedOnLevel: s.unlockedOnLevel,
				unlocked: s.unlocked,
				skill:
					s.skillType === undefined
						? null
						: (found.scan.names[s.skillType - 1] ?? null),
				skillType: s.skillType ?? null,
			}),
		),
		skillAbilities: found.skillAbilities,
		mutagenSlots: found.mutagenSlots.map(
			(slot): MutagenSlotRow => ({
				group: slot.group,
				unlockedAtLevel: slot.unlockedAtLevel,
				equipmentSlot: slot.equipmentSlot,
				item: slot.item,
			}),
		),
		mutations: found.mutations.map(
			(m): MutationRow => ({
				name: m.name ?? null,
				colors: m.colors,
				progress:
					m.progress === undefined
						? null
						: Object.fromEntries(
								Object.entries(m.progress).map(([key, value]) => [
									key,
									value ?? null,
								]),
							),
				requiredMutations: m.requiredMutations,
				nameKey: m.localizationNameKey ?? null,
				label:
					m.localizationNameKey === undefined
						? null
						: (localizedString(m.localizationNameKey) ?? null),
				researched: mutationResearched(m.progress),
			}),
		),
		mutationSystem: {
			enabled: found.mutationSystem.enabled ?? false,
			enabledPresent: found.mutationSystem.enabledPresent,
			initialized: found.mutationSystem.initialized ?? false,
			initializedPresent: found.mutationSystem.initializedPresent,
			equipped: found.mutationSystem.equipped ?? null,
			equippedPresent: found.mutationSystem.equippedPresent,
		},
		equippedMutation: found.equippedMutation ?? null,
		stats: {
			baseStats: found.stats.baseStats,
			resistances: found.stats.resistances,
			levelCurve: found.stats.levelCurve,
		},
		journal: {
			entries: journal.entries,
			statuses: journal.statuses,
			unattributed: journal.unattributed,
			quests: journal.quests.map((quest) => ({
				id: quest.id,
				title: quest.title ?? null,
				entries: quest.entries,
				statuses: quest.statuses,
				rollup: quest.rollup,
				contested: quest.contested,
			})),
			collections: journal.collections,
			sample: journal.sample.map((entry) => ({
				questId: entry.questId ?? null,
				status: entry.status,
			})),
			sampleTruncated: journal.sampleTruncated,
		},
		dialogues: dialogueRead.dialogs,
		attitudes: dialogueRead.attitudes,
		unlocks: readUnlocksFromScan(
			container.data,
			found.scan.names,
			found.scan.tokens,
		),
		entities: readEntityFlags(
			container.data,
			found.scan.names,
			found.scan.tokens,
			entityRoots,
		),
		[SCAFFOLD_KEY]: {},
	};
};

const decode = async (bytes: Bytes): Promise<JsonValue> => {
	let container: SaveContainer;
	try {
		container = decompressContainer(bytes);
	} catch (cause) {
		throw new Error(
			`This does not look like a Witcher 3 save: ${describeError(cause)}`,
		);
	}
	if (container.chunks.length === 0) {
		throw new Error("The save has no content chunks.");
	}
	readHeader(container.data);
	const doc = project(container);
	attachScaffold(doc, {
		payload: container.data,
		chunks: container.chunks.map((c) => ({ ...c })),
	});
	return doc;
};

const scalarOf = (doc: JsonValue, key: string): number | undefined => {
	const value = numberAt(doc, key);
	return value === undefined || value === null ? undefined : value;
};

const templateFor = (
	name: string,
	items: readonly { readonly name: string }[],
): string | undefined => {
	const words = new Set(name.toLowerCase().split(/\s+/));
	let best: { name: string; score: number } | undefined;
	for (const item of items) {
		const score = item.name
			.toLowerCase()
			.split(/\s+/)
			.filter((word) => words.has(word)).length;
		if (best === undefined || score > best.score) {
			best = { name: item.name, score };
		}
	}
	return best?.name;
};

const stripMasterOverallProgress = (container: Resizable): Resizable => {
	const names = readNameTable(container.data).names;
	const view = readAbilityManager(
		container.data,
		names,
		parseTokens(container.data, names).tokens,
	);
	const mutations = view?.object.fields?.find(
		(field) => field.name === "mutations",
	);
	for (const item of mutations?.value.items ?? []) {
		const typeField = item.fields?.find((field) => field.name === "type");
		const typeIndex =
			typeField === undefined ? undefined : Number(typeField.value.text);
		if (
			typeIndex === undefined ||
			names[typeIndex - 1] !== "EPMT_MutationMaster"
		) {
			continue;
		}
		const progress = item.fields?.find((field) => field.name === "progress");
		const overall = progress?.value.fields?.find(
			(field) => field.name === "overallProgress",
		);
		if (overall === undefined) return container;
		const removed = 8 + overall.value.width;
		const next = replaceRange(
			container,
			overall.offset - 8,
			removed,
			new Uint8Array(0),
		);
		if (mutations !== undefined) {
			const at = mutations.offset - 4;
			writeU32(next.data, at, (readU32(next.data, at) ?? 0) - removed);
		}
		if (progress !== undefined) {
			const at = progress.offset - 4;
			writeU32(next.data, at, (readU32(next.data, at) ?? 0) - removed);
		}
		return next;
	}
	return container;
};

const encode = async (doc: JsonValue): Promise<Bytes> => {
	const scaffold = readScaffold(doc);
	if (scaffold === undefined) {
		throw new Error(
			"This document has no save attached to it. Re-open the file — the inspector cannot rebuild a save from its own projection.",
		);
	}

	let payload = scaffold.payload.slice();
	let chunks = scaffold.chunks;
	let found = locateWritable(payload);

	const requestedMutations = requireArrayAt(doc, "mutations");
	const wantsMutationResize = found.mutations.some((mutation, index) => {
		const row = requestedMutations[index];
		if (row === undefined || !isJsonObject(row)) return false;
		const progress = objectAt(row, "progress");
		if (progress === undefined) return false;
		return ["redUsed", "blueUsed", "greenUsed", "skillpointsUsed"].some(
			(key) =>
				(numberAt(progress, key) ?? 0) !== (mutation.progress?.[key] ?? 0),
		);
	});
	const system = objectAt(doc, "mutationSystem");
	const equipped =
		system === undefined ? undefined : stringAt(system, "equipped");
	const enableSystem = system !== undefined && system.enabled === true;
	const initializeSlots = system !== undefined && system.initialized === true;
	const wantsEquipInsert =
		equipped !== undefined &&
		equipped !== "EPMT_None" &&
		equipped !== "EPMT_MutationMaster" &&
		found.mutationSystem.equippedOffset === undefined;
	const wantsSystemInsert =
		enableSystem && found.mutationSystem.enabledOffset === undefined;
	const wantsInitializeInsert =
		initializeSlots && found.mutationSystem.initializedOffset === undefined;
	const needsMutationWrite =
		wantsMutationResize ||
		(found.mutations.length > 0 &&
			(wantsEquipInsert || wantsSystemInsert || wantsInitializeInsert));
	if (needsMutationWrite) {
		const equip =
			equipped !== undefined &&
			equipped !== "EPMT_MutationMaster" &&
			equipped !== "EPMT_None"
				? equipped
				: undefined;
		const resized = maxMutationsInPayload({ data: payload, chunks }, equip, {
			enableSystem,
			initializeSlots,
		});
		payload = resized.data;
		chunks = resized.chunks;
		found = locateWritable(payload);
	}

	const synced = syncSkillState({ data: payload, chunks }, doc);
	if (synced.data !== payload) {
		payload = synced.data;
		chunks = synced.chunks;
		found = locateWritable(payload);
	}
	const stripped = stripMasterOverallProgress({ data: payload, chunks });
	payload = stripped.data;
	chunks = stripped.chunks;
	found = locateWritable(payload);

	const apply = (target: PatchableScalar | undefined, key: string): void => {
		if (target === undefined) return;
		const wanted = scalarOf(doc, key);
		if (wanted === undefined) return;
		patchScalar(payload, target, wanted);
	};

	apply(found.level, "level");

	if (found.difficulty !== undefined) {
		const difficulty = objectAt(doc, "difficulty");
		const index =
			difficulty === undefined ? undefined : numberAt(difficulty, "index");
		if (index !== undefined && index !== null) {
			patchScalar(payload, found.difficulty, index);
		}
	}

	const counters = new Map(found.points.map((p) => [p.kind, p]));
	for (const [key, kind] of [
		["skillPoints", "skill"],
		["experience", "exp"],
	] as const) {
		const branch = objectAt(doc, key);
		const points = counters.get(kind);
		if (branch === undefined || points === undefined) continue;
		const free = numberAt(branch, "free");
		const used = numberAt(branch, "used");
		if (free !== undefined && free !== null) {
			writeInt32(payload, points.freeOffset, free);
		}
		if (used !== undefined && used !== null && points.usedOffset > 0) {
			writeInt32(payload, points.usedOffset, used);
		}
	}

	const items = requireArrayAt(doc, "items");
	const newCount = Math.max(0, items.length - found.items.length);
	found.items.forEach((item, index) => {
		const row = items[index];
		if (row === undefined || !isJsonObject(row)) return;
		const quantity = numberAt(row, "quantity");
		if (quantity !== undefined) {
			writeUint16(payload, item.quantityOffset, quantity);
		}
		const durability = numberAt(row, "durability");
		if (
			durability !== undefined &&
			item.durability !== null &&
			durability !== item.durability
		) {
			writeFloat32(payload, item.offset + 6, durability);
		}
	});

	const skills = requireArrayAt(doc, "skills");
	found.skills.forEach((skill, index) => {
		if (skill.levelOffset === undefined || skill.levelOffset <= 0) return;
		const row = skills[index];
		if (row === undefined || !isJsonObject(row)) return;
		const level = numberAt(row, "level");
		if (level === undefined || level === null) return;
		writeInt32(payload, skill.levelOffset, level);
	});

	const mutations = requireArrayAt(doc, "mutations");
	found.mutations.forEach((mutation, index) => {
		const row = mutations[index];
		const offsets = mutation.progressOffsets;
		if (row === undefined || !isJsonObject(row) || offsets === undefined)
			return;
		const progress = objectAt(row, "progress");
		if (progress === undefined) return;
		for (const [key, offset] of Object.entries(offsets)) {
			const value = numberAt(progress, key);
			if (value === undefined || value === null) continue;
			writeInt32(payload, offset, value);
		}
	});

	const systemRow = objectAt(doc, "mutationSystem");
	const enabled = systemRow === undefined ? undefined : systemRow.enabled;
	if (
		typeof enabled === "boolean" &&
		found.mutationSystem.enabledOffset !== undefined &&
		enabled !== found.mutationSystem.enabled
	) {
		payload[found.mutationSystem.enabledOffset] = enabled ? 1 : 0;
	}
	const initialized =
		systemRow === undefined ? undefined : systemRow.initialized;
	if (
		typeof initialized === "boolean" &&
		found.mutationSystem.initializedOffset !== undefined &&
		initialized !== found.mutationSystem.initialized
	) {
		payload[found.mutationSystem.initializedOffset] = initialized ? 1 : 0;
	}
	const equippedName =
		systemRow === undefined
			? stringAt(doc, "equippedMutation")
			: stringAt(systemRow, "equipped");
	if (
		equippedName !== undefined &&
		found.mutationSystem.equippedOffset !== undefined &&
		equippedName !== found.mutationSystem.equipped
	) {
		const equipIndex = found.scan.names.indexOf(equippedName);
		if (equipIndex >= 0) {
			writeUint16(payload, found.mutationSystem.equippedOffset, equipIndex + 1);
		}
	}

	if (newCount > 0) {
		const requests: {
			name: string;
			quantity: number;
			template: string | undefined;
		}[] = [];
		for (let index = found.items.length; index < items.length; index += 1) {
			const row = items[index];
			if (row === undefined || !isJsonObject(row)) continue;
			const name = stringAt(row, "name");
			if (name === undefined) continue;
			requests.push({
				name,
				quantity: numberAt(row, "quantity") ?? 1,
				template: templateFor(name, found.items),
			});
		}
		if (requests.length > 0) {
			const added = addItemsToPayload({ data: payload, chunks }, requests);
			return buildContainer(added.chunks, added.data);
		}
	}

	const rebuilt = buildContainer(chunks, payload);
	return rebuilt;
};

const writeInt32 = (data: Uint8Array, at: number, value: number): void => {
	if (at <= 0 || at + 4 > data.length) return;
	new DataView(data.buffer, data.byteOffset + at, 4).setInt32(
		0,
		Math.trunc(value),
		true,
	);
};

const writeUint16 = (data: Uint8Array, at: number, value: number): void => {
	if (at <= 0 || at + 2 > data.length) return;
	const clamped = Math.min(0xffff, Math.max(0, Math.trunc(value)));
	data[at] = clamped & 0xff;
	data[at + 1] = (clamped >>> 8) & 0xff;
};

const writeFloat32 = (data: Uint8Array, at: number, value: number): void => {
	if (at <= 0 || at + 4 > data.length) return;
	const clamped = Math.min(100, Math.max(0, value));
	new DataView(data.buffer, data.byteOffset + at, 4).setFloat32(
		0,
		clamped,
		true,
	);
};

const readLevelCurveAt = (doc: JsonValue): readonly LevelDefinition[] => {
	const stats = objectAt(doc, "stats");
	if (stats === undefined) return [];
	const rows = arrayAt(stats, "levelCurve") ?? [];
	const curve: LevelDefinition[] = [];
	for (const row of rows) {
		if (!isJsonObject(row)) continue;
		const level = numberAt(row, "level");
		if (level === undefined || level === null) continue;
		curve.push({
			level,
			requiredTotalExp: numberAt(row, "requiredTotalExp") ?? null,
			addedSkillPoints: numberAt(row, "addedSkillPoints") ?? null,
			requiredExp: numberAt(row, "requiredExp") ?? null,
		});
	}
	return curve;
};

const crownsRow = (
	doc: JsonValue,
): { path: (string | number)[]; quantity: number } | undefined => {
	const list = arrayAt(doc, "items") ?? [];
	for (const [index, row] of list.entries()) {
		if (!isJsonObject(row)) continue;
		if (stringAt(row, "name") !== "Crowns") continue;
		const quantity = numberAt(row, "quantity");
		if (quantity === undefined || quantity === null) continue;
		return { path: ["items", index, "quantity"], quantity };
	}
	return undefined;
};

const JOURNAL_EQUIVALENT: Readonly<Record<string, string>> = {
	completed: "succeeded",
	failed: "failed",
	active: "active",
	"in-progress": "active",
	"not-started": "inactive",
};

const questSummaryRows = (doc: JsonValue): readonly SummaryRow[] => {
	const journal = objectAt(doc, "journal");
	if (journal === undefined) return [];
	const inferredById = new Map<string, string>();
	for (const row of arrayAt(doc, "quests") ?? []) {
		if (!isJsonObject(row)) continue;
		const id = stringAt(row, "id");
		const inferred = stringAt(row, "inferredState");
		if (id !== undefined && inferred !== undefined) {
			inferredById.set(id, inferred);
		}
	}
	let comparable = 0;
	let disagree = 0;
	let succeeded = 0;
	let recorded = 0;
	for (const quest of arrayAt(journal, "quests") ?? []) {
		if (!isJsonObject(quest)) continue;
		recorded += 1;
		const rollup = stringAt(quest, "rollup");
		if (rollup === undefined) continue;
		if (rollup === "succeeded") succeeded += 1;
		if (rollup === "unresolved") continue;
		const id = stringAt(quest, "id");
		const inferred = id === undefined ? undefined : inferredById.get(id);
		if (inferred === undefined) continue;
		comparable += 1;
		if (JOURNAL_EQUIVALENT[inferred] !== rollup) disagree += 1;
	}
	return [
		{
			label: "Quests in journal",
			value: `${recorded} recorded, ${succeeded} succeeded`,
		},
		{
			label: "Journal vs inferred state",
			value:
				comparable === 0
					? "no quest in both readings"
					: disagree === 0
						? `agree on all ${comparable}`
						: `disagree on ${disagree} of ${comparable}`,
			emphasis: disagree > 0,
		},
	];
};

const summarise = (doc: JsonValue): readonly SummaryRow[] => {
	const crowns = crownsRow(doc);
	const money = crowns?.quantity;
	const level = scalarOf(doc, "level");
	const rows: SummaryRow[] = [
		{
			label: "Save version",
			value: requireStringAt(doc, "saveVersion"),
		},
		{
			label: "Level",
			value: level === undefined ? "not found" : String(level),
			emphasis: level !== undefined && level < 20,
		},
		{ label: "Difficulty", value: difficultyLabel(doc) },
		{
			label: "Crowns",
			value:
				crowns === undefined
					? "not supported for this build"
					: String(crowns.quantity),
			emphasis: money === undefined,
		},
	];

	const skillPoints = objectAt(doc, "skillPoints");
	if (skillPoints !== undefined) {
		const free = numberAt(skillPoints, "free");
		rows.push({
			label: "Skill points",
			value: free === undefined ? "not in this save" : `${free} free`,
		});
	}
	const experience = objectAt(doc, "experience");
	if (experience !== undefined) {
		const free = numberAt(experience, "free");
		rows.push({
			label: "Experience",
			value: free === undefined ? "not in this save" : `${free} available`,
		});
		const toNext = experienceToNextLevel(
			readLevelCurveAt(doc),
			level === undefined ? null : level,
			experience === undefined
				? null
				: {
						free: free === undefined || free === null ? null : free,
						used: numberAt(experience, "used") ?? null,
					},
		);
		rows.push({
			label: "To next level",
			value: toNext === null ? "not derivable" : `${toNext} XP`,
		});
	}
	const mutations = (arrayAt(doc, "mutations") ?? []).filter(isJsonObject);
	const regularMutations = mutations.filter(
		(row) => stringAt(row, "name") !== "EPMT_MutationMaster",
	);
	const researched = regularMutations.filter(
		(row) => row.researched === true,
	).length;
	rows.push({
		label: "Mutations researched",
		value: `${researched} of ${regularMutations.length}`,
		emphasis:
			regularMutations.length > 0 && researched === regularMutations.length,
	});
	const mutationSystem = objectAt(doc, "mutationSystem");
	if (mutationSystem !== undefined) {
		const equipped = stringAt(mutationSystem, "equipped");
		rows.push({
			label: "Equipped mutation",
			value: equipped ?? "none",
			emphasis: equipped === "EPMT_MutationMaster",
		});
	}
	const skillSlots = arrayAt(doc, "skillSlots") ?? [];
	const socketed = skillSlots.filter(
		(row) => isJsonObject(row) && numberAt(row, "skillType") !== undefined,
	).length;
	rows.push({
		label: "Skill slots",
		value: `${socketed} socketed of ${skillSlots.length}`,
	});
	const abilities = arrayAt(doc, "skillAbilities");
	if (abilities !== undefined) {
		rows.push({ label: "Active abilities", value: String(abilities.length) });
	}
	const questRows = questSummaryRows(doc);
	rows.push(...questRows);

	const position = objectAt(doc, "position");
	if (position !== undefined) {
		const x = numberAt(position, "x");
		const y = numberAt(position, "y");
		const z = numberAt(position, "z");
		if (x !== undefined && y !== undefined && z !== undefined) {
			rows.push({
				label: "Position",
				value: `${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)}`,
			});
		}
	}

	return rows;
};

const edit = (
	path: readonly (string | number)[],
	label: string,
	before: JsonValue,
	after: JsonValue,
): SaveEdit => ({
	id: `${path.join(".")}=${String(after)}`,
	label,
	path,
	before,
	after,
});

const QUEST_STEPS_LIMIT = 60;

const missingNameBytes = (
	names: readonly string[],
	required: readonly string[],
): number => {
	const present = new Set(names);
	return required.reduce(
		(total, name) => (present.has(name) ? total : total + 1 + name.length),
		0,
	);
};

const encodedSlotBytes = (rows: readonly JsonValue[]): number => {
	let total = 4;
	for (const row of rows) {
		if (!isJsonObject(row)) continue;
		total += slotWidth({
			unlockedOnLevel: numberAt(row, "unlockedOnLevel") ?? 0,
			unlocked: row.unlocked === true,
			skillType: numberAt(row, "skillType") ?? undefined,
		});
	}
	return total;
};

const payloadGrowthEdits = (
	doc: JsonValue,
	added: number,
): readonly SaveEdit[] => {
	const container = objectAt(doc, "container");
	if (container === undefined) return [];
	const payloadBytes = numberAt(container, "payloadBytes");
	if (payloadBytes === undefined || payloadBytes === null) return [];
	const next = payloadBytes + added;
	const nextChunkBytes = Math.min(next, CHUNK_BYTES);
	const edits: SaveEdit[] = [
		edit(["container", "payloadBytes"], "Payload size", payloadBytes, next),
	];
	const chunkBytes = numberAt(container, "chunkBytes");
	if (
		chunkBytes !== undefined &&
		chunkBytes !== null &&
		chunkBytes !== nextChunkBytes
	) {
		edits.push(
			edit(
				["container", "chunkBytes"],
				"Chunk bytes",
				chunkBytes,
				nextChunkBytes,
			),
		);
	}
	const chunks = numberAt(container, "chunks");
	if (chunks !== undefined && chunks !== null) {
		const count = Math.ceil(next / CHUNK_BYTES);
		if (count !== chunks) {
			edits.push(edit(["container", "chunks"], "Chunk count", chunks, count));
		}
	}
	return edits;
};

const MAX_SKILL_LEVEL = 3;

const levelBearing = (
	doc: JsonValue,
): readonly {
	index: number;
	name: string;
	level: number;
	maxLevel: number;
}[] => {
	const skills = requireArrayAt(doc, "skills");
	const out: {
		index: number;
		name: string;
		level: number;
		maxLevel: number;
	}[] = [];
	for (const [index, row] of skills.entries()) {
		if (!isJsonObject(row)) continue;
		const level = numberAt(row, "level");
		if (level === undefined || level === null) continue;
		const cap = numberAt(row, "maxLevel");
		out.push({
			index,
			name: stringAt(row, "name") ?? `skill ${index}`,
			level,
			maxLevel: cap === undefined || cap === null ? MAX_SKILL_LEVEL : cap,
		});
	}
	return out;
};

const skillLevelsFor = (
	doc: JsonValue,
	mode: "max" | "zero",
): ReadonlyMap<number, number> => {
	const levels = new Map<number, number>();
	for (const row of requireArrayAt(doc, "skills")) {
		if (!isJsonObject(row)) continue;
		const type = numberAt(row, "type");
		if (type === undefined || type < 1) continue;
		const cap = numberAt(row, "maxLevel") ?? MAX_SKILL_LEVEL;
		levels.set(type, mode === "max" ? cap : 0);
	}
	return levels;
};

type ActiveAbilityPlan = {
	readonly abilities: readonly string[];
	readonly current: readonly JsonValue[];
	readonly beforeBytes: number;
	readonly afterBytes: number;
};

const activeAbilityPlan = (
	doc: JsonValue,
	levels: ReadonlyMap<number, number>,
): ActiveAbilityPlan => {
	const byType = new Map<
		number,
		{
			readonly ability?: string;
			readonly core: boolean;
			readonly level: number;
		}
	>();
	for (const row of requireArrayAt(doc, "skills")) {
		if (!isJsonObject(row)) continue;
		const type = numberAt(row, "type");
		if (type === undefined || type < 1) continue;
		byType.set(type, {
			ability: stringAt(row, "abilityName"),
			core: row.isCoreSkill === true,
			level: numberAt(row, "level") ?? 0,
		});
	}
	const abilities: string[] = [];
	for (const slot of arrayAt(doc, "skillSlots") ?? []) {
		if (!isJsonObject(slot)) continue;
		const type = numberAt(slot, "skillType");
		if (type === undefined) continue;
		const skill = byType.get(type);
		if (skill === undefined || skill.core || skill.ability === undefined) {
			continue;
		}
		const level = levels.get(type) ?? skill.level;
		for (let index = 0; index < level; index += 1) {
			abilities.push(skill.ability);
		}
	}
	const current = arrayAt(doc, "skillAbilities") ?? [];
	const container = objectAt(doc, "container");
	const beforeBytes =
		container === undefined
			? 4 + current.length * 2
			: (numberAt(container, "skillAbilitiesBytes") ?? 4 + current.length * 2);
	return {
		abilities,
		current,
		beforeBytes,
		afterBytes:
			beforeBytes === 0 && abilities.length === 0
				? 0
				: 4 + abilities.length * 2,
	};
};

const abilityPlanEdits = (
	doc: JsonValue,
	plan: ActiveAbilityPlan,
	id: string,
): readonly SaveEdit[] => {
	const edits: SaveEdit[] = [];
	if (JSON.stringify(plan.abilities) !== JSON.stringify(plan.current)) {
		edits.push({
			id: `skillAbilities=${id}`,
			label: "Active abilities",
			path: ["skillAbilities"],
			before: plan.current,
			after: plan.abilities,
		});
	}
	if (plan.afterBytes !== plan.beforeBytes) {
		edits.push(
			edit(
				["container", "skillAbilitiesBytes"],
				"Ability bytes",
				plan.beforeBytes,
				plan.afterBytes,
			),
		);
		edits.push(...payloadGrowthEdits(doc, plan.afterBytes - plan.beforeBytes));
	}
	return edits;
};

const ACTIONS: readonly QuickAction[] = [
	{
		id: "crowns-max",
		label: "Fill the wallet",
		description: "Set crowns to the most the field can hold (65535).",
		plan: (doc) => {
			const crowns = crownsRow(doc);
			if (crowns === undefined || crowns.quantity >= 65535) return [];
			return [edit(crowns.path, "Crowns", crowns.quantity, 65535)];
		},
	},
	{
		id: "crowns-round",
		label: "Round to 1000",
		description: "Round crowns up to the next thousand.",
		plan: (doc) => {
			const crowns = crownsRow(doc);
			if (crowns === undefined || crowns.quantity >= 65535) return [];
			const next = Math.min(
				65535,
				Math.ceil((crowns.quantity + 1) / 1000) * 1000,
			);
			if (next === crowns.quantity) return [];
			return [edit(crowns.path, "Crowns", crowns.quantity, next)];
		},
	},
	{
		id: "skill-points-max",
		label: "Max skill points",
		description: "Set unspent skill points to 500.",
		plan: (doc) => {
			const branch = objectAt(doc, "skillPoints");
			if (branch === undefined) return [];
			const free = numberAt(branch, "free");
			if (free === undefined || free === null || free === 500) return [];
			return [edit(["skillPoints", "free"], "Skill points", free, 500)];
		},
	},
	{
		id: "mutation-research-kit",
		label: "Stock mutation research",
		description:
			"Set unspent skill points to 500 and top every mutagen you carry up to 50. Lab research consumes Greater mutagens (normal and lesser carry no research points) plus skill points, so this stocks the colours you already hold at least one Greater mutagen of — the editor cannot add an item the save does not contain.",
		plan: (doc) => {
			const edits: SaveEdit[] = [];
			const points = objectAt(doc, "skillPoints");
			const free = points === undefined ? undefined : numberAt(points, "free");
			if (free !== undefined && free !== null && free < 500) {
				edits.push(edit(["skillPoints", "free"], "Skill points", free, 500));
			}
			const items = requireArrayAt(doc, "items");
			for (const [index, row] of items.entries()) {
				if (!isJsonObject(row)) continue;
				const name = stringAt(row, "name") ?? "";
				if (!/mutagen/i.test(name) || /recipe/i.test(name)) continue;
				const quantity = numberAt(row, "quantity");
				if (quantity === undefined || quantity === null || quantity >= 50) {
					continue;
				}
				edits.push(edit(["items", index, "quantity"], name, quantity, 50));
			}
			return edits;
		},
	},
	{
		id: "mutations-max",
		label: "Max all mutations",
		description:
			"Fully research every Blood-and-Wine mutation and open every skill slot. The engine derives research from the four *Used counters and caches it in overallProgress, so this sets Used = Required and progress = 100 — what the game's own console `mutall` does. It also enables the mutation system and duplicates the active-ability list, as the engine's `mutall` save does. Missing Used fields are inserted, so the file grows.",
		plan: (doc) => {
			const mutations = requireArrayAt(doc, "mutations");
			const edits: SaveEdit[] = [];
			const colors = new Set<string>();
			const mutationNames: string[] = [];
			let inserts = 0;
			mutations.forEach((row, index) => {
				if (!isJsonObject(row)) return;
				const progress = objectAt(row, "progress");
				if (progress === undefined) return;
				const name = stringAt(row, "name") ?? `mutation ${index}`;
				mutationNames.push(name);
				for (const color of ["red", "blue", "green", "skillpoints"]) {
					const required = numberAt(progress, `${color}Required`);
					if (required === undefined || required === null || required <= 0) {
						continue;
					}
					const usedValue = numberAt(progress, `${color}Used`);
					const used = usedValue ?? 0;
					if (used >= required) continue;
					edits.push(
						edit(
							["mutations", index, "progress", `${color}Used`],
							`${name} ${color}`,
							used,
							required,
						),
					);
					if (usedValue === undefined || usedValue === null) {
						inserts += 1;
						colors.add(color);
					}
				}
				const overall = numberAt(progress, "overallProgress");
				if (overall !== undefined && overall !== null && overall < 100) {
					edits.push(
						edit(
							["mutations", index, "progress", "overallProgress"],
							`${name} progress`,
							overall,
							100,
						),
					);
				}
				if (row.researched !== true) {
					edits.push(
						edit(
							["mutations", index, "researched"],
							`${name} researched`,
							false,
							true,
						),
					);
				}
			});
			if (mutationNames.length === 0) return edits;
			const system = objectAt(doc, "mutationSystem");
			if (system?.enabled !== true) {
				edits.push(
					edit(
						["mutationSystem", "enabled"],
						"Mutation system",
						system?.enabled ?? null,
						true,
					),
				);
				if (system?.enabledPresent === false) {
					edits.push(
						edit(
							["mutationSystem", "enabledPresent"],
							"Mutation system field",
							false,
							true,
						),
					);
				}
			}
			if (system?.initialized !== true) {
				edits.push(
					edit(
						["mutationSystem", "initialized"],
						"Mutation skill slots",
						system?.initialized ?? null,
						true,
					),
				);
				if (system?.initializedPresent === false) {
					edits.push(
						edit(
							["mutationSystem", "initializedPresent"],
							"Mutation slot field",
							false,
							true,
						),
					);
				}
			}
			const slots = arrayAt(doc, "skillSlots") ?? [];
			let changedSlots: JsonValue[] | undefined;
			slots.forEach((row, index) => {
				if (!isJsonObject(row)) return;
				const id = numberAt(row, "id");
				if (row.unlocked === true) return;
				edits.push(
					edit(
						["skillSlots", index, "unlocked"],
						`Skill slot ${id ?? index + 1}`,
						false,
						true,
					),
				);
				changedSlots ??= [...slots];
				changedSlots[index] = { ...row, unlocked: true };
			});
			const container = objectAt(doc, "container");
			const slotsBefore =
				container === undefined
					? encodedSlotBytes(slots)
					: (numberAt(container, "skillSlotsBytes") ?? encodedSlotBytes(slots));
			const slotsAfter =
				changedSlots === undefined
					? slotsBefore
					: encodedSlotBytes(changedSlots);
			if (slotsAfter !== slotsBefore) {
				edits.push(
					edit(
						["container", "skillSlotsBytes"],
						"Skill slot bytes",
						slotsBefore,
						slotsAfter,
					),
				);
			}
			const abilities = arrayAt(doc, "skillAbilities") ?? [];
			const nextAbilities = [...abilities, ...abilities];
			let abilityGrowth = 0;
			if (abilities.length > 0) {
				edits.push({
					id: "skillAbilities=mutations-max",
					label: "Active abilities",
					path: ["skillAbilities"],
					before: abilities,
					after: nextAbilities,
				});
				const abilitiesBefore =
					container === undefined
						? 4 + abilities.length * 2
						: (numberAt(container, "skillAbilitiesBytes") ??
							4 + abilities.length * 2);
				const abilitiesAfter = 4 + nextAbilities.length * 2;
				if (abilitiesAfter !== abilitiesBefore) {
					edits.push(
						edit(
							["container", "skillAbilitiesBytes"],
							"Ability bytes",
							abilitiesBefore,
							abilitiesAfter,
						),
					);
					abilityGrowth = abilitiesAfter - abilitiesBefore;
				}
			}
			const nameBytes = [...colors].reduce(
				(sum, color) => sum + 1 + `${color}Used`.length,
				0,
			);
			const stateBytes =
				(system?.enabled !== true && system?.enabledPresent === false
					? 9 + 1 + "isMutationSystemEnabled".length
					: 0) +
				(system?.initialized !== true && system?.initializedPresent === false
					? 9 + 1 + "mutationSkillSlotsInitialized".length
					: 0);
			const added =
				inserts * 12 +
				nameBytes +
				stateBytes +
				(slotsAfter - slotsBefore) +
				abilityGrowth;
			if (added !== 0) edits.push(...payloadGrowthEdits(doc, added));
			return edits;
		},
	},
	{
		id: "mutagens-greater",
		label: "Add Greater mutagens",
		description:
			"Insert 50 Greater red, green and blue mutagens at the top of the player's inventory. This is the editor's one resizing edit: it inserts real records rather than changing a value, so the file grows.",
		plan: (doc) => {
			const items = requireArrayAt(doc, "items");
			const named = items
				.filter(isJsonObject)
				.map((row) => ({ row, name: stringAt(row, "name") ?? "" }));
			const rows = [
				"Greater mutagen red",
				"Greater mutagen green",
				"Greater mutagen blue",
			].map((name) => {
				const template = named.find(
					(entry) => entry.name === templateFor(name, named),
				);
				return {
					name,
					quantity: 50,
					slot:
						template === undefined ? 0 : (numberAt(template.row, "slot") ?? 0),
					durability: numberAt(template?.row ?? null, "durability") ?? null,
				};
			});
			const edits: SaveEdit[] = [
				{
					id: "items=add-greater-mutagens",
					label: "Add Greater mutagens",
					path: ["items"],
					before: items,
					after: [...items, ...rows],
				},
			];
			const added =
				rows.length * 30 +
				rows.reduce((sum, row) => sum + 1 + row.name.length, 0);
			edits.push(...payloadGrowthEdits(doc, added));
			return edits;
		},
	},
	{
		id: "equipment-repair",
		label: "Repair all equipment",
		description:
			"Set every item whose recorded durability is below 100 to 100. Items on a higher scale (some gear stores 200) are left alone because their maximum is not in the save. Items with no durability value are left alone.",
		plan: (doc) => {
			const items = requireArrayAt(doc, "items");
			const edits: SaveEdit[] = [];
			for (const [index, row] of items.entries()) {
				if (!isJsonObject(row)) continue;
				const durability = numberAt(row, "durability");
				if (durability === undefined || durability >= 100) continue;
				edits.push(
					edit(
						["items", index, "durability"],
						stringAt(row, "name") ?? `item ${index}`,
						durability,
						100,
					),
				);
			}
			return edits;
		},
	},
	{
		id: "experience-max",
		label: "Max experience",
		description: "Set available experience to 500.",
		plan: (doc) => {
			const branch = objectAt(doc, "experience");
			if (branch === undefined) return [];
			const free = numberAt(branch, "free");
			if (free === undefined || free === null || free === 500) return [];
			return [edit(["experience", "free"], "Experience", free, 500)];
		},
	},
	{
		id: "skills-learn-all",
		label: "Max every skill",
		description: `Set every skill in this save to its own maximum — level ${MAX_SKILL_LEVEL} at the top of the tree, less for the skills that cap lower — and rebuild the saved active-ability list for the skills you have socketed. This does not append slot records; the engine's socket grid is fixed.`,
		plan: (doc) => {
			const skills = levelBearing(doc);
			if (skills.length === 0) return [];
			const edits: SaveEdit[] = skills
				.filter((skill) => skill.level !== skill.maxLevel)
				.map((skill) =>
					edit(
						["skills", skill.index, "level"],
						skill.name,
						skill.level,
						skill.maxLevel,
					),
				);
			edits.push(
				...abilityPlanEdits(
					doc,
					activeAbilityPlan(doc, skillLevelsFor(doc, "max")),
					"learn-all",
				),
			);
			return edits;
		},
	},
	{
		id: "skills-equip-all",
		label: "Learn and socket every skill",
		description:
			"Set every skill to its own maximum. The engine's socket grid is fixed; it rebuilds the socketed skills and active-ability list from the maxed skills on load, so this action does not append slot records.",
		plan: (doc) => {
			const skills = levelBearing(doc);
			if (skills.length === 0) return [];
			return skills
				.filter((skill) => skill.level !== skill.maxLevel)
				.map((skill) =>
					edit(
						["skills", skill.index, "level"],
						skill.name,
						skill.level,
						skill.maxLevel,
					),
				);
		},
	},
	{
		id: "skills-reset",
		label: "Reset every skill",
		description:
			"Set every skill back to level 0 and clear the saved active-ability list. Socket assignments are kept, so maxing the skills again restores them.",
		plan: (doc) => {
			const skills = levelBearing(doc);
			if (skills.length === 0) return [];
			const edits: SaveEdit[] = skills
				.filter((skill) => skill.level !== 0)
				.map((skill) =>
					edit(
						["skills", skill.index, "level"],
						"Skill level",
						skill.level ?? 0,
						0,
					),
				);
			edits.push(
				...abilityPlanEdits(
					doc,
					activeAbilityPlan(doc, skillLevelsFor(doc, "zero")),
					"reset",
				),
			);
			return edits;
		},
	},
	{
		id: "skills-unequip-all",
		label: "Unequip every skill",
		description:
			"Clear every socketed skill and the saved active-ability list. Skill levels are kept, so the next max action restores the same build.",
		plan: (doc) => {
			const slots = arrayAt(doc, "skillSlots") ?? [];
			let changed = false;
			const nextSlots = slots.map((row) => {
				if (!isJsonObject(row)) return row;
				if (numberAt(row, "skillType") === undefined) return row;
				changed = true;
				return { ...row, skill: null, skillType: null };
			});
			const edits: SaveEdit[] = [];
			if (changed) {
				edits.push({
					id: "skillSlots=unequip-all",
					label: "Skill slots",
					path: ["skillSlots"],
					before: slots,
					after: nextSlots,
				});
			}
			const current = arrayAt(doc, "skillAbilities") ?? [];
			const container = objectAt(doc, "container");
			const before =
				container === undefined
					? 4 + current.length * 2
					: (numberAt(container, "skillAbilitiesBytes") ??
						4 + current.length * 2);
			const after = before === 0 ? 0 : 4;
			if (before > 0 && current.length > 0) {
				edits.push({
					id: "skillAbilities=unequip-all",
					label: "Active abilities",
					path: ["skillAbilities"],
					before: current,
					after: [],
				});
				edits.push(
					edit(
						["container", "skillAbilitiesBytes"],
						"Ability bytes",
						before,
						after,
					),
				);
			}
			const slotsBefore =
				container === undefined
					? encodedSlotBytes(slots)
					: (numberAt(container, "skillSlotsBytes") ?? encodedSlotBytes(slots));
			const slotsAfter = changed ? encodedSlotBytes(nextSlots) : slotsBefore;
			if (slotsAfter !== slotsBefore) {
				edits.push(
					edit(
						["container", "skillSlotsBytes"],
						"Skill slot bytes",
						slotsBefore,
						slotsAfter,
					),
				);
			}
			const slotNames =
				changed && container !== undefined
					? (numberAt(container, "skillSlotNamesBytes") ?? 0)
					: 0;
			if (slotNames !== 0) {
				edits.push(
					edit(
						["container", "skillSlotNamesBytes"],
						"Skill slot names",
						slotNames,
						0,
					),
				);
			}
			const delta = slotsAfter - slotsBefore + (after - before) + slotNames;
			if (delta !== 0) edits.push(...payloadGrowthEdits(doc, delta));
			return edits;
		},
	},
	{
		id: "level-up",
		label: "Level up",
		description: "Add five levels, up to what the save's own curve allows.",
		plan: (doc) => {
			const level = scalarOf(doc, "level");
			if (level === undefined || level >= 60) return [];
			return [edit(["level"], "Level", level, Math.min(60, level + 5))];
		},
	},
];

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Hardcore", "NotSet"] as const;

const difficultyIndexFor = (
	doc: JsonValue,
	label: string,
): number | undefined => {
	const branch = objectAt(doc, "difficulty");
	if (branch === undefined || !Array.isArray(branch.choices)) return undefined;
	for (const choice of branch.choices) {
		if (!isJsonObject(choice)) continue;
		if (stringAt(choice, "label") !== label) continue;
		const index = numberAt(choice, "index");
		if (index === undefined) continue;
		return index;
	}
	return undefined;
};

const difficultyActions: readonly QuickAction[] = DIFFICULTIES.map((label) => ({
	id: `difficulty-${label.toLowerCase()}`,
	label: `Play on ${label}`,
	description: `Set the difficulty to ${label}.`,
	plan: (doc) => {
		const index = difficultyIndexFor(doc, label);
		if (index === undefined) return [];
		const branch = objectAt(doc, "difficulty");
		const current =
			branch === undefined ? undefined : numberAt(branch, "index");
		if (current === undefined || current === index) return [];
		return [
			edit(["difficulty", "index"], `Difficulty: ${label}`, current, index),
		];
	},
}));

const TABLES: readonly SaveTable[] = [
	{
		id: "inventory",
		label: "Inventory",
		path: ["items"],
		columns: [
			{ label: "Item", path: ["name"], readOnly: true },
			{ label: "Quantity", path: ["quantity"], width: "7rem" },
			{ label: "Durability", path: ["durability"], width: "7rem" },
			{ label: "Slot", path: ["slot"], readOnly: true, width: "5rem" },
		],
	},
	{
		id: "skills",
		label: "Skills",
		path: ["skills"],
		columns: [
			{ label: "Skill", path: ["name"], readOnly: true },
			{ label: "Level", path: ["level"], width: "6rem" },
			{ label: "Max", path: ["maxLevel"], readOnly: true, width: "6rem" },
			{ label: "Ability", path: ["abilityName"], readOnly: true },
			{ label: "Core", path: ["isCoreSkill"], readOnly: true, width: "5rem" },
		],
	},
	{
		id: "skill-slots",
		label: "Skill slots",
		path: ["skillSlots"],
		columns: [
			{ label: "ID", path: ["id"], readOnly: true, width: "4rem" },
			{ label: "Group", path: ["group"], readOnly: true, width: "5rem" },
			{ label: "Unlock level", path: ["unlockedOnLevel"], width: "7rem" },
			{ label: "Unlocked", path: ["unlocked"], width: "6rem" },
			{
				label: "Socketed skill",
				path: ["skill"],
				readOnly: true,
			},
			{ label: "Skill type", path: ["skillType"], width: "6rem" },
		],
	},
	{
		id: "mutagen-slots",
		label: "Mutagen slots",
		path: ["mutagenSlots"],
		columns: [
			{ label: "Group", path: ["group"], readOnly: true, width: "5rem" },
			{ label: "Item", path: ["item"], readOnly: true, width: "7rem" },
			{
				label: "Unlocked at",
				path: ["unlockedAtLevel"],
				readOnly: true,
				width: "8rem",
			},
			{
				label: "Equipment slot",
				path: ["equipmentSlot"],
				readOnly: true,
				width: "9rem",
			},
		],
	},
	{
		id: "mutations",
		label: "Mutations",
		path: ["mutations"],
		columns: [
			{ label: "Mutation", path: ["name"], readOnly: true },
			{
				label: "Researched",
				path: ["researched"],
				readOnly: true,
				width: "7rem",
			},
			{
				label: "Overall",
				path: ["progress", "overallProgress"],
				width: "6rem",
			},
			{ label: "Red", path: ["progress", "redUsed"], width: "5rem" },
			{
				label: "Red required",
				path: ["progress", "redRequired"],
				readOnly: true,
				width: "7rem",
			},
			{ label: "Blue", path: ["progress", "blueUsed"], width: "5rem" },
			{
				label: "Blue required",
				path: ["progress", "blueRequired"],
				readOnly: true,
				width: "7rem",
			},
			{ label: "Green", path: ["progress", "greenUsed"], width: "5rem" },
			{
				label: "Green required",
				path: ["progress", "greenRequired"],
				readOnly: true,
				width: "7rem",
			},
			{
				label: "Skill points",
				path: ["progress", "skillpointsUsed"],
				width: "7rem",
			},
			{
				label: "Points required",
				path: ["progress", "skillpointsRequired"],
				readOnly: true,
				width: "8rem",
			},
		],
	},
];

const NOTES: readonly FormatNote[] = [
	{
		title: "No checksum, and that is the whole trick",
		body: "A Witcher 3 save carries no checksum over its contents — not in the container, not in the SAV3 stream, not in the footer. The only CRC in the game belongs to the asset bundle format, which is a different file. So a value written in place needs nothing recomputed, and that is what makes a browser editor possible at all.",
	},
	{
		title: "Write the same width, or not at all",
		body: "A field's width must not change. Overwrite a u16 with a u16 and the stream keeps its length, so no offset anywhere moves. Change a length — adding a skill, renaming a string — and every offset after it shifts, which would mean rewriting the token stream, the span index and the variable table. The variable table's coordinate base is still not fully understood, so those operations are out of reach here. The edits on offer are scalars only, and that is a limit of the format work rather than a choice.",
	},
	{
		title: "Addresses are found, never remembered",
		body: "Three saves of the same build put the wallet at 3640748, 3640300 and 3640999, because everything ahead of it in the stream moves. So this editor looks each field up by its shape and its build-specific identity every time, and stores values rather than addresses. The wallet is found by requiring both the record shape and the item identity: the shape alone matches 1845 records in a real save, and only one of them is the player's.",
	},
	{
		title: "The header the engine reads",
		body: "A decompressed save begins with SAV3 and three u32 values. The installed build's writer emits 67, 29 and 164; the reference saves here carry 66, 29 and 164. The engine reads the first as the save version, and one of its loader paths rejects a version at or above 68 or a third value at or above 165. They are version fields, not constants, so this editor reports them and does not assert exact numbers: a hard check would reject a newer save the game still loads. It does require the SAV3 magic, because the surrounding SNFH/FZLC container is also used for files that are not saves, and SAVY — the engine's legacy magic — is named in the error rather than parsed with the wrong grammar.",
	},
	{
		title: "What the game does with the result",
		body: "Every rebuilt file is decoded again before it is offered for download, and the values you set are read back out of the rebuilt bytes. That proves the file is self-consistent and that the edits landed. It is not proof the game will load it — only launching the game settles that, and this page cannot.",
	},
];

export const witcher3: SaveCodec = {
	game: "The Witcher 3: Wild Hunt",
	formatLabel: "SNFH/FZLC container, LZ4 blocks, REDkit token stream",
	extensions: ["sav"],
	defaultPath:
		"Windows: Documents\\GOG Games\\The Witcher 3\\Game\\savedata  ·  Linux: ~/.local/share/Steam/steamapps/compatdata/1091500/pfx/drive_c/users/steamuser/My Documents/GOG Games/The Witcher 3/savedata",
	notes: NOTES,
	decode,
	encode,
	summarise,
	actions: [...ACTIONS, ...difficultyActions],
	tables: TABLES,
};
