/**
 * Synthetic `sav.dat` construction for the tests.
 *
 * ## Why this exists, stated plainly
 *
 * No real Cyberpunk 2077 save is committed to any repository this work has
 * access to: the reference implementation's test finds one at runtime and skips
 * when it is absent, and its test data is 8.7 MB of JSON catalogues with no
 * binary fixture. So the LZ4 path, the container layout, the string pool and the
 * sparse struct arrays are validated against **synthetic data only**. That is a
 * real limitation, and it is why every builder below is written from the format
 * description rather than from an observed save.
 *
 * What the builders do buy is that they are independent of the codec: the
 * container is assembled by hand here, byte by byte, and the codec is then asked
 * to read it back. A round trip therefore proves the reader and writer agree
 * with the *format*, not merely with each other — the two implementations in this
 * file and in `lib/` were written from the same specification but not from shared
 * code.
 */
import type { Bytes } from "../../shared";
import { lz4CompressBlock } from "../lib/lz4";

/** Little-endian u32 from an ASCII tag, as the container stores them. */
const tag = (text: string): number => {
	let value = 0;
	for (const [index, character] of [...text].entries()) {
		value += (character.codePointAt(0) ?? 0) * 0x100 ** index;
	}
	return value >>> 0;
};

/** The container's packed integer: seven bits per byte, sign in bit 7. */
const pack = (value: number): number[] => {
	const negative = value < 0;
	let rest = negative ? -value : value;
	let head = rest % 64;
	rest = Math.floor(rest / 64);
	if (negative) head |= 0x80;
	if (rest === 0) return [head];
	const bytes = [head | 0x40];
	for (;;) {
		const part = rest % 128;
		rest = Math.floor(rest / 128);
		if (rest === 0) {
			bytes.push(part);
			return bytes;
		}
		bytes.push(part | 0x80);
	}
};

/** The length-prefixed string, always in the UTF-8 branch the game writes. */
const lpfxd = (text: string): number[] => {
	const bytes = [...new TextEncoder().encode(text)];
	if (bytes.length === 0) return [0];
	return [...pack(-bytes.length), ...bytes];
};

/** A growable little-endian byte list, so a builder reads as the format does. */
export class ByteList {
	readonly bytes: number[] = [];

	/**
	 * Inserts `count` zero bytes at the front.
	 *
	 * A pad goes *before* the data it pads, so this cannot be `skip`. Appending
	 * would put the node stream at offset 0 and the pad after it, which inverts
	 * the whole arrangement: the descriptors' offsets are relative to a buffer
	 * whose first bytes are the pad, and every one of them would land short.
	 */
	prependZeroes(count: number): this {
		// Built as a plain array rather than `Array.from({ length })`, which
		// widens to `unknown[]` and would not typecheck as a byte run.
		const pad: number[] = [];
		for (let index = 0; index < count; index += 1) pad.push(0);
		this.bytes.unshift(...pad);
		return this;
	}

	u8(value: number): this {
		this.bytes.push(value & 0xff);
		return this;
	}

	u16(value: number): this {
		this.bytes.push(value & 0xff, (value >>> 8) & 0xff);
		return this;
	}

	i16(value: number): this {
		return this.u16(value & 0xffff);
	}

	u32(value: number): this {
		this.bytes.push(
			value & 0xff,
			(value >>> 8) & 0xff,
			(value >>> 16) & 0xff,
			(value >>> 24) & 0xff,
		);
		return this;
	}

	i32(value: number): this {
		return this.u32(value >>> 0);
	}

	u64(value: bigint): this {
		for (let shift = 0n; shift < 64n; shift += 8n) {
			this.bytes.push(Number((value >> shift) & 0xffn));
		}
		return this;
	}

	/**
	 * Appends whole bytes.
	 *
	 * Each value is masked to a byte, so this is for byte lists only. Passing a
	 * pre-packed 32-bit word silently truncates it to its low byte — which is
	 * exactly what corrupted the string pool's descriptor table until this was
	 * written down. Use `u32` for words.
	 */
	raw(values: readonly number[]): this {
		for (const value of values) {
			if (value < 0 || value > 0xff) {
				throw new Error(
					`raw() takes bytes, but got ${value}. Use u32() for a packed word.`,
				);
			}
			this.bytes.push(value);
		}
		return this;
	}

