import type { SaveContainer } from "./container";
import { readNameTable } from "./names";
import { readObjectTree } from "./objects";
import { shiftSpanIndex } from "./payload-resize";
import { type ReflectedValue, reflectValue } from "./reflect";
import { parseTokens, type Token } from "./tokens";

type Resizable = {
	readonly data: Uint8Array<ArrayBuffer>;
	readonly chunks: SaveContainer["chunks"];
};

const u16 = (data: Uint8Array, at: number): number =>
	(data[at] ?? 0) | ((data[at + 1] ?? 0) << 8);
const u32 = (data: Uint8Array, at: number): number =>
	((data[at] ?? 0) |
		((data[at + 1] ?? 0) << 8) |
		((data[at + 2] ?? 0) << 16) |
		((data[at + 3] ?? 0) << 24)) >>>
	0;
const writeU32 = (data: Uint8Array, at: number, value: number): void => {
	data[at] = value & 0xff;
	data[at + 1] = (value >>> 8) & 0xff;
	data[at + 2] = (value >>> 16) & 0xff;
	data[at + 3] = (value >>> 24) & 0xff;
};

const namesEndOf = (data: Uint8Array): { offset: number; end: number } => {
	const table = readNameTable(data);
	let end = table.offset + 12;
	for (const name of table.names) end += 1 + name.length;
	return { offset: table.offset, end };
};

const nameBytesOf = (names: readonly string[]): Uint8Array => {
	let length = 0;
	for (const name of names) length += 1 + name.length;
	const bytes = new Uint8Array(length);
	let at = 0;
	for (const name of names) {
		bytes[at] = name.length;
		at += 1;
		for (let i = 0; i < name.length; i += 1) bytes[at + i] = name.charCodeAt(i);
		at += name.length;
	}
	return bytes;
};

const enclosing = (
	data: Uint8Array,
	offset: number,
): { tag: string; offset: number; childSize: number }[] => {
	const tree = readObjectTree(data);
	const chain: { tag: string; offset: number; childSize: number }[] = [];
	const walk = (nodes: ReturnType<typeof readObjectTree>["roots"]): boolean => {
		for (const node of nodes) {
			if (!(node.span.offset <= offset && offset < node.span.end)) continue;
			const token = node.span.token;
			if (
				(token.tag === "BLCK" || token.tag === "SS") &&
				token.childSize !== undefined
			) {
				chain.push({
					tag: token.tag,
					offset: token.offset,
					childSize: token.childSize,
				});
			}
			if (walk(node.children)) return true;
		}
		return false;
	};
	walk(tree.roots);
	return chain;
};

type Insert = { readonly at: number; readonly bytes: Uint8Array };

const splice = (
	data: Uint8Array,
	inserts: readonly Insert[],
): { out: Uint8Array<ArrayBuffer>; shiftAt: (at: number) => number } => {
	const sorted = [...inserts].sort((a, b) => a.at - b.at);
	let total = 0;
	for (const insert of sorted) total += insert.bytes.length;
	const out: Uint8Array<ArrayBuffer> = new Uint8Array(data.length + total);
	let src = 0;
	let dst = 0;
	for (const insert of sorted) {
		out.set(data.subarray(src, insert.at), dst);
		dst += insert.at - src;
		out.set(insert.bytes, dst);
		dst += insert.bytes.length;
		src = insert.at;
	}
	out.set(data.subarray(src), dst);
	const shiftAt = (at: number): number => {
		let shift = 0;
		for (const insert of sorted) {
			if (insert.at <= at) shift += insert.bytes.length;
		}
		return at + shift;
	};
	return { out, shiftAt };
};

const findField = (
	fields:
		| readonly { name: string; value: ReflectedValue; offset: number }[]
		| undefined,
	name: string,
): { name: string; value: ReflectedValue; offset: number } | undefined =>
	fields?.find((field) => field.name === name);

const enumName = (
	names: readonly string[],
	value: ReflectedValue | undefined,
): string | undefined => {
	const index = value === undefined ? undefined : Number(value.text);
	return index !== undefined && index >= 1 ? names[index - 1] : undefined;
};

const WANTED_USED = [
	"redUsed",
	"blueUsed",
	"greenUsed",
	"skillpointsUsed",
] as const;

const ENGINE_MUTATION_NAME_SUFFIX = [
	"Default weapon _Stats",
	"mon_horse_weapon _Stats",
	"isMutationSystemEnabled",
	"redUsed",
	"blueUsed",
	"skillpointsUsed",
	"greenUsed",
	"equippedMutations",
	"ETMT_Message",
	"TutorialMutationsUnlocked",
	"markAsSeenOnShow",
	"CharacterMenu",
	"MutationsOpenMutations",
	"MutationMenu",
	"MutationsFirstOpen",
] as const;

export type MutationInsertOptions = {
	readonly enableSystem?: boolean;
	readonly initializeSlots?: boolean;
};

