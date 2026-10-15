import { readU32 } from "./inner";

type FactEntry = {
	readonly flag: number;
	readonly time: number;
	readonly validFor: number;
};

export type Fact = {
	readonly offset: number;
	readonly name: string;
	readonly value: number;
	readonly entries: readonly FactEntry[];
	readonly size: number;
};

type FactDB = {
	readonly offset: number;
	readonly declaredCount: number;
	readonly facts: readonly Fact[];
	readonly endOffset: number;
	readonly terminated: boolean;
	readonly skippedBytes: number;
};

const MAX_ENTRIES = 100_000;
const MAX_RECORDS = 2_000_000;

const u16 = (data: Uint8Array, o: number): number =>
	(data[o] ?? 0) | ((data[o + 1] ?? 0) << 8);

const f32 = (data: Uint8Array, o: number): number =>
	new DataView(data.buffer, data.byteOffset + o, 4).getFloat32(0, true);

const hasMagic = (data: Uint8Array, o: number, magic: string): boolean => {
	for (let i = 0; i < magic.length; i += 1) {
		if (data[o + i] !== magic.charCodeAt(i)) return false;
	}
	return true;
};

const findMagic = (data: Uint8Array, magic: string): number => {
	for (let i = 0; i + magic.length <= data.length; i += 1) {
		if (hasMagic(data, i, magic)) return i;
	}
	return -1;
};

type NamedRecord = {
	readonly end: number;
	readonly name: string;
	readonly count: number;
	readonly entries: readonly FactEntry[];
};

const readNamedRecord = (
	data: Uint8Array,
	at: number,
): NamedRecord | undefined => {
	const header = data[at] ?? 0;
	if ((header & 0x80) === 0) return undefined;
	const length = header & 0x7f;
	if (length < 1 || at + 1 + length > data.length) return undefined;

	let nameStart = at + 1;
	if (data[nameStart] === 0x01) nameStart += 1;
	for (let i = 0; i < length; i += 1) {
		if ((data[nameStart + i] ?? 0) === 0) return undefined;
	}
	if (nameStart + length + 4 > data.length) return undefined;

	let name = "";
	for (let i = 0; i < length; i += 1) {
		name += String.fromCharCode(data[nameStart + i] ?? 0);
	}

	let p = nameStart + length;
	const count = u16(data, p + 2);
	if (count > MAX_ENTRIES) return undefined;
	p += 4;
	const entries: FactEntry[] = [];
	for (let i = 0; i < count; i += 1) {
		if (p + 10 > data.length) return undefined;
		entries.push({
			flag: u16(data, p),
			time: f32(data, p + 2),
			validFor: f32(data, p + 6),
		});
		p += 10;
	}
	return { end: p, name, count, entries };
};

const findNamedRun = (data: Uint8Array, from: number): number => {
	for (let at = from; at + 6 < data.length; at += 1) {
		const first = readNamedRecord(data, at);
		if (first === undefined) continue;
		if (readNamedRecord(data, first.end) !== undefined) return at;
	}
	return -1;
};

export const readFactDB = (data: Uint8Array): FactDB | undefined => {
	const offset = findMagic(data, "SBDF");
	if (offset < 0) return undefined;
	const declaredCount = readU32(data, offset + 4) ?? 0;
	if (declaredCount > MAX_RECORDS) return undefined;

	const facts: Fact[] = [];
	let at = offset + 8;
	let skippedBytes = 0;
	while (facts.length < declaredCount && at + 6 < data.length) {
		const recordOffset = at;
		const named = readNamedRecord(data, at);
		if (named !== undefined) {
			facts.push({
				offset: recordOffset,
				name: named.name,
				value: named.count,
				entries: named.entries,
				size: named.end - recordOffset,
			});
			at = named.end;
			continue;
		}
		const next = findNamedRun(data, at + 1);
		if (next < 0) break;
		facts.push({
			offset: recordOffset,
			name: "",
			value: 0,
			entries: [],
			size: next - recordOffset,
		});
		skippedBytes += next - recordOffset;
		at = next;
	}

	return {
		offset,
		declaredCount,
		facts,
		endOffset: at,
		terminated: hasMagic(data, at, "EBDF"),
		skippedBytes,
	};
};
