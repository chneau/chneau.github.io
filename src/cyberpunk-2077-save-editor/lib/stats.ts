import type { Bytes } from "../../shared";

const CAPACITY_CLASS = "gameConstantStatModifier";
const CAPACITY_STAT = "Humanity";
const CARRY_STAT = "CarryCapacity";
const STATS_CHUNK = "gameStatsStateMapStructure";
const VALUE_WIDTH = 4;

const fnv1a64 = (text: string): bigint => {
	let hash = 0xcbf29ce484222325n;
	for (const byte of new TextEncoder().encode(text)) {
		hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
	}
	return hash;
};

const PACKAGE_SECTIONS = 6;
const MAX_DEPTH = 12;

type Field = {
	readonly name: string;
	readonly type: string;
	readonly at: number;
};

type Package = {
	readonly bytes: Bytes;
	readonly names: readonly string[];
	readonly chunks: readonly { readonly name: string; readonly at: number }[];
};

const readerOf = (bytes: Bytes) =>
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const u16At = (bytes: Bytes, at: number): number =>
	readerOf(bytes).getUint16(at, true);

const u32At = (bytes: Bytes, at: number): number =>
	readerOf(bytes).getUint32(at, true);

const u64At = (bytes: Bytes, at: number): bigint =>
	readerOf(bytes).getBigUint64(at, true);

const readPackage = (bytes: Bytes): Package | undefined => {
	if (bytes.length < 16) return undefined;
	const view = readerOf(bytes);
	if (view.getUint8(0) !== 4) return undefined;
	const sections = view.getUint16(2, true);
	let at = 4;
	at += 4;
	if (sections === 7) at += 8;
	if (sections !== PACKAGE_SECTIONS && sections !== 7) return undefined;
	const namesStart = view.getUint32(at, true);
	const namesEnd = view.getUint32(at + 4, true);
	const descriptorsStart = view.getUint32(at + 8, true);
	const descriptorsEnd = view.getUint32(at + 12, true);
	const base = at + 16;
	if (
		namesStart > namesEnd ||
		namesEnd > descriptorsStart ||
		descriptorsStart > descriptorsEnd
	) {
		return undefined;
	}

	const names: string[] = [];
	const decoder = new TextDecoder();
	for (let entry = namesStart; entry < namesEnd; entry += 4) {
		const offset = u32At(bytes, base + entry) & 0xffffff;
		const from = base + offset;
		let to = from;
		while (to < bytes.length && bytes[to] !== 0) to += 1;
		names.push(decoder.decode(bytes.subarray(from, to)));
	}

	const chunks: { name: string; at: number }[] = [];
	for (let entry = descriptorsStart; entry < descriptorsEnd; entry += 8) {
		const nameIndex = u32At(bytes, base + entry);
		const offset = u32At(bytes, base + entry + 4);
		const name = names[nameIndex];
		if (name === undefined) return undefined;
		chunks.push({ name, at: base + offset });
	}

	return { bytes, names, chunks };
};

const fieldsAt = (
	bytes: Bytes,
	names: readonly string[],
	at: number,
): Field[] => {
	const count = u16At(bytes, at);
	const fields: Field[] = [];
	for (let index = 0; index < count; index += 1) {
		const entry = at + 2 + index * 8;
		const name = names[u16At(bytes, entry)];
		const type = names[u16At(bytes, entry + 2)];
		if (name === undefined || type === undefined) return [];
		fields.push({ name, type, at: at + u32At(bytes, entry + 4) });
	}
	return fields;
};

const SCALAR_SIZES: Readonly<Record<string, number>> = {
	Int8: 1,
	Uint8: 1,
	Bool: 1,
	Int16: 2,
	Uint16: 2,
	CName: 2,
	Int32: 4,
	Uint32: 4,
	Float: 4,
	Int64: 8,
	Uint64: 8,
	Double: 8,
	TweakDBID: 8,
};

const valueLength = (
	bytes: Bytes,
	names: readonly string[],
	type: string,
	at: number,
	depth: number,
): number => {
	if (depth > MAX_DEPTH) return 0;
	if (type.startsWith("array:")) {
		const count = u32At(bytes, at);
		let cursor = at + 4;
		for (let index = 0; index < count; index += 1) {
			cursor += valueLength(bytes, names, type.slice(6), cursor, depth + 1);
			if (cursor > bytes.length) return 0;
		}
		return cursor - at;
	}
	const scalar = SCALAR_SIZES[type];
	if (scalar !== undefined) return scalar;
	if (type.startsWith("gamedata") || type === "gameStatIDType") return 2;
	if (type.startsWith("handle:")) return 4;
	return classLength(bytes, names, at, depth + 1);
};

const classLength = (
	bytes: Bytes,
	names: readonly string[],
	at: number,
	depth: number,
): number => {
	if (depth > MAX_DEPTH) return 0;
	const count = u16At(bytes, at);
	let end = at + 2 + count * 8;
	for (let index = 0; index < count; index += 1) {
		const entry = at + 2 + index * 8;
		const type = names[u16At(bytes, entry + 2)];
		if (type === undefined) return 0;
		const fieldAt = at + u32At(bytes, entry + 4);
		const fieldSize = valueLength(bytes, names, type, fieldAt, depth + 1);
		end = Math.max(end, fieldAt + fieldSize);
	}
	return end - at;
};

