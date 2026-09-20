/**
 * Quest progress: the four state tables `QuestSaveData` holds.
 *
 * A save tracks the story four times over, and each table is a list of keys with
 * a one-byte `QuestStateType`:
 *
 *   - `_questStateList` — one row per quest, the entry the journal shows;
 *   - `_missionStateList` — missions, plus the UI flag that decides whether the
 *     journal lists them;
 *   - `_stageStateData` — stages, by far the largest table (46k rows in the
 *     early save, 49k in the endgame one) and the one the world actually acts
 *     on;
 *   - `_questGaugeStateList` — repeatable objective gauges.
 *
 * The state values are shared: 1 locked, 2 available, 3 in progress, 4 ready,
 * 5 completed. Setting a row back to locked or available also clears the
 * timestamps and completion count, because a row that still says it was
 * finished at timestamp 81532 while claiming to be available is the kind of
 * inconsistency the journal renders as a bug.
 *
 * Rows whose state field the record does not carry are listed but not editable
 * — the mask says the field is absent, so there is nothing to write.
 */

import { type DecodedSave, decodeSave } from "./container";
import { type GameNamesFile, gameNamesTable } from "./data";
import {
	type ColumnarWalk,
	type RootObject,
	readRoot,
	walkObjectListColumns,
} from "./object-walk";
import { patchScalars, type ScalarWrite } from "./scalar-patch";
import { commitSave } from "./transaction";

/** Which of the four tables a row came from. */
export type QuestKind = "quest" | "mission" | "stage" | "gauge";

export const questKindLabels: Record<QuestKind, string> = {
	quest: "Quests",
	mission: "Missions",
	stage: "Stages",
	gauge: "Gauges",
};

/** Player-facing name for each `QuestStateType`, shared by all four tables. */
export const questStateLabels: Record<number, string> = {
	1: "Locked",
	2: "Available",
	3: "In progress",
	4: "Ready",
	5: "Completed",
};

/** The value a completed row carries in every table. */
export const questCompletedState = 5;
/** The value a reset row carries: present again, not started. */
export const questAvailableState = 2;

export const questStateLabel = (state: number | null): string => {
	if (state === null) return "Not stored";
	return questStateLabels[state] ?? `0x${state.toString(16).toUpperCase()}`;
};

/** One row as the editor shows it. */
export type QuestEntry = {
	/** `kind:key`, stable across re-reads. */
	id: string;
	kind: QuestKind;
	key: number;
	name: string | null;
	/** Owning quest, for stage rows only. */
	questName: string | null;
	state: number | null;
	stateLabel: string;
	completedTime: number | null;
	/** False when the record's mask leaves the state field out. */
	editable: boolean;
};

export type QuestDescription = {
	entries: QuestEntry[];
	counts: Record<QuestKind, number>;
	completed: Record<QuestKind, number>;
	error: string | null;
};

/** One row plus the offsets behind it. */
type Slot = { offset: number; size: number };

type Row = {
	id: string;
	kind: QuestKind;
	key: number;
	name: string | null;
	questName: string | null;
	state: number | null;
	completedTime: number | null;
	/** Values the reset cleanup has to clear, and where they live. */
	counters: Array<{ name: string; value: number; slot: Slot }>;
	slots: {
		state: Slot | null;
		completedTime: Slot | null;
	};
};

/** Tables in the order the editor lists them. */
const TABLES: Array<{
	kind: QuestKind;
	field: string;
	keyField: string;
}> = [
	{ kind: "quest", field: "_questStateList", keyField: "_questKey" },
	{ kind: "mission", field: "_missionStateList", keyField: "_key" },
	{ kind: "stage", field: "_stageStateData", keyField: "_key" },
	{ kind: "gauge", field: "_questGaugeStateList", keyField: "_key" },
];

/**
 * One field of a columnar walk, as the quest reader sees it. The walk never
 * materializes per-row objects: a row's value is `column.values[rows[i]]` and
 * its payload offset is `column.starts[rows[i]]`, with `rows[i] < 0` meaning
 * the row's mask leaves the field out — the same distinction `slot()` used to
 * report per object, now read straight off the typed array.
 */
type QuestColumn = {
	starts: number[];
	values: unknown[];
	rows: Int32Array;
};

const columnOf = (walk: ColumnarWalk, name: string): QuestColumn | null => {
	const column = walk.fields.get(name);
	if (!column) return null;
	return { starts: column.starts, values: column.values, rows: column.rows };
};

const numericAt = (
	column: QuestColumn | null,
	index: number,
): number | null => {
	if (!column) return null;
	const row = column.rows[index] ?? -1;
	if (row < 0) return null;
	const value = column.values[row];
	return typeof value === "number" ? value : null;
};