	skip(count: number): this {
		for (let index = 0; index < count; index += 1) this.bytes.push(0);
		return this;
	}

	/**
	 * Overwrites four bytes already written, as a little-endian u32.
	 *
	 * The format reserves a descriptor table and then fills it in, and the offsets
	 * in it are only knowable once the data that follows has been written. `skip`
	 * alone cannot express that — the reservation and the contents are two passes
	 * over the same bytes.
	 */
	patchU32(at: number, value: number): this {
		const unsigned = value >>> 0;
		this.bytes[at] = unsigned & 0xff;
		this.bytes[at + 1] = (unsigned >>> 8) & 0xff;
		this.bytes[at + 2] = (unsigned >>> 16) & 0xff;
		this.bytes[at + 3] = (unsigned >>> 24) & 0xff;
		return this;
	}

	patchU16(at: number, value: number): this {
		const unsigned = value & 0xffff;
		this.bytes[at] = unsigned & 0xff;
		this.bytes[at + 1] = (unsigned >>> 8) & 0xff;
		return this;
	}

	get length(): number {
		return this.bytes.length;
	}
}

/** How much of the node stream one chunk holds, matching the game. */
const CHUNK_SIZE = 0x40000;

/** How many descriptors a node and its descendants occupy. */
const countNodes = (node: TestNode): number =>
	1 +
	(node.children ?? []).reduce<number>(
		(total, child) => total + countNodes(child),
		0,
	);

/** A node to place in a synthetic tree. */
type TestNode = {
	readonly name: string;
	/** Payload written after the node's four-byte index prefix. */
	readonly data?: readonly number[];
	readonly children?: readonly TestNode[];
};

/**
 * A hand-assembled `sav.dat`.
 *
 * The node stream is laid out exactly as the reader expects: each node is its
 * own index, then its payload, then its children depth first, then whatever
 * trailing payload it was given. Descriptors are emitted in the same order, with
 * `childIndex` pointing at the first child and `nextIndex` at the following
 * sibling.
 */
