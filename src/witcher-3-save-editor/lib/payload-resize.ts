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

const updateSpanIndex = (
	original: Uint8Array,
	out: Uint8Array,
	at: number,
	delta: number,
): void => {
	if (delta === 0) return;
	const from = findSpanIndex(original);
	const to = findSpanIndex(out);
	for (let i = 0; i < from.count; i += 1) {
		const fromAt = from.at + 6 + i * 8;
		const start = u32(original, fromAt) - BASE;
		const size = u32(original, fromAt + 4);
		const end = start + size;
		let nextStart = start;
		let nextSize = size;
		if (at <= start) {
			nextStart = start + delta;
		} else if (at < end) {
			nextSize = size + delta;
		}
		const toAt = to.at + 6 + i * 8;
		writeU32(out, toAt, nextStart + BASE);
		writeU32(out, toAt + 4, nextSize);
	}
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
	updateSpanIndex(data, out, at, delta);
	writeU32(out, out.length - 6, u32(data, data.length - 6) + delta);
	return { data: out, chunks: rechunk(container, out.length) };
};
