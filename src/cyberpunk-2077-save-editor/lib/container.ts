import {
	type Bytes,
	lz4CompressBlock,
	lz4DecompressBlock,
	yieldToBrowser,
} from "../../shared";

const CHUNK_SIZE = 0x40000;

const tag = (text: string): number => {
	let value = 0;
	for (const [index, character] of [...text].entries()) {
		value += (character.codePointAt(0) ?? 0) * 0x100 ** index;
	}
	return value >>> 0;
};

const TAG_FILE = [tag("CSAV"), tag("VASC"), tag("SAVE"), tag("EVAS")] as const;
const TAG_CHUNK_TABLE = tag("CLZF");
const TAG_CHUNK_TABLE_SWAPPED = tag("FZLC");
const TAG_CHUNK = tag("XLZ4");
const TAG_CHUNK_SWAPPED = tag("4ZLX");
const TAG_NODES = tag("NODE");
const TAG_NODES_SWAPPED = tag("EDON");
const TAG_DONE = tag("DONE");
const TAG_DONE_SWAPPED = tag("EDNE");

export type SaveNode = {
	index: number;
	readonly name: string;
	nextIndex: number;
	childIndex: number;
	readonly data: Bytes;
	readonly afterChildren: Bytes;
	children: SaveNode[];
};

export type SaveVersion = {
	readonly v1: number;
	readonly v2: number;
	readonly v3: number;
	readonly suk: string;
	readonly uk0: number;
	readonly uk1: number;
	readonly tableEntriesCount?: number;
	readonly ps4w: boolean;
};

export type DecodedContainer = {
	readonly version: SaveVersion;
	readonly root: SaveNode;
	readonly nodeData: Bytes;
	readonly padSize: number;
};

type ChunkDescriptor = {
	offset: number;
	size: number;
	dataSize: number;
};

type NodeDescriptor = {
	name: string;
	nextIndex: number;
	childIndex: number;
	dataOffset: number;
	dataSize: number;
	data: Bytes;
	afterChildren: Bytes;
};

class Cursor {
	private at = 0;

	constructor(private readonly bytes: Bytes) {}

	get offset(): number {
		return this.at;
	}

	seek(offset: number): void {
		if (offset < 0 || offset > this.bytes.length) {
			throw new Error(
				`This save's container points outside the file (offset ${offset}, length ${this.bytes.length}).`,
			);
		}
		this.at = offset;
	}

	u32(): number {
		if (this.at + 4 > this.bytes.length) {
			throw new Error("This save is truncated inside its header.");
		}
		const value = new DataView(
			this.bytes.buffer,
			this.bytes.byteOffset,
			this.bytes.byteLength,
		).getUint32(this.at, true);
		this.at += 4;
		return value >>> 0;
	}

	i32(): number {
		if (this.at + 4 > this.bytes.length) {
			throw new Error("This save is truncated inside its header.");
		}
		const value = new DataView(
			this.bytes.buffer,
			this.bytes.byteOffset,
			this.bytes.byteLength,
		).getInt32(this.at, true);
		this.at += 4;
		return value;
	}

	one(): number {
		if (this.at >= this.bytes.length) {
			throw new Error("This save is truncated inside its payload.");
		}
		const value = this.bytes[this.at] ?? 0;
		this.at += 1;
		return value;
	}

	slice(length: number): Bytes {
		if (length < 0 || this.at + length > this.bytes.length) {
			throw new Error("This save is truncated inside its payload.");
		}
		const view = this.bytes.slice(this.at, this.at + length);
		this.at += length;
		return view;
	}
}

const readPacked = (cursor: Cursor): bigint => {
	const first = cursor.one();
	let value = BigInt(first & 0x3f);
	const negative = (first & 0x80) !== 0;
	let more = (first & 0x40) !== 0;
	let shift = 6n;
	while (more) {
		const byte = cursor.one();
		value |= BigInt(byte & 0x7f) << shift;
		shift += 7n;
		more = (byte & 0x80) !== 0;
	}
	return negative ? -value : value;
};

