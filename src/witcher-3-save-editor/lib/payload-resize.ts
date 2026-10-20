import type { SaveContainer } from "./container";
import { readNameTable } from "./names";
import { type ObjectNode, readObjectTree } from "./objects";
import { parseTokens } from "./tokens";

export type Resizable = {
	readonly data: Uint8Array<ArrayBuffer>;
	readonly chunks: SaveContainer["chunks"];
};

const BASE = 3084;
export const CHUNK_BYTES = 1 << 20;

const u32 = (data: Uint8Array, at: number): number =>
	((data[at] ?? 0) |
		((data[at + 1] ?? 0) << 8) |
		((data[at + 2] ?? 0) << 16) |
		((data[at + 3] ?? 0) << 24)) >>>
	0;

export const writeU16 = (data: Uint8Array, at: number, value: number): void => {
	data[at] = value & 0xff;
	data[at + 1] = (value >>> 8) & 0xff;
};

export const writeU32 = (data: Uint8Array, at: number, value: number): void => {
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

export const namesEndOf = (
	data: Uint8Array,
): { offset: number; end: number } => {
	const table = readNameTable(data);
	let end = table.offset + 12;
	for (const name of table.names) end += 1 + name.length;
	return { offset: table.offset, end };
};

export const nameBytesOf = (
	names: readonly string[],
): Uint8Array<ArrayBuffer> => {
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
		for (let i = 0; i < name.length; i += 1) {
			bytes[at + i] = name.charCodeAt(i);
		}
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
	const walk = (nodes: readonly ObjectNode[]): boolean => {
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

const rechunk = (
	container: Resizable,
	totalLength: number,
): SaveContainer["chunks"] => {
	const first = container.chunks[0];
	if (first === undefined) throw new Error("this save has no chunks");
	const unit = CHUNK_BYTES;
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

export type IndexShift = {
	readonly at: number;
	readonly remove: number;
	readonly insert: number;
};

type SpanEntry = {
	readonly start: number;
	readonly size: number;
};

const readIndex = (data: Uint8Array): SpanEntry[] => {
	const index = findSpanIndex(data);
	const entries: SpanEntry[] = [];
	for (let i = 0; i < index.count; i += 1) {
		const at = index.at + 6 + i * 8;
		entries.push({ start: u32(data, at), size: u32(data, at + 4) });
	}
	return entries;
};

const findRootIndex = (
	data: Uint8Array,
	manuAt: number,
): { readonly at: number; readonly count: number } | undefined => {
	for (let at = manuAt - 2; at >= 0; at -= 1) {
		if (data[at] !== 0x52 || data[at + 1] !== 0x42) continue;
		const count = u32(data, at + 2);
		if (count > 100_000) continue;
		if (at + 6 + count * 6 === manuAt - 2) return { at, count };
	}
	return undefined;
};

const shiftPosition = (
	position: number,
	isEnd: boolean,
	shifts: readonly IndexShift[],
): number => {
	let shift = 0;
	for (const move of shifts) {
		const removedEnd = move.at + move.remove;
		const delta = move.insert - move.remove;
		if (
			position > removedEnd ||
			(position === removedEnd && (!isEnd || move.remove > 0))
		) {
			shift += delta;
			continue;
		}
		if (position > move.at) return move.at + move.insert;
	}
	return position + shift;
};

export const shiftSpanIndex = (
	container: Resizable,
	out: Uint8Array<ArrayBuffer>,
	shifts: readonly IndexShift[],
): Resizable => {
	const original = container.data;
	const from = findSpanIndex(original);
	const to = findSpanIndex(out);
	const footer = u32(original, original.length - 6);
	const split = footer - from.at;
	readIndex(original).forEach((entry, i) => {
		const start = entry.start - BASE;
		const end = start + entry.size;
		const nextStart = shiftPosition(start, false, shifts);
		const nextEnd = shiftPosition(end, true, shifts);
		const at = to.at + 6 + i * 8;
		writeU32(out, at, nextStart + BASE);
		writeU32(out, at + 4, Math.max(0, nextEnd - nextStart));
	});
	writeU32(out, out.length - 6, to.at + split);
	const root = findRootIndex(original, readNameTable(original).offset);
	if (root !== undefined) {
		const nextRoot = findRootIndex(out, readNameTable(out).offset);
		if (nextRoot !== undefined) {
			for (let i = 0; i < root.count; i += 1) {
				const fromAt = root.at + 6 + i * 6;
				const toAt = nextRoot.at + 6 + i * 6;
				const payloadAt = u32(original, fromAt + 2) - BASE;
				writeU32(out, toAt + 2, shiftPosition(payloadAt, false, shifts) + BASE);
			}
		}
		const rootShift = shiftPosition(root.at, false, shifts) - root.at;
		writeU32(out, to.at - 8, u32(original, from.at - 8) + rootShift);
		writeU32(out, to.at - 4, u32(original, from.at - 4) + rootShift);
	}
	return { data: out, chunks: rechunk(container, out.length) };
};

export const replaceRange = (
	container: Resizable,
	at: number,
	removeLength: number,
	insert: Uint8Array<ArrayBuffer>,
	fieldSizeAt?: number,
): Resizable => {
	const data = container.data;
	if (at < 0 || removeLength < 0 || at + removeLength > data.length) {
		throw new Error(
			`cannot replace ${removeLength} byte(s) at ${at} in a ${data.length}-byte payload`,
		);
	}
	const delta = insert.length - removeLength;
	const out = new Uint8Array(data.length + delta);
	out.set(data.subarray(0, at), 0);
	out.set(insert, at);
	out.set(data.subarray(at + removeLength), at + insert.length);
	if (delta === 0) {
		return { data: out, chunks: container.chunks };
	}
	if (fieldSizeAt !== undefined) {
		writeU32(out, fieldSizeAt, u32(data, fieldSizeAt) + delta);
	}
	for (const node of enclosing(data, at)) {
		if (node.tag === "SS") {
			writeU32(out, node.offset + 2, node.childSize + delta);
		} else {
			writeU16(out, node.offset + 6, node.childSize + delta);
		}
	}
	const names = readNameTable(data).names;
	for (const token of parseTokens(data, names).tokens) {
		if (token.tag !== "PORP" && token.tag !== "AVAL") continue;
		const length = token.value?.bytes.length;
		if (length === undefined) continue;
		const start = token.offset + 12;
		if (start <= at && at <= start + length) {
			writeU32(out, token.offset + 8, length + delta);
		}
	}
	return shiftSpanIndex(container, out, [
		{ at, remove: removeLength, insert: insert.length },
	]);
};
