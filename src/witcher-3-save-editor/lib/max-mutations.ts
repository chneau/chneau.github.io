/**
 * Max every Blood-and-Wine mutation, the way the game does.
 *
 * A mutation is "researched" when `GetMutationResearchProgress >= 100`, and that
 * reads the four `*Used` counters — which the engine recomputes on load
 * (`LoadMutationData`), so writing `overallProgress` alone does nothing. The
 * `*Used` fields are omitted from the stream at their default 0, so maxing them
 * is a **resize**, not a value patch.
 *
 * This rebuilds the player's `W3PlayerAbilityManager` object: for every
 * `SMutation`, each present `*Required` gets a matching `*Used` field (a 12-byte
 * record, `[u16 nameIdx][u16 typeIdx][u32 8][u32 value]`) inserted immediately
 * before it, with `value = required`. The field records are `size`-framed at
 * every level, so the enclosing `progress` field, the `mutations` field and the
 * `abilityManager` `PORP` length all grow by the inserted bytes, and the new
 * `*Used` names are appended to `MANU`. The `SC` span index and the enclosing
 * `SS`/`BLCK` frames are then repaired, exactly as the item insert does.
 *
 * `EPMT_MutationMaster` is skipped: its progress is derived from the count of
 * the others, and the game never writes `*Used` for it (verified against a
 * save the engine itself maxed).
 */

import type { SaveContainer } from "./container";
import { buildContainer } from "./container-write";
import { readU32 } from "./inner";
import { readNameTable } from "./names";
import { readObjectTree } from "./objects";
import { type ReflectedValue, reflectValue } from "./reflect";
import { parseTokens } from "./tokens";

type Resizable = {
	readonly data: Uint8Array;
	readonly chunks: SaveContainer["chunks"];
};

const BASE = 3084;

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

type Insert = { readonly at: number; readonly bytes: Uint8Array };

const splice = (
	data: Uint8Array,
	inserts: readonly Insert[],
): { out: Uint8Array; shiftAt: (at: number) => number } => {
	const sorted = [...inserts].sort((a, b) => a.at - b.at);
	let total = 0;
	for (const insert of sorted) total += insert.bytes.length;
	const out = new Uint8Array(data.length + total);
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

/** Grow every `SC` span that starts after, or encloses, any insertion. */
const updateSpanIndex = (
	original: Uint8Array,
	out: Uint8Array,
	inserts: readonly Insert[],
): void => {
	const from = findSpanIndex(original);
	const to = findSpanIndex(out);
	for (let i = 0; i < from.count; i += 1) {
		const at = from.at + 6 + i * 8;
		const start = u32(original, at) - BASE;
		const size = u32(original, at + 4);
		const end = start + size;
		let shift = 0;
		let grow = 0;
		for (const insert of inserts) {
			if (insert.at <= start) shift += insert.bytes.length;
			else if (insert.at < end) grow += insert.bytes.length;
		}
		const dest = to.at + 6 + i * 8;
		writeU32(out, dest, start + shift + BASE);
		writeU32(out, dest + 4, size + grow);
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

const findField = (
	fields: readonly { name: string; value: ReflectedValue; offset: number }[] | undefined,
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

/** The resized payload and its chunk table. */
export const maxMutationsInPayload = (
	container: Resizable,
): { readonly data: Uint8Array; readonly chunks: SaveContainer["chunks"] } => {
	const data = container.data;
	const names = readNameTable(data).names;
	const { tokens } = parseTokens(data, names);
	const token = tokens.find((t) => {
		const bytes = t.value?.bytes;
		return (
			t.name === "abilityManager" &&
			bytes !== undefined &&
			bytes.length > 8 &&
			bytes[0] === 0 &&
			bytes[1] === 1 &&
			names[((bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8)) - 1] ===
				"W3PlayerAbilityManager"
		);
	});
	if (token?.value === undefined) {
		throw new Error("no player ability manager in this save");
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

	// Which `*Used` names are needed, and at what MANU index.
	const usedNames: string[] = [];
	const indexOfName = new Map<string, number>();
	for (const [i, name] of names.entries()) indexOfName.set(name, i + 1);
	const inserts: Insert[] = [];
	let total = 0;
	const progressGrowth: { offset: number; width: number; within: number }[] = [];
	for (const item of mutationsField.value.items ?? []) {
		const type = enumName(names, findField(item.fields, "type")?.value);
		if (type === "EPMT_MutationMaster") continue;
		const progress = findField(item.fields, "progress");
		if (progress === undefined) continue;
		let within = 0;
		for (const required of progress.value.fields ?? []) {
			if (!required.name.endsWith("Required")) continue;
			const usedName = `${required.name.slice(0, -"Required".length)}Used`;
			if (!(WANTED_USED as readonly string[]).includes(usedName)) continue;
			// The used record is 12 bytes, identical to the required one but with
			// the used name and the same value.
			const record = new Uint8Array(12);
			const typeIndex = u16(data, required.offset - 6);
			const value = u32(data, required.offset);
			let nameIndex = indexOfName.get(usedName);
			if (nameIndex === undefined) {
				usedNames.push(usedName);
				nameIndex = names.length + usedNames.length;
				indexOfName.set(usedName, nameIndex);
			}
			record[0] = nameIndex & 0xff;
			record[1] = (nameIndex >>> 8) & 0xff;
			record[2] = typeIndex & 0xff;
			record[3] = (typeIndex >>> 8) & 0xff;
			writeU32(record, 4, 8);
			writeU32(record, 8, value);
			// The field is inserted in declaration order, immediately before its
			// `*Required` sibling (the header is 8 bytes before the value).
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
	if (inserts.length === 0) {
		return { data, chunks: container.chunks };
	}

	// The names are appended to `MANU`, which sits after the ability manager, so
	// they shift by the object's growth.
	const { offset: manuStart, end: namesEnd } = namesEndOf(data);
	const extraNames = nameBytesOf(usedNames);
	const allInserts: Insert[] = [
		...inserts,
		{ at: namesEnd, bytes: extraNames },
	];

	const { out, shiftAt } = splice(data, allInserts);
	const totalAll = total + extraNames.length;

	// Field `size` = value length + 4. Grow the `progress` field by the records
	// inserted inside it and the `mutations` field by all of them. The
	// `abilityManager` `PORP` length is the object value length, so it grows by
	// the same total.
	writeU32(out, shiftAt(token.offset + 8), token.value.bytes.length + total);
	writeU32(out, shiftAt(mutationsField.offset - 4), mutationsField.value.width + total + 4);
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
	writeU32(out, out.length - 6, (readU32(data, data.length - 6) ?? 0) + totalAll);
	updateSpanIndex(data, out, allInserts);

	return { data: out, chunks: rechunk(container, out.length) };
};

/** Max mutations and rebuild the whole file. */
export const maxMutations = (container: Resizable): Uint8Array => {
	const { data, chunks } = maxMutationsInPayload(container);
	return buildContainer(chunks, data);
};
