import type { Bytes } from "../../shared/save/bytes";
import type { SaveContainer } from "./container";
import { buildContainer } from "./container-write";
import { readU32 } from "./inner";
import { type InventoryItem, playerInventory } from "./inventory";
import { readNameTable } from "./names";
import { readObjectTree } from "./objects";
import { parseTokens } from "./tokens";

type Resizable = {
	readonly data: Uint8Array;
	readonly chunks: SaveContainer["chunks"];
};

type AddItemRequest = {
	readonly name: string;
	readonly quantity: number;
	readonly template?: string;
};

const BASE = 3084;
const RECORD_SIZE = 30;

const u16 = (data: Uint8Array, at: number): number =>
	(data[at] ?? 0) | ((data[at + 1] ?? 0) << 8);
const u32 = (data: Uint8Array, at: number): number =>
	((data[at] ?? 0) |
		((data[at + 1] ?? 0) << 8) |
		((data[at + 2] ?? 0) << 16) |
		((data[at + 3] ?? 0) << 24)) >>>
	0;
const writeU16 = (data: Uint8Array, at: number, value: number): void => {
	data[at] = value & 0xff;
	data[at + 1] = (value >>> 8) & 0xff;
};
const writeU32 = (data: Uint8Array, at: number, value: number): void => {
	data[at] = value & 0xff;
	data[at + 1] = (value >>> 8) & 0xff;
	data[at + 2] = (value >>> 16) & 0xff;
	data[at + 3] = (value >>> 24) & 0xff;
};

const findSpanIndex = (data: Uint8Array): { at: number; count: number } => {
	for (let i = 0; i + 6 < data.length; i += 1) {
		if (data[i] !== 0x53 || data[i + 1] !== 0x43) continue;
		const count = u32(data, i + 2);
		if (i + 6 + count * 8 === data.length - 6) return { at: i, count };
	}
	throw new Error("this save has no SC span index; it cannot be resized here");
};

const namesEndOf = (data: Uint8Array): { offset: number; end: number } => {
	const table = readNameTable(data);
	let end = table.offset + 12;
	for (const name of table.names) end += 1 + name.length;
	return { offset: table.offset, end };
};

const recordOf = (data: Uint8Array, item: InventoryItem): Uint8Array =>
	data.slice(item.offset - 13, item.offset + 17);

const appendPoint = (
	data: Uint8Array,
	names: readonly string[],
	last: InventoryItem,
): number => {
	const tokens = parseTokens(data, names).tokens;
	const next = tokens.find((t) => t.offset > last.offset + 17);
	return next === undefined ? last.offset + 17 : next.offset - 6;
};

const maxItemId = (
	data: Uint8Array,
	items: readonly InventoryItem[],
): number => {
	let max = 0;
	for (const item of items) {
		const id = u16(data, item.offset - 11);
		if (id > max) max = id;
	}
	return max;
};