export const buildSave = (options: {
	readonly nodes: readonly TestNode[];
	readonly v1?: number;
	readonly v2?: number;
	readonly v3?: number;
	readonly suk?: string;
	readonly uk0?: number;
	readonly uk1?: number;
	/** Chunk-table entries to reserve beyond the computed minimum. */
	readonly tableEntries?: number;
	/** Write the chunks uncompressed, as the console build does. */
	readonly uncompressed?: boolean;
	/**
	 * Write a *wrong* index prefix on this node, to exercise the format's own
	 * integrity check.
	 *
	 * Exists because the check cannot be reached any other way: every other
	 * builder path writes an index that agrees with the descriptor claiming it, by
	 * construction. Hand-patching bytes to reach it would mean computing offsets
	 * into a packed string table, which is its own source of a test that passes
	 * for the wrong reason.
	 */
	readonly tamperIndexOf?: number;
}): Bytes => {
	const v1 = options.v1 ?? 269;
	const v2 = options.v2 ?? 2310;

	// Lay out the node stream and collect descriptors in one walk.
	//
	// A descriptor is reserved *before* its children are written, because a
	// node's `childIndex` is the index its first child will take — which only
	// works if the array is filled in pre-order, the same order the stream is
	// written in. That is what makes each node's four-byte index prefix agree
	// with the descriptor claiming it.
	const descriptors: {
		name: string;
		nextIndex: number;
		childIndex: number;
		dataOffset: number;
		dataSize: number;
	}[] = [];
	const stream = new ByteList();

	const writeChildren = (nodes: readonly TestNode[]): void => {
		// Each child's own `nextIndex` is set here rather than inside `writeNode`,
		// because a node's "next index" is the index its *following sibling* takes
		// — and that is only known once the group has been walked.
		for (const [position, node] of nodes.entries()) {
			const index = writeNode(node);
			const following = nodes[position + 1];
			const descriptor = descriptors[index];
			if (descriptor === undefined) continue;
			descriptor.nextIndex =
				following === undefined ? -1 : index + countNodes(node);
		}
	};

	const writeNode = (node: TestNode): number => {
		const index = descriptors.length;
		descriptors.push({
			name: node.name,
			nextIndex: -1,
			childIndex: -1,
			dataOffset: stream.length,
			dataSize: 0,
		});
		stream.u32(index === options.tamperIndexOf ? index + 6 : index);
		stream.raw(node.data ?? []);
		const descriptor = descriptors[index];
		if (descriptor !== undefined) {
			// `dataSize` covers the index prefix and this node's own payload only.
			// It is measured here, before the children, because a reader uses it to
			// bound where this node's data ends and its children's begin.
			descriptor.dataSize = stream.length - descriptor.dataOffset;
			descriptor.childIndex =
				(node.children ?? []).length > 0 ? descriptors.length : -1;
		}
		writeChildren(node.children ?? []);
		return index;
	};
	writeChildren(options.nodes);

	const header = new ByteList();
	header.u32(tag("CSAV"));
	header.u32(v1);
	header.u32(v2);
	header.raw(lpfxd(options.suk ?? "CyberpunkSaveGame"));
	header.u32(options.uk0 ?? 0);
	header.u32(options.uk1 ?? 0);
	if (v1 >= 83) header.u32(options.v3 ?? 192);

	const chunkTableAt = header.length;
	const reserved = Math.max(
		options.tableEntries ?? 256,
		Math.ceil(stream.length / CHUNK_SIZE) + 4,
	);
	const bodyAt = chunkTableAt + 8 + reserved * 12;

	// Descriptors' offsets are relative to the *padded* buffer, so the pad is
	// inserted in front and the offsets shift with it. Doing both in this order is
	// the whole point: shifting offsets without adding the matching zero bytes
	// would produce a file whose descriptors point at the wrong nodes, which is
	// the exact bug the per-node index prefix exists to catch.
	stream.prependZeroes(bodyAt);
	for (const descriptor of descriptors) descriptor.dataOffset += bodyAt;

	const chunks: { offset: number; size: number; dataSize: number }[] = [];
	const chunkBytes = new ByteList();
	let cursorAt = bodyAt;
	// The chunks cover the stream *after* the pad. The decompressed chunks are
	// concatenated onto a buffer that already begins with `bodyAt` zero bytes,
	// which is what the descriptors' offsets are relative to — so slicing the
	// pad off here, and adding it back when the chunks are concatenated, is the
	// whole arrangement.
	const nodeData = new Uint8Array(stream.bytes).subarray(bodyAt);
	let written = 0;

	while (written < nodeData.length) {
		const source = nodeData.subarray(written, written + CHUNK_SIZE);
		const offset = cursorAt;
		let size: number;
		if (options.uncompressed === true) {
			chunkBytes.raw([...source]);
			size = source.length;
		} else {
			const compressed = lz4CompressBlock(source);
			chunkBytes.u32(tag("XLZ4"));
			chunkBytes.u32(source.length);
			chunkBytes.raw([...compressed]);
			size = compressed.length + 8;
		}
		cursorAt += size;
		chunks.push({ offset, size, dataSize: source.length });
		written += source.length;
	}

	const nodeTableAt = cursorAt;
	const footer = new ByteList();
	footer.u32(tag("NODE"));
	footer.raw(pack(descriptors.length));
	for (const descriptor of descriptors) {
		footer.raw(lpfxd(descriptor.name));
		footer.i32(descriptor.nextIndex);
		footer.i32(descriptor.childIndex);
		footer.u32(descriptor.dataOffset);
		footer.u32(descriptor.dataSize);
	}
	footer.u32(nodeTableAt);
	footer.u32(tag("DONE"));

	const table = new ByteList();
	table.u32(tag("CLZF"));
	table.u32(chunks.length);
	for (const chunk of chunks) {
		table.u32(chunk.offset);
		table.u32(chunk.size);
		table.u32(chunk.dataSize);
	}

	const out = new Uint8Array(nodeTableAt + footer.length);
	out.set(header.bytes, 0);
	out.set(table.bytes, chunkTableAt);
	out.set(chunkBytes.bytes, bodyAt);
	out.set(footer.bytes, nodeTableAt);
	return out;
};