const writePacked = (value: bigint): number[] => {
	const negative = value < 0n;
	let rest = negative ? -value : value;
	let head = Number(rest & 0x3fn);
	rest >>= 6n;
	if (negative) head |= 0x80;
	if (rest === 0n) return [head];
	const bytes = [head | 0x40];
	for (;;) {
		const part = Number(rest & 0x7fn);
		rest >>= 7n;
		if (rest === 0n) {
			bytes.push(part);
			return bytes;
		}
		bytes.push(part | 0x80);
	}
};

const readLpfxd = (cursor: Cursor): string => {
	const packed = readPacked(cursor);
	if (packed === 0n) return "";
	if (packed < 0n) {
		return new TextDecoder().decode(cursor.slice(Number(-packed)));
	}
	const units = Number(packed);
	const raw = cursor.slice(units * 2);
	let text = "";
	for (let index = 0; index < units; index += 1) {
		const low = raw[index * 2] ?? 0;
		const high = raw[index * 2 + 1] ?? 0;
		text += String.fromCharCode(low | (high << 8));
	}
	return text;
};

const writeLpfxd = (text: string): number[] => {
	const utf8 = new TextEncoder().encode(text);
	if (utf8.length === 0) return [0];
	return [...writePacked(-BigInt(utf8.length)), ...utf8];
};

const pushU32 = (bytes: number[], value: number): void => {
	const unsigned = value >>> 0;
	bytes.push(
		unsigned & 0xff,
		(unsigned >>> 8) & 0xff,
		(unsigned >>> 16) & 0xff,
		(unsigned >>> 24) & 0xff,
	);
};

type ContainerStructure = {
	readonly version: SaveVersion;
	readonly chunks: ChunkDescriptor[];
	readonly descriptors: NodeDescriptor[];
	readonly padSize: number;
	readonly chunkTableAt: number;
};

const readStructure = (bytes: Bytes): ContainerStructure => {
	const cursor = new Cursor(bytes);

	if (!TAG_FILE.includes(cursor.u32())) {
		throw new Error(
			"This is not a Cyberpunk 2077 save: it has no VASC container header.",
		);
	}
	const v1 = cursor.u32();
	const v2 = cursor.u32();
	const suk = readLpfxd(cursor);
	const uk0 = cursor.u32();
	const uk1 = cursor.u32();
	const v3 = v1 >= 83 ? cursor.u32() : 192;

	if (v1 <= 168 && v2 === 4) {
		throw new Error(
			`This save uses an unsupported container revision (v1=${v1}, v2=${v2}).`,
		);
	}

	const chunkTableAt = cursor.offset;

	cursor.seek(bytes.length - 8);
	const nodeTableAt = cursor.u32();
	const footer = cursor.u32();
	if (footer !== TAG_DONE && footer !== TAG_DONE_SWAPPED) {
		throw new Error(
			"This file has no DONE tag at its end, so it is not a Cyberpunk 2077 save.",
		);
	}

	cursor.seek(nodeTableAt);
	const nodeTag = cursor.u32();
	if (nodeTag !== TAG_NODES && nodeTag !== TAG_NODES_SWAPPED) {
		throw new Error(
			"This save's node table is missing its NODE tag; the file looks damaged.",
		);
	}
	const descriptors: NodeDescriptor[] = [];
	const declared = Number(readPacked(cursor));
	if (declared < 0 || declared > bytes.length) {
		throw new Error(
			`This save's node table claims ${declared} nodes, which its size cannot hold.`,
		);
	}
	for (let index = 0; index < declared; index += 1) {
		descriptors.push({
			name: readLpfxd(cursor),
			nextIndex: cursor.i32(),
			childIndex: cursor.i32(),
			dataOffset: cursor.u32(),
			dataSize: cursor.u32(),
			data: new Uint8Array(0),
			afterChildren: new Uint8Array(0),
		});
	}

	cursor.seek(chunkTableAt);
	const tableTag = cursor.u32();
	if (tableTag !== TAG_CHUNK_TABLE && tableTag !== TAG_CHUNK_TABLE_SWAPPED) {
		throw new Error(
			"This save's chunk table is missing its CLZF tag; the file looks damaged.",
		);
	}
	const chunkCount = cursor.u32();
	const chunks: ChunkDescriptor[] = [];
	for (let index = 0; index < chunkCount; index += 1) {
		chunks.push({
			offset: cursor.u32(),
			size: cursor.u32(),
			dataSize: cursor.u32(),
		});
	}

	chunks.sort((left, right) => left.offset - right.offset);

	const first = chunks[0];
	const padSize = first === undefined ? chunkTableAt : first.offset;
	const tableEntriesCount =
		first === undefined
			? undefined
			: Math.floor((first.offset - (chunkTableAt + 8)) / 12);

	return {
		version: { v1, v2, v3, suk, uk0, uk1, tableEntriesCount, ps4w: false },
		chunks,
		descriptors,
		padSize,
		chunkTableAt,
	};
};

