/**
 * Adding native inventory records — the one operation this editor could not do.
 *
 * The item list is a native blob inside an `SS entityData` frame; a `u16` count
 * sits immediately before the first record. This module grows the stream on
 * purpose, which the width-preserving scalar edits deliberately never do, so it
 * repairs every structure that addresses the decompressed stream:
 *
 * 1. append the new name to `MANU` (each name is `u8 length` + ASCII),
 * 2. append a 30-byte record per item at the end of the player's list and
 *    `count++` — the engine appends just before the list's 6-byte trailer,
 *    and gives each new record a fresh per-item id (see `appendPoint`),
 * 3. grow the `SS` frame's `childSize` (the `BS` ancestors carry no size),
 * 4. shift/grow every `SC` span entry — `(start + 3084, size)` — that lies after
 *    or encloses an insert,
 * 5. move the footer's variable-table offset, and
 * 6. report the chunk table with the inserted bytes charged to their chunks.
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
import { parseTokens } from "./tokens";

/** The parts of a container a resize needs; a `SaveContainer` satisfies it. */
type Resizable = {
	readonly data: Uint8Array;
	readonly chunks: SaveContainer["chunks"];
};

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

/** One item record, 30 bytes ending 17 past its build's tag pair. */
const recordOf = (data: Uint8Array, item: InventoryItem): Uint8Array =>
	data.slice(item.offset - 13, item.offset + 17);

/**
 * Where the engine appends a new record: just before the item array's 6-byte
 * trailer. Measured from a game-made `additem`: the array is `[records…]` then 6
 * bytes, and the new record went immediately before them, so read order stays
 * insertion order. The trailer length is established by the first token after
 * the last record — `next - 6` lands exactly where the engine wrote it.
 */
const appendPoint = (
	data: Uint8Array,
	names: readonly string[],
	last: InventoryItem,
): number => {
	const tokens = parseTokens(data, names).tokens;
	const next = tokens.find((t) => t.offset > last.offset + 17);
	return next === undefined ? last.offset + 17 : next.offset - 6;
};

/** The largest per-item u16 id in the list, so new records get fresh ones. */
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
		// A `MANU` name is a **one-byte** length then that many bytes, and nothing
		// bounded the length before it was written. A 300-character name wrapped to
		// `300 & 0xff = 44`: the rebuilt table parsed a 44-character name, resolved
		// the new item to it, and left 256 orphan bytes between the last name and
		// `ENOD` — which the *next* resize then measured as the end of the table and
		// inserted into the middle of. A character above `0xff` truncates the same
		// way. Refusing is the only honest option: the format cannot carry it, and a
		// written-and-corrupt name is worse than a refused action.
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

/** The container's chunk table with the inserted bytes charged to their chunks. */
/**
 * Re-emit the chunk table the way the game writes it: every chunk decompresses
 * to the same `unit` (1 MiB in every observed save) except the last. The first
 * version grew whichever chunk the insert landed in, which the decoder reads
 * happily but the engine's loader appears not to — its own files are always
 * 1 MiB chunks, and a 1 MiB + 90 one is where "save game data is not available"
 * came from.
 */
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

/** The insertion itself; returns the resized payload and its chunk table. */
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
	// Append, the way the engine does: after the last record and before the
	// list's 6-byte trailer. Prepending and cloning the template's id are the two
	// things a game-made `additem` showed to be wrong.
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
		// The game assigns a fresh per-item id; reusing the template's is what
		// failed before. The id is the `u16` at the start of the 11-byte identity.
		writeU16(record, 2, (baseId + index) & 0xffff);
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

	return {
		data: out,
		chunks: rechunk(container, out.length),
	};
};

/**
 * The resized decompressed payload and its chunk table, without rebuilding the
 * container — `encode` composes this with its own scalar edits.
 */
export const addItemsToPayload = (
	container: Resizable,
	requests: readonly AddItemRequest[],
): { readonly data: Uint8Array; readonly chunks: SaveContainer["chunks"] } =>
	resize(container, requests);

/** Add items and rebuild the whole file (the CLI path). */
export const addItems = (
	container: Resizable,
	requests: readonly AddItemRequest[],
): Uint8Array => {
	const { data, chunks } = resize(container, requests);
	return buildContainer(chunks, data);
};