export const maxMutationsInPayload = (
	container: Resizable,
	equip: string | undefined,
	options: MutationInsertOptions = {},
): {
	readonly data: Uint8Array<ArrayBuffer>;
	readonly chunks: SaveContainer["chunks"];
} => {
	const data = container.data;
	const names = readNameTable(data).names;
	const { tokens } = parseTokens(data, names);

	const levelIndex = tokens.findIndex(
		(t) =>
			t.name === "levelManager" && t.value?.type === "handle:W3LevelManager",
	);
	let token: Token | undefined;
	for (let i = levelIndex - 1; i >= 0; i -= 1) {
		const candidate = tokens[i];
		if (candidate === undefined || candidate.name !== "abilityManager") {
			continue;
		}
		const bytes = candidate.value?.bytes;
		if (bytes === undefined || bytes.length <= 8 || bytes[0] !== 0) continue;
		if (
			names[((bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8)) - 1] !==
			"W3PlayerAbilityManager"
		) {
			continue;
		}
		token = candidate;
		break;
	}
	if (token?.value === undefined) {
		throw new Error(
			"no player ability manager in this save: the player is identified by the `levelManager` that occurs once, and the ability manager before it is not a `W3PlayerAbilityManager`",
		);
	}
	const valueAt = token.offset + 12;
	const object = reflectValue(
		data,
		names,
		token.value.type,
		valueAt,
		token.value.bytes.length,
	);
	if (object === undefined) {
		throw new Error("the player ability manager does not decode");
	}
	const mutationsField = findField(object.fields, "mutations");
	if (mutationsField === undefined) {
		throw new Error("the player ability manager has no mutations array");
	}

	const indexOfName = new Map<string, number>();
	for (const [i, name] of names.entries()) indexOfName.set(name, i + 1);
	const interned = new Map<string, number>();
	const usedNames: string[] = [];
	for (const name of ENGINE_MUTATION_NAME_SUFFIX) {
		if (indexOfName.has(name)) continue;
		indexOfName.set(name, names.length + usedNames.length + 1);
		usedNames.push(name);
	}
	const intern = (name: string): number => {
		const already = interned.get(name);
		if (already !== undefined) return already;
		const existing = indexOfName.get(name);
		if (existing !== undefined) {
			interned.set(name, existing);
			return existing;
		}
		usedNames.push(name);
		const index = names.length + usedNames.length;
		interned.set(name, index);
		return index;
	};
	const inserts: Insert[] = [];
	let total = 0;
	let enumTypeIndex: number | undefined;
	const progressGrowth: { offset: number; width: number; within: number }[] =
		[];
	for (const item of mutationsField.value.items ?? []) {
		const typeField = findField(item.fields, "type");
		enumTypeIndex ??=
			typeField === undefined ? undefined : u16(data, typeField.offset - 6);
		const type = enumName(names, typeField?.value);
		if (type === "EPMT_MutationMaster") continue;
		const progress = findField(item.fields, "progress");
		if (progress === undefined) continue;
		const present = new Set(
			(progress.value.fields ?? []).map((field) => field.name),
		);
		let within = 0;
		for (const required of progress.value.fields ?? []) {
			if (!required.name.endsWith("Required")) continue;
			const usedName = `${required.name.slice(0, -"Required".length)}Used`;
			if (!(WANTED_USED as readonly string[]).includes(usedName)) continue;
			if (present.has(usedName)) continue;
			const record = new Uint8Array(12);
			const typeIndex = u16(data, required.offset - 6);
			const value = u32(data, required.offset);
			const nameIndex = intern(usedName);
			record[0] = nameIndex & 0xff;
			record[1] = (nameIndex >>> 8) & 0xff;
			record[2] = typeIndex & 0xff;
			record[3] = (typeIndex >>> 8) & 0xff;
			writeU32(record, 4, 8);
			writeU32(record, 8, value);
			inserts.push({ at: required.offset - 8, bytes: record });
			total += record.length;
			within += record.length;
		}
		if (within > 0) {
			progressGrowth.push({
				offset: progress.offset,
				width: progress.value.width,
				within,
			});
		}
	}
	const usedTotal = total;

	const existingEquip = findField(object.fields, "equippedMutation");
	let equippedRecord: Insert | undefined;
	const equipValue = equip === undefined ? undefined : indexOfName.get(equip);
	if (
		existingEquip === undefined &&
		enumTypeIndex !== undefined &&
		equipValue !== undefined
	) {
		const record = new Uint8Array(10);
		const nameIndex = intern("equippedMutation");
		record[0] = nameIndex & 0xff;
		record[1] = (nameIndex >>> 8) & 0xff;
		record[2] = enumTypeIndex & 0xff;
		record[3] = (enumTypeIndex >>> 8) & 0xff;
		writeU32(record, 4, 6);
		record[8] = equipValue & 0xff;
		record[9] = (equipValue >>> 8) & 0xff;
		equippedRecord = { at: mutationsField.offset - 8, bytes: record };
		total += record.length;
	}
	const patches: Insert[] =
		existingEquip !== undefined && equipValue !== undefined
			? [
					{
						at: existingEquip.offset,
						bytes: new Uint8Array([
							equipValue & 0xff,
							(equipValue >>> 8) & 0xff,
						]),
					},
				]
			: [];
	const stateRecords: Insert[] = [];
	const statePatches: Insert[] = [];
	const boolTypeIndex = indexOfName.get("Bool");
	const insertBoolean = (
		name: string,
		field: { name: string; value: ReflectedValue; offset: number } | undefined,
		wanted: boolean | undefined,
	): void => {
		if (wanted !== true) return;
		if (field === undefined) {
			if (boolTypeIndex === undefined) return;
			const nameIndex = intern(name);
			const record = new Uint8Array(9);
			record[0] = nameIndex & 0xff;
			record[1] = (nameIndex >>> 8) & 0xff;
			record[2] = boolTypeIndex & 0xff;
			record[3] = (boolTypeIndex >>> 8) & 0xff;
			writeU32(record, 4, 5);
			record[8] = 1;
			stateRecords.push({ at: mutationsField.offset - 8, bytes: record });
			total += record.length;
			return;
		}
		if (field.value.text !== "true") {
			statePatches.push({ at: field.offset, bytes: Uint8Array.of(1) });
		}
	};
	insertBoolean(
		"isMutationSystemEnabled",
		findField(object.fields, "isMutationSystemEnabled"),
		options.enableSystem,
	);
	insertBoolean(
		"mutationSkillSlotsInitialized",
		findField(object.fields, "mutationSkillSlotsInitialized"),
		options.initializeSlots,
	);

	const mutationTypes = (mutationsField.value.items ?? [])
		.map((item) => findField(item.fields ?? [], "type"))
		.map((field) =>
			field === undefined ? undefined : Number(field.value.text),
		)
		.filter(
			(value): value is number =>
				value !== undefined &&
				Number.isFinite(value) &&
				value >= 1 &&
				names[value - 1] !== "EPMT_MutationMaster",
		)
		.reverse();
	const equippedValue = new Uint8Array(4 + mutationTypes.length * 2);
	writeU32(equippedValue, 0, mutationTypes.length);
	mutationTypes.forEach((type, index) => {
		equippedValue[4 + index * 2] = type & 0xff;
		equippedValue[5 + index * 2] = (type >>> 8) & 0xff;
	});
	const equippedName = intern("equippedMutations");
	const equippedType = intern("array:2,0,EPlayerMutationType");
	const equippedField = new Uint8Array(8 + equippedValue.length);
	equippedField[0] = equippedName & 0xff;
	equippedField[1] = (equippedName >>> 8) & 0xff;
	equippedField[2] = equippedType & 0xff;
	equippedField[3] = (equippedType >>> 8) & 0xff;
	writeU32(equippedField, 4, equippedValue.length + 4);
	equippedField.set(equippedValue, 8);
	inserts.push({
		at: valueAt + token.value.bytes.length - 2,
		bytes: equippedField,
	});
	total += equippedField.length;

	if (
		inserts.length === 0 &&
		equippedRecord === undefined &&
		patches.length === 0 &&
		stateRecords.length === 0 &&
		statePatches.length === 0
	) {
		return { data, chunks: container.chunks };
	}
	if (equippedRecord !== undefined) inserts.push(equippedRecord);
	inserts.push(...stateRecords);
	patches.push(...statePatches);

	const { offset: manuStart, end: namesEnd } = namesEndOf(data);
	const extraNames = nameBytesOf(usedNames);
	const allInserts: Insert[] = [...inserts];
	if (extraNames.length > 0)
		allInserts.push({ at: namesEnd, bytes: extraNames });

	const { out, shiftAt } = splice(data, allInserts);

	writeU32(out, shiftAt(token.offset + 8), token.value.bytes.length + total);
	writeU32(
		out,
		shiftAt(mutationsField.offset - 4),
		mutationsField.value.width + usedTotal + 4,
	);
	for (const patch of patches) {
		out.set(patch.bytes, shiftAt(patch.at));
	}
	for (const progress of progressGrowth) {
		writeU32(
			out,
			shiftAt(progress.offset - 4),
			progress.width + progress.within + 4,
		);
	}

	writeU32(out, shiftAt(manuStart + 4), names.length + usedNames.length);
	for (const node of enclosing(data, valueAt)) {
		if (node.tag === "SS") {
			writeU32(out, shiftAt(node.offset + 2), node.childSize + total);
		} else {
			const at = shiftAt(node.offset + 6);
			const value = u16(out, at) + total;
			out[at] = value & 0xff;
			out[at + 1] = (value >>> 8) & 0xff;
		}
	}
	const checksumAt = shiftAt(valueAt + 30);
	out[checksumAt] = 0x48;
	out[checksumAt + 1] = 0xa0;

	return shiftSpanIndex(
		container,
		out,
		allInserts.map((insert) => ({
			at: insert.at,
			remove: 0,
			insert: insert.bytes.length,
		})),
	);
};