const inflateChunks = async (
	bytes: Bytes,
	chunks: readonly ChunkDescriptor[],
	padSize: number,
	chunkTableAt: number,
): Promise<{ nodeData: Bytes; ps4w: boolean }> => {
	if (chunks.length === 0) {
		return { nodeData: new Uint8Array(padSize), ps4w: false };
	}
	const cursor = new Cursor(bytes);
	const first = chunks[0];
	if (first === undefined) {
		return { nodeData: new Uint8Array(padSize), ps4w: false };
	}
	const start = first.offset;

	let total = 0;
	for (const chunk of chunks) total += chunk.dataSize;
	const nodeData = new Uint8Array(start + total);

	let written = start;
	let ps4w = false;
	for (const [position, chunk] of chunks.entries()) {
		cursor.seek(chunk.offset);
		const magic = cursor.u32();
		if (magic !== TAG_CHUNK && magic !== TAG_CHUNK_SWAPPED) {
			if (position > 0) {
				throw new Error(
					`Chunk ${position} of this save is missing its XLZ4 tag; the file looks damaged.`,
				);
			}
			ps4w = true;
			cursor.seek(chunk.offset);
			nodeData.set(cursor.slice(chunk.dataSize), written);
		} else {
			const declared = cursor.u32();
			if (declared !== chunk.dataSize) {
				throw new Error(
					`Chunk ${position} declares ${declared} bytes but its table row says ${chunk.dataSize}.`,
				);
			}
			nodeData.set(
				lz4DecompressBlock(cursor.slice(chunk.size - 8), chunk.dataSize),
				written,
			);
		}
		written += chunk.dataSize;
		await yieldToBrowser();
	}

	if (ps4w) {
		cursor.seek(chunkTableAt);
		nodeData.set(cursor.slice(start - chunkTableAt), 0);
	}

	return { nodeData, ps4w };
};

const buildNode = (
	descriptors: readonly NodeDescriptor[],
	index: number,
	nodeData: Bytes,
	depth: number,
): SaveNode => {
	if (depth > 512) {
		throw new Error("This save's node tree is deeper than any real save.");
	}
	const descriptor = descriptors[index];
	if (descriptor === undefined) {
		throw new Error(
			`This save's node table refers to node ${index}, which it does not contain.`,
		);
	}
	const end = descriptor.dataOffset + descriptor.dataSize;
	if (end > nodeData.length) {
		throw new Error(
			`Node ${index} ("${descriptor.name}") claims bytes past the end of this save.`,
		);
	}

	const declared = new DataView(
		nodeData.buffer,
		nodeData.byteOffset,
		nodeData.byteLength,
	).getUint32(descriptor.dataOffset, true);
	if (declared !== index) {
		throw new Error(
			`Node ${index} ("${descriptor.name}") is stored out of order: its payload claims to be node ${declared}.`,
		);
	}

	const bodyStart = descriptor.dataOffset + 4;
	const children: SaveNode[] = [];

	if (descriptor.childIndex >= 0) {
		let cursorAt = bodyStart;
		let link = descriptor.childIndex;
		while (link >= 0) {
			if (link >= descriptors.length) {
				throw new Error(
					`This save's node table points at node ${link}, which does not exist.`,
				);
			}
			const child = descriptors[link];
			if (child === undefined) break;
			if (child.dataOffset > cursorAt) {
				descriptor.data = nodeData.slice(cursorAt, child.dataOffset);
			}
			children.push(buildNode(descriptors, link, nodeData, depth + 1));
			cursorAt = child.dataOffset + child.dataSize;
			link = child.nextIndex;
		}
		if (cursorAt < end) {
			descriptor.afterChildren = nodeData.slice(cursorAt, end);
		}
	} else if (bodyStart < end) {
		descriptor.data = nodeData.slice(bodyStart, end);
	}

	return {
		index,
		name: descriptor.name,
		nextIndex: descriptor.nextIndex,
		childIndex: descriptor.childIndex,
		data: descriptor.data,
		afterChildren: descriptor.afterChildren,
		children,
	};
};

