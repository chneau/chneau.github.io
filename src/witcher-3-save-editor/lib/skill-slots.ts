import {
	arrayAt,
	isJsonObject,
	type JsonValue,
	numberAt,
	stringAt,
} from "../../shared/save/json";
import { readNameTable } from "./names";
import {
	nameBytesOf,
	namesEndOf,
	type Resizable,
	replaceRange,
	writeU16,
	writeU32,
} from "./payload-resize";
import type { ReflectedValue } from "./reflect";
import { parseTokens } from "./tokens";
import { readAbilityManager } from "./write";

const SLOT_NAMES = [
	"id",
	"unlockedOnLevel",
	"socketedSkill",
	"unlocked",
	"groupID",
	"Int32",
	"Bool",
	"ESkill",
] as const;

const ABILITY_NAMES = ["skillAbilities", "array:2,0,CName"] as const;

export const SLOT_FIELD_NAMES = SLOT_NAMES;

export const ABILITY_FIELD_NAMES = ABILITY_NAMES;

type SlotRow = {
	readonly id: number;
	readonly group: number;
	readonly unlockedOnLevel: number;
	readonly unlocked: boolean;
	readonly skillType?: number;
};

const groupForSkill = (name: string): number => {
	if (name.startsWith("S_Magic")) return 2;
	if (name.startsWith("S_Alchemy")) return 3;
	if (name.startsWith("S_Perk")) return 4;
	return 1;
};

const abilityView = (data: Uint8Array) => {
	const names = readNameTable(data).names;
	const view = readAbilityManager(data, names, parseTokens(data, names).tokens);
	return view === undefined ? undefined : { names, view };
};

const appendNames = (
	container: Resizable,
	names: readonly string[],
	missing: readonly string[],
): Resizable => {
	const { offset, end } = namesEndOf(container.data);
	const next = replaceRange(container, end, 0, nameBytesOf(missing));
	writeU32(next.data, offset + 4, names.length + missing.length);
	return next;
};

const ensureNamesFor = (
	container: Resizable,
	names: readonly string[],
	required: readonly string[],
): { container: Resizable; names: readonly string[] } => {
	const present = new Set(names);
	const missing = required.filter((name) => !present.has(name));
	if (missing.length === 0) return { container, names };
	const next = appendNames(container, names, missing);
	return { container: next, names: readNameTable(next.data).names };
};

const ensureNames = (
	container: Resizable,
	names: readonly string[],
): { container: Resizable; names: readonly string[] } =>
	ensureNamesFor(container, names, SLOT_NAMES);

const nameIndexMap = (names: readonly string[]): ReadonlyMap<string, number> =>
	new Map(names.map((name, index) => [name, index + 1]));

const requireIndex = (
	index: ReadonlyMap<string, number>,
	name: string,
): number => {
	const found = index.get(name);
	if (found === undefined) {
		throw new Error(`this save has no name ${JSON.stringify(name)}`);
	}
	return found;
};

const int32 = (value: number): Uint8Array<ArrayBuffer> =>
	Uint8Array.of(
		value & 0xff,
		(value >>> 8) & 0xff,
		(value >>> 16) & 0xff,
		(value >>> 24) & 0xff,
	);

const uint16 = (value: number): Uint8Array<ArrayBuffer> =>
	Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);

const slotWidth = (row: SlotRow): number =>
	row.skillType === undefined ? 48 : 58;

const slotBytes = (
	names: readonly string[],
	rows: readonly SlotRow[],
): Uint8Array<ArrayBuffer> => {
	const bytes = new Uint8Array(
		4 + rows.reduce((total, row) => total + slotWidth(row), 0),
	);
	writeU32(bytes, 0, rows.length);
	const index = nameIndexMap(names);
	const int32Type = requireIndex(index, "Int32");
	const boolType = requireIndex(index, "Bool");
	const skillType = requireIndex(index, "ESkill");
	const idName = requireIndex(index, "id");
	const levelName = requireIndex(index, "unlockedOnLevel");
	const socketedName = requireIndex(index, "socketedSkill");
	const unlockedName = requireIndex(index, "unlocked");
	const groupName = requireIndex(index, "groupID");
	let at = 4;
	const field = (name: number, type: number, value: Uint8Array): void => {
		writeU16(bytes, at, name);
		writeU16(bytes, at + 2, type);
		writeU32(bytes, at + 4, value.length + 4);
		bytes.set(value, at + 8);
		at += value.length + 8;
	};
	for (const row of rows) {
		bytes[at] = 0;
		at += 1;
		field(idName, int32Type, int32(row.id));
		field(levelName, int32Type, int32(row.unlockedOnLevel));
		if (row.skillType !== undefined) {
			field(socketedName, skillType, uint16(row.skillType));
		}
		field(unlockedName, boolType, Uint8Array.of(row.unlocked ? 1 : 0));
		field(groupName, int32Type, int32(row.group));
		writeU16(bytes, at, 0);
		at += 2;
	}
	return bytes;
};

const abilityBytes = (
	names: readonly string[],
	abilities: readonly string[],
): Uint8Array<ArrayBuffer> => {
	const bytes = new Uint8Array(4 + abilities.length * 2);
	writeU32(bytes, 0, abilities.length);
	const index = nameIndexMap(names);
	for (const [at, ability] of abilities.entries()) {
		writeU16(bytes, 4 + at * 2, requireIndex(index, ability));
	}
	return bytes;
};

