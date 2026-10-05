/**
 * Adding native inventory records — the one operation this editor could not do.
 *
 * The item list is a native blob inside an `SS entityData` frame; a `u16` count
 * sits immediately before the first record. This module grows the stream on
 * purpose, which the width-preserving scalar edits deliberately never do, so it
 * repairs every structure that addresses the decompressed stream:
 *
 * 1. append the new name to `MANU` (each name is `u8 length` + ASCII),
 * 2. insert a 30-byte record per item into the player's list and `count++`,
 * 3. grow the `SS` frame's `childSize` (the `BS` ancestors carry no size),
 * 4. shift/grow every `SC` span entry — `(start + 3084, size)` — that lies after
 *    or encloses an insert,
 * 5. move the footer's variable-table offset, and
 * 6. rebuild the container around the longer payload.
 *
 * Measured on `ManualSave_52586_7ea48c00_591a1d1.sav`: adding the three Greater
 * mutagens gives names +2, items +3, and the object tree still resolves to the
 * same 75,183 spans / 35 roots — i.e. the stream is self-consistent.
 *
 * What is **not** proven here: that the game loads the result. Only launching
 * The Witcher 3 settles that.
 */

import type { SaveContainer } from "./container";
import { buildContainer } from "./container-write";
import { readU32 } from "./inner";
import { type InventoryItem, playerInventory } from "./inventory";
import { readNameTable } from "./names";
import { readObjectTree } from "./objects";

type AddItemRequest = {
	/** template name, resolved through the save's `MANU` (appended when absent) */
	readonly name: string;
	readonly quantity: number;
	/** an item to clone the record's flags from; defaults to the first item */
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

/** `"SC" | u32 count | count × (u32, u32)`, ending exactly at `len - 6`. */
const findSpanIndex = (data: Uint8Array): { at: number; count: number } => {
	for (let i = 0; i + 6 < data.length; i += 1) {
		if (data[i] !== 0x53 || data[i + 1] !== 0x43) continue;
		const count = u32(data, i + 2);
		if (i + 6 + count * 8 === data.length - 6) return { at: i, count };
	}
	throw new Error("this save has no SC span index; it cannot be resized here");
};

/** The last byte of the `MANU` names, before the 4-byte pad and `ENOD`. */
const namesEndOf = (data: Uint8Array): { offset: number; end: number } => {
	const table = readNameTable(data);
	let end = table.offset + 12;
	for (const name of table.names) end += 1 + name.length;
	return { offset: table.offset, end };
};

/** One item record, 30 bytes ending 17 past its `72 00 74 00` anchor. */
const recordOf = (data: Uint8Array, item: InventoryItem): Uint8Array =>
	data.slice(item.offset - 13, item.offset + 17);

const mustFind = (
	items: readonly InventoryItem[],
	predicate: (item: InventoryItem) => boolean,
	message: string,
): InventoryItem => {
	const found = items.find(predicate) ?? items[0];
	if (found === undefined) throw new Error(message);
	return found;
};

const appendNameBytes = (names: readonly string[]): Uint8Array => {
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

/**
 * Add one record per request to the player's inventory, returning the rebuilt
 * file. Names already in `MANU` are reused; only the new ones are appended.
 */
export const addItems = (
	container: SaveContainer,
	requests: readonly AddItemRequest[],
): Uint8Array => {
	if (requests.length === 0) throw new Error("nothing to add");
	const data = container.data;
	const names = readNameTable(data).names;
	const items = playerInventory(data, names) ?? [];
	const first = items[0];
	const second = items[1];
	if (first === undefined) throw new Error("no player inventory in this save");

	const recordLen = requests.length * RECORD_SIZE;
	const itemInsert = (second ?? first).offset - 13;
	const countAt = first.offset - 15;
	const { offset: manuStart, end: namesEnd } = namesEndOf(data);

	const missing = requests
		.map((request) => request.name)
		.filter(
			(name, index, all) =>
				names.indexOf(name) < 0 && all.indexOf(name) === index,
		);
	const nameBytes = appendNameBytes(missing);
	const nameIndex = (name: string): number => {
		const existing = names.indexOf(name);
		return existing >= 0
			? existing + 1
			: names.length + missing.indexOf(name) + 1;
	};

	const records = new Uint8Array(recordLen);
	const templateItem = mustFind(
		items,
		(item) => item.name === (requests[0]?.template ?? ""),
		"no items to clone a record from",
	);
	const template = recordOf(data, templateItem);
	requests.forEach((request, index) => {
		const record = template.slice();
		writeU16(record, 0, nameIndex(request.name));
		writeU16(record, 17, request.quantity);
		records.set(record, index * RECORD_SIZE);
	});

	// Insert the records, then the names.
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

	const chunks = container.chunks.map((chunk, index) => {
		const start = container.chunks
			.slice(0, index)
			.reduce((sum, c) => sum + c.decompressedSize, 0);
		const inRecords =
			start <= itemInsert && itemInsert < start + chunk.decompressedSize
				? recordLen
				: 0;
		const inNames =
			start <= namesEnd && namesEnd < start + chunk.decompressedSize
				? nameBytes.length
				: 0;
		return {
			...chunk,
			decompressedSize: chunk.decompressedSize + inRecords + inNames,
		};
	});
	return buildContainer(chunks, out);
};

/** The `BLCK`/`SS` frames on the path from a root down to `offset`. */
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

/**
 * Apply both insertions to the `SC` index in one pass, from the original
 * entries: a span that starts at/after an insert shifts by that insert's length;
 * a span that encloses one grows by it.
 */
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