export const decodeContainer = async (
	bytes: Bytes,
): Promise<DecodedContainer> => {
	const structure = readStructure(bytes);
	const { nodeData, ps4w } = await inflateChunks(
		bytes,
		structure.chunks,
		structure.padSize,
		structure.chunkTableAt,
	);
	const version: SaveVersion = { ...structure.version, ps4w };

	const root: SaveNode = {
		index: -2,
		name: "root",
		nextIndex: -1,
		childIndex: -1,
		data: new Uint8Array(0),
		afterChildren: new Uint8Array(0),
		children: [],
	};

	const children: SaveNode[] = [];
	let link = 0;
	while (link >= 0 && link < structure.descriptors.length) {
		children.push(buildNode(structure.descriptors, link, nodeData, 0));
		const descriptor = structure.descriptors[link];
		if (descriptor === undefined) break;
		link = descriptor.nextIndex;
	}
	root.children = children;
	root.childIndex = children[0]?.index ?? -1;

	return { version, root, nodeData, padSize: structure.padSize };
};

const countNodes = (node: SaveNode): number => {
	let total = node.index < 0 ? 0 : 1;
	for (const child of node.children) total += countNodes(child);
	return total;
};

const flatten = (
	root: SaveNode,
	padSize: number,
): { descriptors: NodeDescriptor[]; stream: number[] } => {
	const descriptors: NodeDescriptor[] = [];
	for (let index = 0; index < countNodes(root); index += 1) {
		descriptors.push({
			name: "",
			nextIndex: -1,
			childIndex: -1,
			dataOffset: 0,
			dataSize: 0,
			data: new Uint8Array(0),
			afterChildren: new Uint8Array(0),
		});
	}
	const stream: number[] = [];
	for (let at = 0; at < padSize; at += 1) stream.push(0);
	let next = 0;

	const writeChildren = (node: SaveNode): void => {
		for (const [position, child] of node.children.entries()) {
			const descriptor = writeNode(child);
			if (descriptor === undefined) continue;
			const following = node.children[position + 1];
			descriptor.nextIndex = following === undefined ? -1 : following.index;
		}
	};

	const writeNode = (node: SaveNode): NodeDescriptor | undefined => {
		if (node.index < 0) {
			for (const byte of node.data) stream.push(byte);
			writeChildren(node);
			for (const byte of node.afterChildren) stream.push(byte);
			return undefined;
		}

		const index = next;
		next += 1;
		const descriptor = descriptors[index];
		if (descriptor === undefined) {
			throw new Error("This save's node tree has more nodes than it declared.");
		}
		descriptor.name = node.name;
		descriptor.dataOffset = stream.length;
		pushU32(stream, index);
		for (const byte of node.data) stream.push(byte);

		descriptor.childIndex = node.children.length > 0 ? next : -1;
		descriptor.dataSize = stream.length - descriptor.dataOffset;
		writeChildren(node);
		for (const byte of node.afterChildren) stream.push(byte);
		return descriptor;
	};

	writeNode(root);

	for (const [index, descriptor] of descriptors.entries()) {
		const at = descriptor.dataOffset;
		const claimed =
			((stream[at] ?? 0) |
				((stream[at + 1] ?? 0) << 8) |
				((stream[at + 2] ?? 0) << 16) |
				((stream[at + 3] ?? 0) << 24)) >>>
			0;
		if (claimed !== index) {
			throw new Error(
				`This save's node tree cannot be rebuilt: "${descriptor.name}" would be written out of order.`,
			);
		}
	}

	return { descriptors, stream };
};