const classesAt = (
	bytes: Bytes,
	names: readonly string[],
	at: number,
): readonly (readonly Field[])[] => {
	const count = u32At(bytes, at);
	const classes: Field[][] = [];
	let cursor = at + 4;
	for (let index = 0; index < count; index += 1) {
		if (cursor + 2 > bytes.length) return classes;
		const length = classLength(bytes, names, cursor, 0);
		if (length <= 0) return classes;
		classes.push(fieldsAt(bytes, names, cursor));
		cursor += length;
	}
	return classes;
};

const fieldIn = (fields: readonly Field[], name: string): Field | undefined =>
	fields.find((field) => field.name === name);

const exact = (value: number): number => Number(value.toPrecision(7));

export type StatModifier = {
	readonly stat: bigint;
	readonly modifier: number;
	readonly statAt: number;
	readonly valueAt: number;
	readonly value: number;
};

const readEntries = (
	bytes: Bytes,
	start: number,
	end: number,
): readonly StatModifier[] => {
	const entries: StatModifier[] = [];
	const view = readerOf(bytes);
	let at = start;
	while (at < end) {
		const length = bytes[at] ?? 0;
		at += 1;
		const negative = (length & 0x80) !== 0;
		let packed = length & 0x3f;
		let more = (length & 0x40) !== 0;
		let shift = 6;
		while (more) {
			const byte = bytes[at] ?? 0;
			at += 1;
			packed |= (byte & 0x7f) << shift;
			shift += 7;
			more = (byte & 0x80) !== 0;
		}
		if (!negative || shift > 13) return entries;
		const nameEnd = at + packed;
		if (nameEnd > end) return entries;
		const className = new TextDecoder().decode(bytes.subarray(at, nameEnd));
		at = nameEnd;
		if (at + 12 > end) return entries;
		const stat = u64At(bytes, at);
		const modifier = u32At(bytes, at + 8);
		at += 12;
		if (className === CAPACITY_CLASS) {
			if (at + VALUE_WIDTH > end) return entries;
			entries.push({
				stat,
				modifier,
				statAt: at - 12,
				valueAt: at,
				value: view.getFloat32(at, true),
			});
			at += VALUE_WIDTH;
		} else if (className === "gameCombinedStatModifier") {
			at += 20;
		} else if (className === "gameCurveStatModifier") {
			at += valueLength(bytes, [], "CName", at, 0);
			return entries;
		} else {
			return entries;
		}
	}
	return at === end ? entries : entries;
};

export type CapacityModifier = {
	readonly statAt: number;
	readonly valueAt: number;
	readonly value: number;
};

export const playerStatModifiers = (
	bytes: Bytes,
): readonly StatModifier[] => {
	const packageInfo = readPackage(bytes.subarray(4));
	if (packageInfo === undefined) return [];
	const chunk = packageInfo.chunks.find((entry) => entry.name === STATS_CHUNK);
	if (chunk === undefined) return [];
	const fields = fieldsAt(packageInfo.bytes, packageInfo.names, chunk.at);
	const values = fieldIn(fields, "valuesOptimized");
	const sliceField = fieldIn(fields, "sharedBufferSlices");
	const bufferField = fieldIn(fields, "sharedDataBuffer");
	if (
		values === undefined ||
		sliceField === undefined ||
		bufferField === undefined
	) {
		return [];
	}

	const rows = classesAt(packageInfo.bytes, packageInfo.names, values.at);
	const player = rows.find((row) => {
		const hash = fieldIn(row, "entityHash");
		return hash !== undefined && u64At(packageInfo.bytes, hash.at) === 1n;
	});
	if (player === undefined) return [];
	const indices = fieldIn(player, "bufferSliceIndices");
	if (indices === undefined) return [];

	const slices = classesAt(packageInfo.bytes, packageInfo.names, sliceField.at);
	const bufferLength = u32At(packageInfo.bytes, bufferField.at);
	const bufferStart = bufferField.at + 4;
	const buffer = packageInfo.bytes.subarray(
		bufferStart,
		Math.min(bufferStart + bufferLength, packageInfo.bytes.length),
	);

	const count = u32At(packageInfo.bytes, indices.at);
	const found: StatModifier[] = [];
	for (let index = 0; index < count; index += 1) {
		const sliceIndex = u16At(packageInfo.bytes, indices.at + 4 + index * 2);
		const slice = slices[sliceIndex];
		if (slice === undefined) continue;
		const offsetField = fieldIn(slice, "offset");
		const combinedField = fieldIn(slice, "combined");
		const offset =
			offsetField === undefined ? 0 : u32At(packageInfo.bytes, offsetField.at);
		const combined =
			combinedField === undefined
				? 0
				: u32At(packageInfo.bytes, combinedField.at);
		const end = offset + (combined & 0x3fffffff);
		if (offset > buffer.length || end > buffer.length) continue;
		const entries = readEntries(buffer, offset, end);
		for (const entry of entries) {
			found.push({
				stat: entry.stat,
				modifier: entry.modifier,
				statAt: 4 + bufferStart + entry.statAt,
				valueAt: 4 + bufferStart + entry.valueAt,
				value: entry.value,
			});
		}
	}
	return found;
};