const slotAt = (
	column: QuestColumn | null,
	index: number,
	size: number,
): Slot | null => {
	if (!column) return null;
	const row = column.rows[index] ?? -1;
	if (row < 0) return null;
	return { offset: column.starts[row] ?? 0, size };
};

/**
 * The fields a reset has to clear. Stages carry `_completedCount`, missions
 * `_completeCount`, and both carry the two timestamps, but only where the mask
 * says so — an absent field is already zero as far as the game is concerned.
 */
const countersAt = (
	walk: ColumnarWalk,
	index: number,
): Array<{ name: string; value: number; slot: Slot }> => {
	const candidates: Array<[string, string, number]> = [
		["completedTime", "_completedTime", 8],
		["branchedTime", "_branchedTime", 8],
		["completedCount", "_completedCount", 2],
		["completedCount", "_completeCount", 4],
	];
	const counters: Array<{ name: string; value: number; slot: Slot }> = [];
	for (const [name, field, size] of candidates) {
		const column = columnOf(walk, field);
		const target = slotAt(column, index, size);
		if (!target) continue;
		counters.push({
			name,
			value: numericAt(column, index) ?? 0,
			slot: target,
		});
	}
	return counters;
};

/** Stage key -> quest name, from the generated quest table's stage lists. */
const stageQuestNames = (names: GameNamesFile): Map<number, string> => {
	const index = new Map<number, string>();
	for (const quest of Object.values(names.quests)) {
		for (const stage of quest.stages ?? []) {
			if (!index.has(stage)) index.set(stage, quest.name);
		}
	}
	return index;
};

const nameOf = (
	kind: QuestKind,
	key: number,
	names: GameNamesFile,
	stageQuests: Map<number, string>,
): { name: string | null; questName: string | null } => {
	if (kind === "quest") {
		return { name: names.quests[String(key)]?.name ?? null, questName: null };
	}
	if (kind === "mission") {
		return { name: names.missions[String(key)] ?? null, questName: null };
	}
	if (kind === "gauge") {
		return { name: names.questGauges[String(key)] ?? null, questName: null };
	}
	return { name: null, questName: stageQuests.get(key) ?? null };
};

const readRows = (raw: Uint8Array, names: GameNamesFile): Row[] => {
	let root: RootObject;
	try {
		root = readRoot(raw, "QuestSaveData");
	} catch {
		return [];
	}
	const stageQuests = stageQuestNames(names);
	const rows: Row[] = [];
	for (const table of TABLES) {
		const field = root.fields.find(
			(candidate) => candidate.name === table.field && candidate.present,
		);
		if (!field) continue;
		const walk = walkObjectListColumns(root.parser, field);
		const keys = columnOf(walk, table.keyField);
		const states = columnOf(walk, "_state");
		const completedTimes = columnOf(walk, "_completedTime");
		for (let index = 0; index < walk.count; index++) {
			const key = numericAt(keys, index) ?? 0;
			const { name, questName } = nameOf(table.kind, key, names, stageQuests);
			rows.push({
				id: `${table.kind}:${key}`,
				kind: table.kind,
				key,
				name,
				questName,
				state: numericAt(states, index),
				completedTime: numericAt(completedTimes, index),
				counters: countersAt(walk, index),
				slots: {
					state: slotAt(states, index, 1),
					completedTime: slotAt(completedTimes, index, 8),
				},
			});
		}
	}
	return rows;
};

const emptyCounts = (): Record<QuestKind, number> => ({
	quest: 0,
	mission: 0,
	stage: 0,
	gauge: 0,
});

const toEntry = (row: Row): QuestEntry => ({
	id: row.id,
	kind: row.kind,
	key: row.key,
	name: row.name,
	questName: row.questName,
	state: row.state,
	stateLabel: questStateLabel(row.state),
	completedTime: row.completedTime,
	editable: row.slots.state !== null,
});

