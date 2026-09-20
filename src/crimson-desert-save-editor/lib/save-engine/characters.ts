/**
 * The levels the save tracks: the player, the people you have met, the
 * progression sub-levels, and the companions you own.
 *
 * Four tables hold those numbers, and this module reads all four into one shape
 * so the editor can list them together and the applier can address a row by a
 * single id:
 *
 *   - `CharacterStatusSaveData` is the player — one row, its level and
 *     experience at the root of the block;
 *   - `FriendlySaveData._friendlyDataList` is the bond log. Each element nests
 *     its numbers in an inline `_levelData` object and carries the reward flags
 *     `_threatRewarded` and `_readMemoryRewarded`;
 *   - `SubLevelSaveData._list` is progression: skill points, region
 *     contribution and the abyss stat tracks;
 *   - `MercenaryClanSaveData._mercenaryDataList` is horses, pets and the camp
 *     crew, identified by their own `_mercenaryNo` — several companions share a
 *     `_characterKey`, so the species is not an identity.
 *
 * A field a record does not carry is reported as `null`. Some of those are
 * genuinely not tracked, but others are only absent because the game omits a
 * field while it holds its default: the bond reward flags are missing on nearly
 * every bond in both fixtures, and the player's `_experience` is missing in both
 * entirely. Those are created on demand — `insertRecordFields` for a bond's flag,
 * `insertRootFields` for a root scalar — and `creatable` tells the editor which
 * ones a row can gain. That is also why the applier plans twice: creating a field
 * moves every later offset in the block, so the scalar writes are planned against
 * the payload the creation produced.
 */

import { type DecodedSave, decodeSave } from "./container";
import { type GameNamesFile, gameNamesTable } from "./data";
import { defined } from "./defined";
import {
	inlineChild,
	type RootObject,
	readRoot,
	rootField,
	type WalkedObject,
	walkObjectList,
} from "./object-walk";
import {
	insertRecordFields,
	insertRootFields,
	scalarBytes,
} from "./record-field-insert";
import { patchScalars, type ScalarWrite } from "./scalar-patch";
import { commitSave } from "./transaction";

/** Which table a row came from. */
export type CharacterKind = "player" | "bond" | "region" | "companion";

export const characterKindLabels: Record<CharacterKind, string> = {
	player: "Player",
	bond: "Bonds",
	region: "Progression",
	companion: "Companions",
};

/** Level ceiling the editor offers; the game's own data reaches 100. */
export const levelLimit = 100;
export const experienceLimit = 999_999_999;

/** The numeric fields the level tables expose. */
type CreatableField = "level" | "maxLevel" | "experience";

/**
 * One editable field: where it is and how much it can hold. An `offset` of
 * `null` means the record does not store the field yet and it has to be created
 * before it can hold anything — which is how the player's experience works, as
 * the game only writes it once it is non-zero.
 */
type Slot = {
	offset: number | null;
	/** The schema field name, which a creation needs. */
	field: string;
	size: number;
	limit: number;
};

/** The numbers and flags of one row. */
type CharacterValues = {
	level: number | null;
	maxLevel: number | null;
	experience: number | null;
	threatRewarded: boolean | null;
	memoryRewarded: boolean | null;
};

/** One row as the editor shows it. */
export type CharacterEntry = CharacterValues & {
	/** `kind:key`, stable across re-reads. */
	id: string;
	kind: CharacterKind;
	key: number;
	name: string | null;
	/** Fields this row stores no value for but the editor can create. */
	creatable: CreatableField[];
};

export type CharacterDescription = {
	entries: CharacterEntry[];
	counts: Record<CharacterKind, number>;
	levelLimit: number;
	experienceLimit: number;
	error: string | null;
};

/** A row plus the offsets behind its values. */
type Row = {
	id: string;
	kind: CharacterKind;
	key: number;
	name: string | null;
	values: CharacterValues;
	slots: {
		level: Slot | null;
		maxLevel: Slot | null;
		experience: Slot | null;
		threatRewarded: Slot | null;
		memoryRewarded: Slot | null;
	};
	/**
	 * Where a field this row does not store would be created. A reward flag is
	 * created on the bond's own list element; the player's experience is created
	 * on the root block, which is why the two are told apart.
	 */
	creation:
		| { kind: "list"; rootType: string; listField: string; recordStart: number }
		| { kind: "root"; rootType: string }
		| null;
};