const modifiersOf = (
	bytes: Bytes,
	statName: string,
): readonly StatModifier[] => {
	const statHash = fnv1a64(statName);
	return playerStatModifiers(bytes).filter(
		(entry) => entry.stat === statHash && entry.modifier === 0,
	);
};

export const capacityModifiers = (bytes: Bytes): readonly StatModifier[] =>
	modifiersOf(bytes, CAPACITY_STAT);

export const statValues = (
	bytes: Bytes,
	names: readonly string[],
): readonly number[] => {
	const byStat = new Map<bigint, StatModifier[]>();
	for (const entry of playerStatModifiers(bytes)) {
		const list = byStat.get(entry.stat);
		if (list === undefined) byStat.set(entry.stat, [entry]);
		else list.push(entry);
	}
	return names.map((name) => {
		const list = byStat.get(fnv1a64(name));
		const [only] = list ?? [];
		return list !== undefined && list.length === 1 && only !== undefined
			? exact(only.value)
			: 0;
	});
};

export const writeStatValues = (
	bytes: Bytes,
	values: readonly { readonly name: string; readonly value: number }[],
): void => {
	const entries = playerStatModifiers(bytes);
	const byStat = new Map<bigint, StatModifier[]>();
	for (const entry of entries) {
		const list = byStat.get(entry.stat);
		if (list === undefined) byStat.set(entry.stat, [entry]);
		else list.push(entry);
	}
	const spares = entries.filter(
		(entry) => entry.stat === fnv1a64(CAPACITY_STAT) && entry.value === 0,
	);
	const view = readerOf(bytes);
	let spareAt = 0;
	for (const { name, value } of values) {
		if (!Number.isFinite(value)) continue;
		const list = byStat.get(fnv1a64(name)) ?? [];
		const [only] = list;
		if (only !== undefined) {
			if (list.length === 1 && only.value !== value) {
				view.setFloat32(only.valueAt, value, true);
			}
			continue;
		}
		if (value === 0) continue;
		const spare = spares[spareAt];
		if (spare === undefined) {
			throw new Error(
				`This save has no spare stat modifier left to carry a ${name} bonus.`,
			);
		}
		spareAt += 1;
		view.setBigUint64(spare.statAt, fnv1a64(name), true);
		view.setFloat32(spare.valueAt, value, true);
	}
};

export const statBonus = (bytes: Bytes, statName: string): number | null => {
	const modifiers = modifiersOf(bytes, statName);
	return modifiers.length === 0
		? null
		: exact(modifiers.reduce((total, modifier) => total + modifier.value, 0));
};

export const setStatBonus = (
	bytes: Bytes,
	statName: string,
	value: number,
): void => {
	if (!Number.isFinite(value)) {
		throw new Error(
			`${statName} is an additive float, so ${value} cannot be written to this save.`,
		);
	}
	const existing = modifiersOf(bytes, statName);
	if (existing.length > 1) {
		throw new Error(
			`This save spreads ${statName} over ${existing.length} modifiers, so it is left alone.`,
		);
	}
	const view = readerOf(bytes);
	const [only] = existing;
	if (only !== undefined) {
		if (only.value !== value) view.setFloat32(only.valueAt, value, true);
		return;
	}
	if (value === 0) return;
	const spare = modifiersOf(bytes, CAPACITY_STAT).find(
		(modifier) => modifier.value === 0,
	);
	if (spare === undefined) {
		throw new Error(
			`This save has no spare stat modifier to carry a ${statName} bonus.`,
		);
	}
	view.setBigUint64(spare.statAt, fnv1a64(statName), true);
	view.setFloat32(spare.valueAt, value, true);
};

export const setCarryCapacity = (bytes: Bytes, capacity: number): void =>
	setStatBonus(bytes, CARRY_STAT, capacity);

export const carryCapacityBonus = (bytes: Bytes): number | null =>
	statBonus(bytes, CARRY_STAT);

export const capacityBonusOf = (
	modifiers: readonly StatModifier[],
): number | null =>
	modifiers.length === 0
		? null
		: modifiers.reduce((total, modifier) => total + modifier.value, 0);

export const setCapacityBonus = (bytes: Bytes, bonus: number): void => {
	if (!Number.isFinite(bonus) || bonus < 0) {
		throw new Error(
			`Cyberware capacity is an additive float, so ${bonus} cannot be written to this save.`,
		);
	}
	const modifiers = capacityModifiers(bytes);
	if (modifiers.length === 0) {
		throw new Error(
			"This save records no additive Humanity modifier, so its cyberware capacity cannot be raised in place.",
		);
	}
	if (capacityBonusOf(modifiers) === bonus) return;
	const view = readerOf(bytes);
	for (const [position, modifier] of modifiers.entries()) {
		view.setFloat32(modifier.valueAt, position === 0 ? bonus : 0, true);
	}
};