const appendNameBytes = (names: readonly string[]): Uint8Array => {
	for (const name of names) {
		if (name.length > 0xff) {
			throw new Error(
				`a MANU name is at most 255 bytes, but this one is ${name.length}: ${JSON.stringify(name.slice(0, 40))}…`,
			);
		}
		for (let i = 0; i < name.length; i += 1) {
			if (name.charCodeAt(i) > 0xff) {
				throw new Error(
					`a MANU name is latin-1, and ${JSON.stringify(name)} has a character above 0xff at index ${i}`,
				);
			}
		}
	}
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

const shiftSpanIndex = (
	data: Uint8Array,
	out: Uint8Array,
	itemInsert: number,
	recordLen: number,
	namesInsert: number,
	namesLen: number,
): void => {
	const original = findSpanIndex(data);
	const current = findSpanIndex(out);
	for (let i = 0; i < original.count; i += 1) {
		const from = original.at + 6 + i * 8;
		const start = u32(data, from) - BASE;
		const size = u32(data, from + 4);
		const end = start + size;
		let shift = 0;
		if (start >= itemInsert) shift += recordLen;
		if (start >= namesInsert) shift += namesLen;
		let grow = 0;
		if (start < itemInsert && itemInsert < end) grow += recordLen;
		if (start < namesInsert && namesInsert < end) grow += namesLen;
		const to = current.at + 6 + i * 8;
		writeU32(out, to, start + shift + BASE);
		writeU32(out, to + 4, size + grow);
	}
};

const rechunk = (
	container: Resizable,
	totalLength: number,
): SaveContainer["chunks"] => {
	const first = container.chunks[0];
	if (first === undefined) throw new Error("this save has no chunks");
	const unit = first.decompressedSize;
	const chunks: SaveContainer["chunks"][number][] = [];
	for (let start = 0; start < totalLength; start += unit) {
		const template =
			container.chunks[chunks.length] ??
			container.chunks[container.chunks.length - 1] ??
			first;
		chunks.push({
			...template,
			index: chunks.length,
			decompressedSize: Math.min(unit, totalLength - start),
		});
	}
	return chunks;
};

const resize = (
	container: Resizable,
	requests: readonly AddItemRequest[],
): { readonly data: Uint8Array; readonly chunks: SaveContainer["chunks"] } => {
	if (requests.length === 0) throw new Error("nothing to add");
	const data = container.data;
	const names = readNameTable(data).names;
	const items = playerInventory(data, names) ?? [];
	const first = items[0];
	const last = items[items.length - 1];
	if (first === undefined || last === undefined) {
		throw new Error("no player inventory in this save");
	}
	const recordLen = requests.length * RECORD_SIZE;
	const itemInsert = appendPoint(data, names, last);
	const countAt = first.offset - 15;
	const baseId = maxItemId(data, items) + 1;
	const { offset: manuStart, end: namesEnd } = namesEndOf(data);

	const missing = requests.map((request) => request.name);
	const nameBytes = appendNameBytes(missing);

	const records = new Uint8Array(recordLen);
	requests.forEach((request, index) => {
		const templateItem =
			items.find((item) => item.name === (request.template ?? "")) ?? first;
		const record = recordOf(data, templateItem).slice();
		writeU16(record, 0, names.length + index + 1);
		writeU16(record, 2, (baseId + index) & 0xffff);
		writeU16(record, 17, request.quantity);
		records.set(record, index * RECORD_SIZE);
	});

	const withRecords = new Uint8Array(data.length + recordLen);
	withRecords.set(data.subarray(0, itemInsert), 0);
	withRecords.set(records, itemInsert);
	withRecords.set(data.subarray(itemInsert), itemInsert + recordLen);
	writeU16(withRecords, countAt, u16(data, countAt) + requests.length);
	for (const node of enclosing(data, itemInsert)) {
		if (node.tag === "SS") {
			writeU32(withRecords, node.offset + 2, node.childSize + recordLen);
		} else {
			writeU16(withRecords, node.offset + 6, node.childSize + recordLen);
		}
	}

	const namesInsertAt = namesEnd + recordLen;
	const out = new Uint8Array(withRecords.length + nameBytes.length);
	out.set(withRecords.subarray(0, namesInsertAt), 0);
	out.set(nameBytes, namesInsertAt);
	out.set(
		withRecords.subarray(namesInsertAt),
		namesInsertAt + nameBytes.length,
	);
	writeU32(out, manuStart + recordLen + 4, names.length + missing.length);
	writeU32(
		out,
		out.length - 6,
		(readU32(data, data.length - 6) ?? 0) + recordLen + nameBytes.length,
	);

	shiftSpanIndex(data, out, itemInsert, recordLen, namesEnd, nameBytes.length);

	return {
		data: out,
		chunks: rechunk(container, out.length),
	};
};

export const addItemsToPayload = (
	container: Resizable,
	requests: readonly AddItemRequest[],
): { readonly data: Uint8Array; readonly chunks: SaveContainer["chunks"] } =>
	resize(container, requests);

export const addItems = (
	container: Resizable,
	requests: readonly AddItemRequest[],
): Bytes => {
	const { data, chunks } = resize(container, requests);
	return buildContainer(chunks, data);
};
