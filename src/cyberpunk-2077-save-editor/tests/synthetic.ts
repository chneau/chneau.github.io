import { type Bytes, lz4CompressBlock } from "../../shared";

const tag = (text: string): number => {
	let value = 0;
	for (const [index, character] of [...text].entries()) {
		value += (character.codePointAt(0) ?? 0) * 0x100 ** index;
	}
	return value >>> 0;
};

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

const lpfxd = (text: string): number[] => {
	const bytes = [...new TextEncoder().encode(text)];
	if (bytes.length === 0) return [0];
	return [...pack(-bytes.length), ...bytes];
};

export class ByteList {
	readonly bytes: number[] = [];

	prependZeroes(count: number): this {
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

const CHUNK_SIZE = 0x40000;

const countNodes = (node: TestNode): number =>
	1 +
	(node.children ?? []).reduce<number>(
		(total, child) => total + countNodes(child),
		0,
	);

type TestNode = {
	readonly name: string;
	readonly data?: readonly number[];
	readonly children?: readonly TestNode[];
};

export const buildSave = (options: {
	readonly nodes: readonly TestNode[];
	readonly v1?: number;
	readonly v2?: number;
	readonly v3?: number;
	readonly suk?: string;
	readonly uk0?: number;
	readonly uk1?: number;
	readonly tableEntries?: number;
	readonly uncompressed?: boolean;
	readonly tamperIndexOf?: number;
}): Bytes => {
	const v1 = options.v1 ?? 269;
	const v2 = options.v2 ?? 2310;

	const descriptors: {
		name: string;
		nextIndex: number;
		childIndex: number;
		dataOffset: number;
		dataSize: number;
	}[] = [];
	const stream = new ByteList();

	const writeChildren = (nodes: readonly TestNode[]): void => {
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

	stream.prependZeroes(bodyAt);
	for (const descriptor of descriptors) descriptor.dataOffset += bodyAt;

	const chunks: { offset: number; size: number; dataSize: number }[] = [];
	const chunkBytes = new ByteList();
	let cursorAt = bodyAt;
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

const buildPool = (
	names: readonly string[],
): {
	descs: readonly number[];
	data: readonly number[];
} => {
	const data: number[] = [];
	const measured: { readonly offset: number; readonly length: number }[] = [];
	for (const name of names) {
		const bytes = [...new TextEncoder().encode(name)];
		measured.push({ offset: data.length, length: bytes.length });
		data.push(...bytes, 0);
	}
	const descsSize = names.length * 4;
	const descs = measured.map(
		(entry) =>
			((entry.offset + descsSize) & 0x00ffffff) |
			(((entry.length + 1) & 0xff) << 24),
	);
	return { descs, data };
};

export const poolIndex = (names: readonly string[], name: string): number =>
	names.indexOf(name);

type TestField = {
	readonly name: string;
	readonly type: string;
	readonly value: number | bigint | boolean | string;
};

export type TestStruct = {
	readonly fields: readonly TestField[];
};

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
		const index = poolIndex(pool, String(field.value));
		out.u16(index < 0 ? 0 : index);
		return;
	}
	throw new Error(`The test builder does not encode a field of type ${type}.`);
};

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
	out.u32(0);
	out.u16(0);
	out.u16(0);
	out.u32(1);
	out.u32(0);
	out.u32(strpoolDataOffset);
	out.u32(objDescsOffset);
	out.u32(objdataOffset);

	const body = new ByteList();
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
	new DataView(blob.buffer).setUint32(0, blob.length - 4, true);
	return [...blob];
};

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