const numeric = (
	source: RootObject | WalkedObject,
	name: string,
): number | null => {
	const value = source.values[name];
	return typeof value === "number" ? value : null;
};

/**
 * A field's slot, or `null` when the save neither stores it nor can store it.
 * `creatable` is set for the scalars the game only writes once they hold
 * something: an absent one is a default, not a missing capability.
 */
const slotOf = (
	source: RootObject | WalkedObject,
	name: string,
	size: number,
	limit: number,
	creatable = false,
): Slot | null => {
	const offset = source.offsets[name];
	if (offset !== undefined) {
		if (typeof source.values[name] !== "number") return null;
		return { offset, field: name, size, limit };
	}
	return creatable ? { offset: null, field: name, size, limit } : null;
};

const levelDataOf = (
	parser: RootObject["parser"],
	object: WalkedObject,
): WalkedObject | null => inlineChild(parser, object, "_levelData");

const readPlayer = (raw: Uint8Array, names: GameNamesFile): Row[] => {
	let root: RootObject;
	try {
		root = readRoot(raw, "CharacterStatusSaveData");
	} catch {
		return [];
	}
	const key = numeric(root, "_characterKey") ?? 0;
	return [
		{
			id: `player:${key}`,
			kind: "player",
			key,
			name: names.characters[String(key)] ?? "Player",
			values: {
				level: numeric(root, "_level"),
				maxLevel: null,
				experience: numeric(root, "_experience"),
				threatRewarded: null,
				memoryRewarded: null,
			},
			slots: {
				level: slotOf(root, "_level", 4, levelLimit, true),
				maxLevel: null,
				experience: slotOf(root, "_experience", 8, experienceLimit, true),
				threatRewarded: null,
				memoryRewarded: null,
			},
			creation: { kind: "root", rootType: "CharacterStatusSaveData" },
		},
	];
};

const readBonds = (raw: Uint8Array, names: GameNamesFile): Row[] => {
	let root: RootObject;
	try {
		root = readRoot(raw, "FriendlySaveData");
	} catch {
		return [];
	}
	const list = rootField(root, "_friendlyDataList");
	return walkObjectList(root.parser, list).map((object) => {
		const key = numeric(object, "_characterKey") ?? 0;
		const levelData = levelDataOf(root.parser, object);
		return {
			id: `bond:${key}`,
			kind: "bond" as const,
			key,
			name: names.characters[String(key)] ?? null,
			values: {
				level: levelData ? numeric(levelData, "_level") : null,
				maxLevel: null,
				experience: levelData ? numeric(levelData, "_exp") : null,
				threatRewarded:
					object.values._threatRewarded === undefined
						? null
						: Boolean(object.values._threatRewarded),
				memoryRewarded:
					object.values._readMemoryRewarded === undefined
						? null
						: Boolean(object.values._readMemoryRewarded),
			},
			slots: {
				level: levelData ? slotOf(levelData, "_level", 4, levelLimit) : null,
				maxLevel: null,
				experience: levelData
					? slotOf(levelData, "_exp", 8, experienceLimit)
					: null,
				threatRewarded: slotOf(object, "_threatRewarded", 1, 1),
				memoryRewarded: slotOf(object, "_readMemoryRewarded", 1, 1),
			},
			creation: {
				kind: "list" as const,
				rootType: "FriendlySaveData",
				listField: "_friendlyDataList",
				recordStart: object.start,
			},
		};
	});
};

const readRegions = (raw: Uint8Array, names: GameNamesFile): Row[] => {
	let root: RootObject;
	try {
		root = readRoot(raw, "SubLevelSaveData");
	} catch {
		return [];
	}
	const list = rootField(root, "_list");
	return walkObjectList(root.parser, list).map((object) => {
		const key = numeric(object, "_key") ?? 0;
		return {
			id: `region:${key}`,
			kind: "region" as const,
			key,
			name: names.sublevels[String(key)] ?? null,
			values: {
				level: numeric(object, "_level"),
				maxLevel: numeric(object, "_maxAchievedLevel"),
				experience: numeric(object, "_experience"),
				threatRewarded: null,
				memoryRewarded: null,
			},
			slots: {
				level: slotOf(object, "_level", 4, levelLimit),
				maxLevel: slotOf(object, "_maxAchievedLevel", 4, levelLimit),
				experience: slotOf(object, "_experience", 8, experienceLimit),
				threatRewarded: null,
				memoryRewarded: null,
			},
			creation: null,
		};
	});
};