export const encodeContainer = async (
	decoded: DecodedContainer,
): Promise<Bytes> => {
	const { version, root } = decoded;

	const header: number[] = [];
	pushU32(header, tag("CSAV"));
	pushU32(header, version.v1);
	pushU32(header, version.v2);
	for (const byte of writeLpfxd(version.suk)) header.push(byte);
	pushU32(header, version.uk0);
	pushU32(header, version.uk1);
	if (version.v1 >= 83) pushU32(header, version.v3);

	const chunkTableAt = header.length;
	const unpadded = flatten(root, 0);
	const reserved = Math.max(
		version.tableEntriesCount ?? 256,
		Math.ceil(unpadded.stream.length / CHUNK_SIZE) + 4,
	);
	const padSize = chunkTableAt + 8 + reserved * 12;
	const { descriptors, stream } = flatten(root, padSize);
	const nodeData = new Uint8Array(stream.length);
	nodeData.set(stream);

	const chunkBodyAt = padSize;
	const chunks: ChunkDescriptor[] = [];
	const chunkBytes: number[] = [];
	let cursorAt = chunkBodyAt;
	const payload = nodeData.subarray(padSize);
	let written = 0;

	while (written < payload.length) {
		const source = payload.subarray(written, written + CHUNK_SIZE);
		const offset = cursorAt;
		let size: number;
		if (version.ps4w) {
			for (const byte of source) chunkBytes.push(byte);
			size = source.length;
		} else {
			const compressed = lz4CompressBlock(source);
			pushU32(chunkBytes, TAG_CHUNK);
			pushU32(chunkBytes, source.length);
			for (const byte of compressed) chunkBytes.push(byte);
			size = compressed.length + 8;
		}
		cursorAt += size;
		chunks.push({ offset, size, dataSize: source.length });
		written += source.length;
		await yieldToBrowser();
	}

	const nodeTableAt = cursorAt;
	const footer: number[] = [];
	pushU32(footer, TAG_NODES);
	for (const byte of writePacked(BigInt(descriptors.length))) footer.push(byte);
	for (const descriptor of descriptors) {
		for (const byte of writeLpfxd(descriptor.name)) footer.push(byte);
		pushU32(footer, descriptor.nextIndex);
		pushU32(footer, descriptor.childIndex);
		pushU32(footer, descriptor.dataOffset);
		pushU32(footer, descriptor.dataSize);
	}
	pushU32(footer, nodeTableAt);
	pushU32(footer, TAG_DONE);

	const table: number[] = [];
	pushU32(table, TAG_CHUNK_TABLE);
	pushU32(table, chunks.length);
	for (const chunk of chunks) {
		pushU32(table, chunk.offset);
		pushU32(table, chunk.size);
		pushU32(table, chunk.dataSize);
	}

	const out = new Uint8Array(nodeTableAt + footer.length);
	out.set(header, 0);
	out.set(table, chunkTableAt);
	out.set(chunkBytes, chunkBodyAt);
	out.set(footer, nodeTableAt);
	return out;
};

export const walkNodes = (root: SaveNode): readonly SaveNode[] => {
	const found: SaveNode[] = [];
	const visit = (node: SaveNode): void => {
		found.push(node);
		for (const child of node.children) visit(child);
	};
	visit(root);
	return found;
};

export const findNode = (root: SaveNode, name: string): SaveNode | undefined =>
	walkNodes(root).find((node) => node.name === name);