/** Reads every quest, mission, stage and gauge row with its state. */
export const describeQuests = async (
	save: DecodedSave,
): Promise<QuestDescription> => {
	const names = await gameNamesTable();
	const counts = emptyCounts();
	const completed = emptyCounts();
	try {
		const rows = readRows(save.rawPayload, names);
		for (const row of rows) {
			counts[row.kind] += 1;
			if (row.state === questCompletedState) completed[row.kind] += 1;
		}
		return { entries: rows.map(toEntry), counts, completed, error: null };
	} catch (error) {
		return {
			entries: [],
			counts,
			completed,
			error: `Quest editing is unavailable for this save: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
};

/** One state change, on one row or on a chosen set of rows. */
export type QuestEdit = {
	type: "quest";
	/** `kind:key` ids to change. */
	ids: string[];
	label: string;
	state: number;
};

/** A state change applied to every row of the chosen kinds. */
export type QuestPresetEdit = {
	type: "questPreset";
	preset: "completeAll" | "resetAll";
	kinds: QuestKind[];
	label: string;
};

const isReset = (state: number): boolean =>
	state === questAvailableState || state === 1;

/** The writes one row's new state needs, including its reset cleanup. */
const writesFor = (row: Row, state: number): ScalarWrite[] => {
	if (!row.slots.state) {
		throw new Error(
			`${row.kind} ${row.key} does not store a state, so it cannot be changed`,
		);
	}
	if (row.state === state) return [];
	const writes: ScalarWrite[] = [
		{
			offset: row.slots.state.offset,
			size: row.slots.state.size,
			value: state,
			label: `state of ${row.id}`,
		},
	];
	if (!isReset(state)) return writes;
	for (const counter of row.counters) {
		if (counter.value === 0) continue;
		writes.push({
			offset: counter.slot.offset,
			size: counter.slot.size,
			value: 0,
			label: `${counter.name} of ${row.id}`,
		});
	}
	return writes;
};

const applyState = async (
	sourceBytes: Uint8Array,
	context: string,
	select: (rows: Row[]) => Array<{ row: Row; state: number }>,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const names = await gameNamesTable();
	const decoded = await decodeSave(sourceBytes);
	const raw = decoded.rawPayload;
	const rows = readRows(raw, names);
	const rowsById = new Map(rows.map((row) => [row.id, row]));
	const chosen = select(rows);
	if (chosen.length === 0) {
		throw new Error(`${context} would not change any row`);
	}
	const writes = chosen.flatMap((entry) => writesFor(entry.row, entry.state));
	if (writes.length === 0) {
		throw new Error(`${context} would not change any row`);
	}
	const patched = patchScalars(raw, context, writes);
	const { bytes, reopenedPayload, verification } = await commitSave(
		{ original: raw, header: decoded.header },
		context,
		patched.payload,
	);

	// The stage table alone runs to tens of thousands of rows, so both sides of
	// the comparison are indexed: a linear search per row would make the check
	// quadratic, and the check runs on every edit.
	const after = readRows(reopenedPayload, names);
	const afterById = new Map(after.map((row) => [row.id, row]));
	const touched = new Map(chosen.map((entry) => [entry.row.id, entry.state]));
	for (const [id, state] of touched) {
		const row = afterById.get(id);
		if (!row) throw new Error(`Row ${id} disappeared during ${context}`);
		if (row.state !== state) {
			throw new Error(
				`Edited output did not reparse with the requested state for ${id}`,
			);
		}
		if (
			isReset(state) &&
			row.completedTime !== null &&
			row.completedTime !== 0
		) {
			throw new Error(`Completed time of ${id} was not cleared on reset`);
		}
	}
	for (const row of after) {
		if (touched.has(row.id)) continue;
		const before = rowsById.get(row.id);
		if (!before) {
			throw new Error(`An unexpected row appeared during ${context}`);
		}
		if (before.state !== row.state) {
			throw new Error(`Unrelated row ${row.id} changed during ${context}`);
		}
	}

	return [
		bytes,
		{
			edit: "quest_state",
			context,
			rows_changed: touched.size,
			fields_written: writes.length,
			raw_changed_byte_offsets: patched.changed.length,
			...verification,
		},
	];
};

/** Sets the state of the named rows. */
export const applyQuestEdit = async (
	sourceBytes: Uint8Array,
	edit: QuestEdit,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	if (!Number.isInteger(edit.state) || edit.state < 0 || edit.state > 255) {
		throw new Error("A quest state must be a whole number from 0 to 255");
	}
	if (edit.ids.length === 0) {
		throw new Error("No quest rows were selected");
	}
	const wanted = new Set(edit.ids);
	return applyState(sourceBytes, "Quest state edit", (rows) => {
		const matched = rows.filter((row) => wanted.has(row.id));
		if (matched.length === 0) {
			throw new Error("None of the selected rows are in this save");
		}
		return matched.map((row) => ({ row, state: edit.state }));
	});
};

/**
 * Completes or resets every row of the chosen tables. Completing only touches
 * rows that are not already complete, so the edit's size is proportional to the
 * work it still has to do.
 */
export const applyQuestPreset = async (
	sourceBytes: Uint8Array,
	edit: QuestPresetEdit,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const kinds = new Set(edit.kinds);
	const state =
		edit.preset === "completeAll" ? questCompletedState : questAvailableState;
	return applyState(sourceBytes, `Apply ${edit.preset}`, (rows) =>
		rows
			.filter((row) => kinds.has(row.kind))
			.filter((row) => row.slots.state !== null)
			.filter((row) => row.state !== state)
			.filter((row) => writesFor(row, state).length > 0)
			.map((row) => ({ row, state })),
	);
};