const readCompanions = (raw: Uint8Array, names: GameNamesFile): Row[] => {
	let root: RootObject;
	try {
		root = readRoot(raw, "MercenaryClanSaveData");
	} catch {
		return [];
	}
	const list = rootField(root, "_mercenaryDataList");
	return walkObjectList(root.parser, list).map((object) => {
		const number = numeric(object, "_mercenaryNo") ?? 0;
		const characterKey = numeric(object, "_characterKey") ?? 0;
		const levelData = levelDataOf(root.parser, object);
		return {
			id: `companion:${number}`,
			kind: "companion" as const,
			key: number,
			name: names.characters[String(characterKey)] ?? null,
			values: {
				level: levelData ? numeric(levelData, "_level") : null,
				maxLevel: null,
				experience: levelData ? numeric(levelData, "_exp") : null,
				threatRewarded: null,
				memoryRewarded: null,
			},
			slots: {
				level: levelData ? slotOf(levelData, "_level", 4, levelLimit) : null,
				maxLevel: null,
				experience: levelData
					? slotOf(levelData, "_exp", 8, experienceLimit)
					: null,
				threatRewarded: null,
				memoryRewarded: null,
			},
			creation: null,
		};
	});
};

const allRows = (raw: Uint8Array, names: GameNamesFile): Row[] => [
	...readPlayer(raw, names),
	...readBonds(raw, names),
	...readRegions(raw, names),
	...readCompanions(raw, names),
];

/** The fields this row stores nothing for but could gain. */
const creatableOf = (row: Row): CreatableField[] => {
	const fields: CreatableField[] = [];
	for (const name of ["level", "maxLevel", "experience"] as const) {
		if (row.slots[name]?.offset === null) fields.push(name);
	}
	return fields;
};

const toEntry = (row: Row): CharacterEntry => ({
	id: row.id,
	kind: row.kind,
	key: row.key,
	name: row.name,
	...row.values,
	creatable: creatableOf(row),
});

