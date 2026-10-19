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
	SummaryRow,
} from "../../shared/save/types";
import { addItemsToPayload } from "./add-item";
import { localizedString, questTitle } from "./catalog";
import { decompressContainer, type SaveContainer } from "./container";
import { buildContainer } from "./container-write";
import { readDialogues } from "./dialogues";
import { readEntityFlags } from "./entities";
import { readFactDB } from "./facts";
import { readHeader, readSaveVersion } from "./inner";
import { readContainers } from "./inventory";
import { readJournal } from "./journal";
import { maxMutationsInPayload } from "./max-mutations";
import { readObjectTree } from "./objects";
import { readPlayer } from "./player";
import { questStepDetail } from "./quest-steps";
import { questProgress } from "./quests";
import { experienceToNextLevel, type LevelDefinition } from "./stats";
import { readUnlocksFromScan } from "./unlocks";
import { locateWritable, type PatchableScalar, patchScalar } from "./write";

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
	readonly level: number | null;
	readonly maxLevel: number | null;
};

type MutationRow = {
	readonly name: string | null;
	readonly colors: readonly string[];
	readonly progress: Readonly<Record<string, number | null>> | null;
	readonly requiredMutations: readonly string[];
	readonly nameKey: string | null;
	readonly label: string | null;
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
				level: s.level ?? null,
				maxLevel: s.maxLevel ?? null,
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
			}),
		),
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
	// The container is also the game's general compressed-file envelope, so a
	// valid `SNFH` file is not necessarily a save. The engine checks this magic
	// before it reads a save, and the token walk below has no way to tell a
	// non-save stream from a corrupt one.
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
	if (wantsMutationResize) {
		const resized = maxMutationsInPayload({ data: payload, chunks });
		payload = resized.data;
		chunks = resized.chunks;
		found = locateWritable(payload);
	}

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
		if (quantity === undefined || quantity === null) return;
		writeUint16(payload, item.quantityOffset, quantity);
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
	before: number | string | null,
	after: number | string | null,
): SaveEdit => ({
	id: `${path.join(".")}=${after}`,
	label,
	path,
	before,
	after,
});

const QUEST_STEPS_LIMIT = 60;

const payloadGrowthEdits = (
	doc: JsonValue,
	added: number,
): readonly SaveEdit[] => {
	const container = objectAt(doc, "container");
	if (container === undefined) return [];
	const payloadBytes = numberAt(container, "payloadBytes");
	if (payloadBytes === undefined || payloadBytes === null) return [];
	const next = payloadBytes + added;
	const edits: SaveEdit[] = [
		edit(["container", "payloadBytes"], "Payload size", payloadBytes, next),
	];
	const chunks = numberAt(container, "chunks");
	const chunkBytes = numberAt(container, "chunkBytes");
	if (
		chunks !== undefined &&
		chunks !== null &&
		chunkBytes !== undefined &&
		chunkBytes !== null &&
		chunkBytes > 0
	) {
		const count = Math.ceil(next / chunkBytes);
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
			"Fully research every Blood-and-Wine mutation. The engine recomputes progress from the four *Used counters, so this inserts each Used field (= its Required) into the save and sets progress to 100 — exactly what the game's own console `mutall` does. Resizing: it adds the fields, so the file grows.",
		plan: (doc) => {
			const mutations = requireArrayAt(doc, "mutations");
			const edits: SaveEdit[] = [];
			const colors = new Set<string>();
			let inserts = 0;
			mutations.forEach((row, index) => {
				if (!isJsonObject(row)) return;
				const progress = objectAt(row, "progress");
				if (progress === undefined) return;
				const name = stringAt(row, "name") ?? `mutation ${index}`;
				if (name === "EPMT_MutationMaster") return;
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
			});
			if (inserts > 0) {
				const equipped = stringAt(doc, "equippedMutation");
				let equipAdded = 0;
				if (equipped !== "EPMT_MutationMaster") {
					edits.push(
						edit(
							["equippedMutation"],
							"Equipped mutation",
							equipped ?? null,
							"EPMT_MutationMaster",
						),
					);
					if (equipped === undefined) {
						equipAdded = 10 + 1 + "equippedMutation".length;
					}
				}
				const added =
					inserts * 12 +
					equipAdded +
					[...colors].reduce(
						(sum, color) => sum + 1 + `${color}Used`.length,
						0,
					);
				edits.push(...payloadGrowthEdits(doc, added));
			}
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
		description: `Set every skill in this save to its own maximum — level ${MAX_SKILL_LEVEL} at the top of the tree, less for the skills that cap lower. Each level is a 4-byte value already present in the save, so this resizes nothing.`,
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
		description: "Set every skill in this save back to level 0.",
		plan: (doc) => {
			const skills = levelBearing(doc);
			if (skills.length === 0) return [];
			return skills
				.filter((skill) => skill.level !== 0)
				.map((skill) =>
					edit(
						["skills", skill.index, "level"],
						"Skill level",
						skill.level ?? 0,
						0,
					),
				);
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
};