/**
 * Builds a string pool: names in, descriptor table and data region out.
 *
 * The descriptor's offset is relative to the pool's base and its length counts
 * the null terminator, which is the pair of details `readPool` has to get right.
 */
const buildPool = (
	names: readonly string[],
): {
	descs: readonly number[];
	data: readonly number[];
} => {
	const data: number[] = [];
	/** Each entry's byte offset within the data region, and its byte length. */
	const measured: { readonly offset: number; readonly length: number }[] = [];
	for (const name of names) {
		const bytes = [...new TextEncoder().encode(name)];
		measured.push({ offset: data.length, length: bytes.length });
		data.push(...bytes, 0);
	}
	// A descriptor's offset is relative to the pool's base, and the strings begin
	// after the descriptor table — so the table's own size is added in. The
	// reader adds the pool's absolute position on top of this, so the two must
	// not both include the same shift.
	const descsSize = names.length * 4;
	const descs = measured.map(
		(entry) =>
			((entry.offset + descsSize) & 0x00ffffff) |
			// The stored length counts the null terminator, which is not part of
			// the text the reader returns.
			(((entry.length + 1) & 0xff) << 24),
	);
	return { descs, data };
};

/** A name in a pool, or `-1` when absent. */
export const poolIndex = (names: readonly string[], name: string): number =>
	names.indexOf(name);

/**
 * One field of a struct: its name, its declared type, and the value to write.
 *
 * `value` is the game's value rather than raw bytes, so a test states `unspent:
 * 12` instead of four bytes — and so the builder, not the test, decides that an
 * `Int32` is four little-endian bytes.
 */
type TestField = {
	readonly name: string;
	readonly type: string;
	readonly value: number | bigint | boolean | string;
};

/** One struct of a sparse array. */
export type TestStruct = {
	readonly fields: readonly TestField[];
};

/**
 * Writes one field's bytes, for the widths `sizeOfField` models.
 *
 * Kept independent of `lib/systems.ts` on purpose: the builder must encode a
 * struct the way the *format* says, not the way the reader happens to read one,
 * or a bug shared by both would cancel out and the test would prove nothing.
 */
const writeField = (
	out: ByteList,
	field: TestField,
	pool: readonly string[],
): void => {
	const type = field.type;
	if (type === "Bool") {
		out.u8(field.value === true || field.value === 1 ? 1 : 0);
		return;
	}
	if (type === "Int32") {
		out.i32(Number(field.value));
		return;
	}
	if (type === "Uint32") {
		out.u32(Number(field.value));
		return;
	}
	if (type === "Int16") {
		out.i16(Number(field.value));
		return;
	}
	if (type === "Uint16") {
		out.u16(Number(field.value));
		return;
	}
	if (type === "Uint64" || type === "TweakDBID") {
		out.u64(BigInt(field.value));
		return;
	}
	if (type === "CName" || type.startsWith("gamedata")) {
		// A name resolves through the pool, and a name the pool does not hold is
		// index 0 — which is what the game would write too.
		const index = poolIndex(pool, String(field.value));
		out.u16(index < 0 ? 0 : index);
		return;
	}
	throw new Error(`The test builder does not encode a field of type ${type}.`);
};

/**
 * Serialises a `u32`-counted array of self-describing structs.
 *
 * Each element's field offsets are relative to the element's own start, which is
 * what `readSparseArray` relies on to walk the array.
 */