/** Reads every level the save tracks, labelled with the game's own names. */
export const describeCharacters = async (
	save: DecodedSave,
): Promise<CharacterDescription> => {
	const names = await gameNamesTable();
	const counts: Record<CharacterKind, number> = {
		player: 0,
		bond: 0,
		region: 0,
		companion: 0,
	};
	try {
		const rows = allRows(save.rawPayload, names);
		for (const row of rows) counts[row.kind] += 1;
		return {
			entries: rows.map(toEntry),
			counts,
			levelLimit,
			experienceLimit,
			error: null,
		};
	} catch (error) {
		return {
			entries: [],
			counts,
			levelLimit,
			experienceLimit,
			error: `Level editing is unavailable for this save: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
};

/** A change to one row; a `null` field is left alone. */
export type CharacterChange = {
	level: number | null;
	maxLevel: number | null;
	experience: number | null;
	threatRewarded: boolean | null;
	memoryRewarded: boolean | null;
};

/** One row's staged change. */
export type CharacterEdit = CharacterChange & {
	type: "character";
	id: string;
	label: string;
};

/** A staged change applied to every row of a kind. */
export type CharacterPresetEdit = {
	type: "characterPreset";
	preset: "bondRewards" | "regionLevels";
	label: string;
	/** Target level, for `regionLevels`. */
	level?: number;
};

const whole = (value: number, limit: number, label: string): number => {
	if (!Number.isInteger(value) || value < 0 || value > limit) {
		throw new Error(`${label} must be a whole number between 0 and ${limit}`);
	}
	return value;
};

/** What one row's change resolves to. */
type Plan = {
	row: Row;
	writes: ScalarWrite[];
	creates: Array<{ fieldName: string; bytes: Uint8Array }>;
	/** Values that must read back once the edit is committed. */
	expected: Partial<CharacterValues>;
};

const FLAG_FIELDS: Record<"threatRewarded" | "memoryRewarded", string> = {
	threatRewarded: "_threatRewarded",
	memoryRewarded: "_readMemoryRewarded",
};

/** Where a field this row does not store would be created. */
const requireCreation = (row: Row): NonNullable<Row["creation"]> => {
	if (!row.creation) {
		throw new Error(`${row.id} cannot gain a field it does not store`);
	}
	return row.creation;
};

const planFor = (row: Row, change: CharacterChange): Plan => {
	const writes: ScalarWrite[] = [];
	const creates: Array<{ fieldName: string; bytes: Uint8Array }> = [];
	const expected: Partial<CharacterValues> = {};
	const addNumber = (
		name: "level" | "maxLevel" | "experience",
		slot: Slot | null,
		limit: number,
	): void => {
		const wanted = change[name];
		if (wanted === null || wanted === undefined) return;
		if (!slot) {
			throw new Error(
				`${name} is not stored for ${
					row.name ?? row.id
				}, so this save keeps its default`,
			);
		}
		const value = whole(wanted, limit, name);
		if (row.values[name] === value) return;
		if (slot.offset === null) {
			// The game never wrote the field because it still holds its default;
			// asking for that default back is already what the save says.
			if (value === 0) return;
			requireCreation(row);
			creates.push({
				fieldName: slot.field,
				bytes: scalarBytes(slot.size, value),
			});
		} else {
			writes.push({
				offset: slot.offset,
				size: slot.size,
				value,
				label: `${name} of ${row.id}`,
			});
		}
		expected[name] = value;
	};
	addNumber("level", row.slots.level, levelLimit);
	addNumber("maxLevel", row.slots.maxLevel, levelLimit);
	addNumber("experience", row.slots.experience, experienceLimit);

	for (const name of ["threatRewarded", "memoryRewarded"] as const) {
		const wanted = change[name];
		if (wanted === null || wanted === undefined) continue;
		if (row.values[name] === wanted) continue;
		const creation = row.creation;
		if (creation?.kind !== "list") {
			throw new Error(`${name} is not a field of ${row.id}`);
		}
		const slot = row.slots[name];
		if (slot?.offset !== null && slot?.offset !== undefined) {
			writes.push({
				offset: slot.offset,
				size: slot.size,
				value: wanted ? 1 : 0,
				label: `${name} of ${row.id}`,
			});
		} else {
			creates.push({
				fieldName: FLAG_FIELDS[name],
				bytes: scalarBytes(1, wanted ? 1 : 0),
			});
		}
		expected[name] = wanted;
	}
	return { row, writes, creates, expected };
};

const planAll = async (
	sourceBytes: Uint8Array,
	context: string,
	names: GameNamesFile,
	choose: (rows: Row[]) => Array<{ row: Row; change: CharacterChange }>,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const decoded = await decodeSave(sourceBytes);
	const raw = decoded.rawPayload;
	const rows = allRows(raw, names);
	const chosen = choose(rows);
	if (chosen.length === 0) {
		throw new Error(`${context} would not change anything`);
	}
	const first = chosen.map((entry) => planFor(entry.row, entry.change));
	const totalCreations = first.reduce(
		(total, plan) => total + plan.creates.length,
		0,
	);

	/*
	 * Creating a field moves every later offset in its block, and the two kinds of
	 * creation move different blocks: a reward flag goes into a bond's own record,
	 * a root scalar into the block the row lives in. So each round applies one
	 * batch and then plans again from the payload that batch produced — every list
	 * creation at once, since they were all measured against the payload the one
	 * call re-reads, or one root block on its own, since its offsets move as soon
	 * as the block grows.
	 */
	let payload = raw;
	let createdFields = 0;
	let second = first;
	for (let round = 0; ; round++) {
		const creating = second.filter((plan) => plan.creates.length > 0);
		if (creating.length === 0) break;
		if (round > totalCreations) {
			throw new Error("A field could not be created after several attempts");
		}
		const listPlans = creating.filter(
			(plan) => requireCreation(plan.row).kind === "list",
		);
		if (listPlans.length > 0) {
			const roots = new Set(
				listPlans.map((plan) => requireCreation(plan.row).rootType),
			);
			if (roots.size !== 1) {
				throw new Error("Fields must all be created in one list");
			}
			const fields = listPlans.flatMap((plan) => {
				const creation = requireCreation(plan.row);
				if (creation.kind !== "list") return [];
				return plan.creates.map((create) => ({
					recordStart: creation.recordStart,
					fieldName: create.fieldName,
					bytes: create.bytes,
				}));
			});
			const template = requireCreation(
				defined(listPlans[0], "list creation").row,
			);
			if (template.kind !== "list") {
				throw new Error("A list creation lost its list");
			}
			const inserted = insertRecordFields(payload, {
				rootType: defined([...roots][0], "list root"),
				listField: template.listField,
				fields,
			});
			payload = inserted.payload;
			createdFields += inserted.fieldsCreated;
		} else {
			const plan = defined(creating[0], "root creation");
			const creation = requireCreation(plan.row);
			if (creation.kind !== "root") {
				throw new Error("A root creation lost its root");
			}
			const inserted = insertRootFields(payload, {
				rootType: creation.rootType,
				fields: plan.creates,
			});
			payload = inserted.payload;
			createdFields += inserted.fieldsCreated;
		}
		// The batch moved every later offset, so plan the writes again.
		const moved = allRows(payload, names);
		second = chosen.map((entry) =>
			planFor(
				defined(
					moved.find((candidate) => candidate.id === entry.row.id),
					"row after field creation",
				),
				entry.change,
			),
		);
	}
	const writes = second.flatMap((plan) => plan.writes);
	const patched =
		writes.length > 0
			? patchScalars(payload, context, writes)
			: { payload, changed: [] as number[], labels: [] as string[] };

	const { bytes, reopenedPayload, verification } = await commitSave(
		{ original: raw, header: decoded.header },
		context,
		patched.payload,
	);

	const final = allRows(reopenedPayload, names);
	const touched = new Set(second.map((plan) => plan.row.id));
	for (const plan of second) {
		const after = defined(
			final.find((candidate) => candidate.id === plan.row.id),
			"reopened row",
		);
		for (const [name, value] of Object.entries(plan.expected)) {
			const key = name as keyof CharacterValues;
			if (after.values[key] !== value) {
				throw new Error(
					`Edited output did not reparse with the requested ${name} for ${plan.row.id}`,
				);
			}
		}
	}
	for (const row of final) {
		if (touched.has(row.id)) continue;
		const before = rows.find((candidate) => candidate.id === row.id);
		if (!before) {
			throw new Error(`An unexpected row appeared during ${context}`);
		}
		if (JSON.stringify(before.values) !== JSON.stringify(row.values)) {
			throw new Error(`Unrelated row ${row.id} changed during ${context}`);
		}
	}

	return [
		bytes,
		{
			edit: "character_change",
			context,
			rows_changed: second.length,
			fields_created: createdFields,
			fields_written: patched.labels,
			raw_changed_byte_offsets: patched.changed,
			...verification,
		},
	];
};

/** Applies one row's change. */
export const applyCharacterEdit = async (
	sourceBytes: Uint8Array,
	edit: CharacterEdit,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const names = await gameNamesTable();
	return planAll(sourceBytes, "Level edit", names, (rows) => {
		const row = rows.find((candidate) => candidate.id === edit.id);
		if (!row) throw new Error(`This save has no row ${edit.id}`);
		return [{ row, change: edit }];
	});
};

/**
 * Applies a change to every row of a kind: mark every bond's threat and memory
 * rewards, or set every progression row's level.
 */
export const applyCharacterPreset = async (
	sourceBytes: Uint8Array,
	edit: CharacterPresetEdit,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const names = await gameNamesTable();
	const noChange: CharacterChange = {
		level: null,
		maxLevel: null,
		experience: null,
		threatRewarded: null,
		memoryRewarded: null,
	};
	return planAll(sourceBytes, `Apply ${edit.preset}`, names, (rows) => {
		if (edit.preset === "bondRewards") {
			return rows
				.filter(
					(row) =>
						row.kind === "bond" &&
						!(
							row.values.threatRewarded === true &&
							row.values.memoryRewarded === true
						),
				)
				.map((row) => ({
					row,
					change: { ...noChange, threatRewarded: true, memoryRewarded: true },
				}));
		}
		const wanted = whole(edit.level ?? levelLimit, levelLimit, "Level");
		return rows
			.filter((row) => row.kind === "region")
			.map((row) => ({
				row,
				change: {
					...noChange,
					level: row.slots.level === null ? null : wanted,
					maxLevel: row.slots.maxLevel === null ? null : wanted,
				},
			}))
			.filter((entry) => planFor(entry.row, entry.change).writes.length > 0);
	});
};