const abilityFieldBytes = (
	names: readonly string[],
	abilities: readonly string[],
): Uint8Array<ArrayBuffer> => {
	const value = abilityBytes(names, abilities);
	const bytes = new Uint8Array(8 + value.length);
	const index = nameIndexMap(names);
	writeU16(bytes, 0, requireIndex(index, "skillAbilities"));
	writeU16(bytes, 2, requireIndex(index, "array:2,0,CName"));
	writeU32(bytes, 4, value.length + 4);
	bytes.set(value, 8);
	return bytes;
};

const abilityNamesOf = (
	value: ReflectedValue | undefined,
	names: readonly string[],
): readonly string[] =>
	(value?.items ?? []).flatMap((item) => {
		const match = /^CName\((\d+)\)$/.exec(item.text);
		if (match === null) return [];
		const name = names[Number(match[1]) - 1];
		return name === undefined ? [] : [name];
	});

const numberField = (
	item: ReflectedValue,
	name: string,
): number | undefined => {
	const found = item.fields?.find((field) => field.name === name);
	if (found === undefined) return undefined;
	const parsed = Number(found.value.text);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const currentSlotRows = (
	items: readonly ReflectedValue[],
): readonly SlotRow[] =>
	items.map((item, index) => ({
		id: numberField(item, "id") ?? index + 1,
		group: numberField(item, "groupID") ?? -1,
		unlockedOnLevel: numberField(item, "unlockedOnLevel") ?? 0,
		unlocked:
			item.fields?.find((field) => field.name === "unlocked")?.value.text ===
			"true",
		skillType: numberField(item, "socketedSkill"),
	}));

const desiredSlotRows = (
	rows: readonly JsonValue[],
	current: readonly SlotRow[],
	index: ReadonlyMap<string, number>,
): readonly SlotRow[] =>
	rows.map((row, rowIndex) => {
		const fallback = current[rowIndex];
		if (!isJsonObject(row)) {
			return (
				fallback ?? {
					id: rowIndex + 1,
					group: 1,
					unlockedOnLevel: 0,
					unlocked: false,
				}
			);
		}
		const skill = stringAt(row, "skill");
		const named = skill === undefined ? undefined : index.get(skill);
		const skillType = numberAt(row, "skillType") ?? named;
		return {
			id: numberAt(row, "id") ?? fallback?.id ?? rowIndex + 1,
			group:
				numberAt(row, "group") ??
				fallback?.group ??
				(skill === undefined ? 1 : groupForSkill(skill)),
			unlockedOnLevel:
				numberAt(row, "unlockedOnLevel") ?? fallback?.unlockedOnLevel ?? 0,
			unlocked: row.unlocked === true,
			skillType,
		};
	});

const sameSlots = (
	left: readonly SlotRow[],
	right: readonly SlotRow[],
): boolean =>
	left.length === right.length &&
	left.every((row, index) => {
		const other = right[index];
		return (
			other !== undefined &&
			row.id === other.id &&
			row.group === other.group &&
			row.unlockedOnLevel === other.unlockedOnLevel &&
			row.unlocked === other.unlocked &&
			row.skillType === other.skillType
		);
	});

export const syncSkillState = (
	container: Resizable,
	doc: JsonValue,
): Resizable => {
	let current = container;
	const requestedSlots = arrayAt(doc, "skillSlots");
	const requestedAbilities = arrayAt(doc, "skillAbilities");
	if (requestedSlots === undefined && requestedAbilities === undefined) {
		return current;
	}
	let view = abilityView(current.data);
	if (view === undefined) return current;
	let writtenSlotCount: number | undefined;
	const slotsField = view.view.object.fields?.find(
		(field) => field.name === "skillSlots",
	);
	if (slotsField !== undefined && requestedSlots !== undefined) {
		const currentRows = currentSlotRows(slotsField.value.items ?? []);
		const desiredRows = desiredSlotRows(
			requestedSlots,
			currentRows,
			nameIndexMap(view.names),
		);
		writtenSlotCount = desiredRows.length;
		if (!sameSlots(currentRows, desiredRows)) {
			const ensured = ensureNames(current, view.names);
			current = ensured.container;
			view = abilityView(current.data);
			if (view === undefined) return current;
			const field = view.view.object.fields?.find(
				(entry) => entry.name === "skillSlots",
			);
			if (field === undefined) return current;
			current = replaceRange(
				current,
				field.offset,
				field.value.width,
				slotBytes(view.names, desiredRows),
				field.offset - 4,
			);
		}
	}
	view = abilityView(current.data);
	if (view === undefined) return current;
	if (writtenSlotCount !== undefined) {
		const totalField = view.view.object.fields?.find(
			(field) => field.name === "totalSkillSlotsCount",
		);
		if (totalField !== undefined) {
			writeU32(current.data, totalField.offset, writtenSlotCount);
		}
	}
	const desired = (requestedAbilities ?? []).filter(
		(value): value is string => typeof value === "string",
	);
	const abilitiesField = view.view.object.fields?.find(
		(field) => field.name === "skillAbilities",
	);
	if (abilitiesField === undefined) {
		if (desired.length === 0) return current;
		const ensured = ensureNamesFor(current, view.names, ABILITY_NAMES);
		current = ensured.container;
		view = abilityView(current.data);
		if (view === undefined) return current;
		const length = view.view.token.value?.bytes.length;
		if (length === undefined) return current;
		return replaceRange(
			current,
			view.view.valueAt + length - 2,
			0,
			abilityFieldBytes(view.names, desired),
		);
	}
	const present = abilityNamesOf(abilitiesField.value, view.names);
	if (
		desired.length === present.length &&
		desired.every((ability, index) => ability === present[index])
	) {
		return current;
	}
	const bytes = abilityBytes(view.names, desired);
	return replaceRange(
		current,
		abilitiesField.offset,
		abilitiesField.value.width,
		bytes,
		abilitiesField.offset - 4,
	);
};