export const buildStructArray = (
	structs: readonly TestStruct[],
	pool: readonly string[],
): readonly number[] => {
	const out = new ByteList();
	out.u32(structs.length);
	for (const struct of structs) {
		const elementAt = out.length;
		out.u16(struct.fields.length);
		const tableAt = out.length;
		out.skip(struct.fields.length * 8);
		// Each element's field offsets are relative to the element's own start, so
		// they are known only once its data has been written; the reserved table
		// is patched in afterwards.
		const written: { at: number; name: string; type: string }[] = [];
		for (const field of struct.fields) {
			written.push({
				at: out.length - elementAt,
				name: field.name,
				type: field.type,
			});
			writeField(out, field, pool);
		}
		for (const [position, field] of written.entries()) {
			const at = tableAt + position * 8;
			out.patchU16(at, Math.max(0, poolIndex(pool, field.name)));
			out.patchU16(at + 2, Math.max(0, poolIndex(pool, field.type)));
			out.patchU32(at + 4, field.at);
		}
	}
	return out.bytes;
};

/**
 * Serialises a `ScriptableSystemsContainer` blob around a pool and some objects.
 *
 * The layout is: the blob's own size, two unknown words, six header words
 * describing where the pool and the object table sit, then the pool's descriptor
 * table and data, then the object descriptors, then the object bodies.
 *
 * Offsets in the header are relative to the blob start, and the reader adds back
 * the bytes the header itself consumed — so the values written here are
 * deliberately small and the reader's arithmetic is what puts them in the right
 * place.
 */
export const buildSystemsBlob = (
	pool: readonly string[],
	objects: readonly {
		readonly ctypename: string;
		readonly body: readonly number[];
	}[],
): readonly number[] => {
	const built = buildPool(pool);
	const descsSize = built.descs.length * 4;
	const strpoolDataOffset = descsSize;
	const objDescsOffset = strpoolDataOffset + built.data.length;
	const objDescsSize = objects.length * 8;
	const objdataOffset = objDescsOffset + objDescsSize;

	const out = new ByteList();
	out.u32(0); // The blob's own size, patched below.
	out.u16(0); // Two unknown words the game writes.
	out.u16(0);
	out.u32(1); // One handle, so no subsystem names follow.
	// These offsets are relative to the *start of the pool region*, not to the
	// blob — the reader adds the bytes the header consumed back on, which is what
	// makes the header's own length irrelevant to the values in it.
	out.u32(0);
	out.u32(strpoolDataOffset);
	out.u32(objDescsOffset);
	out.u32(objdataOffset);

	const body = new ByteList();
	// The descriptor table is packed words, not bytes — the trap `raw` now guards.
	for (const descriptor of built.descs) body.u32(descriptor);
	body.raw(built.data);

	let relative = 0;
	for (const object of objects) {
		body.u32(Math.max(0, poolIndex(pool, object.ctypename)));
		body.u32(objdataOffset + relative);
		relative += object.body.length;
	}
	for (const object of objects) body.raw(object.body);

	const blob = new Uint8Array([...out.bytes, ...body.bytes]);
	// The size field excludes itself and covers everything after it. Patched in
	// place — writing it to a detached copy would leave the field reading zero,
	// which the reader rejects as an impossible blob.
	new DataView(blob.buffer).setUint32(0, blob.length - 4, true);
	return [...blob];
};

/**
 * Serialises one object: a field count, its descriptor table, then the data that
 * table points at.
 *
 * A field's offset is relative to the start of the *object*, and it is only
 * knowable once the field's own bytes have been written — so the table is
 * reserved and then patched, rather than written in one pass.
 */
export const buildObject = (
	fields: readonly {
		readonly name: string;
		readonly type: string;
		readonly data: readonly number[];
	}[],
	pool: readonly string[],
): readonly number[] => {
	const out = new ByteList();
	out.u16(fields.length);
	const tableAt = out.length;
	out.skip(fields.length * 8);
	for (const [position, field] of fields.entries()) {
		const at = out.length;
		out.raw(field.data);
		out.patchU16(
			tableAt + position * 8,
			Math.max(0, poolIndex(pool, field.name)),
		);
		out.patchU16(
			tableAt + position * 8 + 2,
			Math.max(0, poolIndex(pool, field.type)),
		);
		out.patchU32(tableAt + position * 8 + 4, at);
	}
	return out.bytes;
};
