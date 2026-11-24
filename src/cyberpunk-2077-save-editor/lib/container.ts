import {
	type Bytes,
	lz4CompressBlock,
	lz4DecompressBlock,
	yieldToBrowser,
} from "../../shared";

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
const TAG_DONE_SWAPPED = tag("ENOD");

export type SaveNode = {
	index: number;
	offset: number;
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
	readonly bytes: Bytes;
	readonly chunks: readonly ChunkDescriptor[];
	readonly chunkTableAt: number;
};

export type ChunkDescriptor = {
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
		let first = true;
		while (link >= 0) {
			if (link >= descriptors.length) {
				throw new Error(
					`This save's node table points at node ${link}, which does not exist.`,
				);
			}
			const child = descriptors[link];
			if (child === undefined) break;
			if (first && child.dataOffset > bodyStart) {
				descriptor.data = nodeData.slice(bodyStart, child.dataOffset);
			}
			first = false;
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
		offset: descriptor.dataOffset,
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
		offset: 0,
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

	return {
		version,
		root,
		nodeData,
		padSize: structure.padSize,
		bytes,
		chunks: structure.chunks,
		chunkTableAt: structure.chunkTableAt,
	};
};

const wordAt = (bytes: Bytes, at: number): number =>
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
		at,
		true,
	);

export const encodeContainer = async (
	decoded: DecodedContainer,
): Promise<Bytes> => {
	const {
		bytes,
		chunks,
		chunkTableAt,
		nodeData: original,
		padSize,
		root,
	} = decoded;
	const nodeData = new Uint8Array(original);
	for (const node of walkNodes(root)) {
		if (node.index < 0 || node.data.length === 0) continue;
		const at = node.offset + 4;
		if (at + node.data.length > nodeData.length) {
			throw new Error(
				`Node "${node.name}" no longer fits this save's payload.`,
			);
		}
		nodeData.set(node.data, at);
	}

	const header = bytes.subarray(0, chunkTableAt);
	const tableTag = wordAt(bytes, chunkTableAt);
	const body: number[] = [];
	const rows: number[] = [];
	let cursor = padSize;
	let payloadAt = padSize;

	for (const chunk of chunks) {
		const payload = nodeData.subarray(payloadAt, payloadAt + chunk.dataSize);
		payloadAt += chunk.dataSize;
		const offset = cursor;
		if (decoded.version.ps4w) {
			for (const byte of payload) body.push(byte);
			cursor += payload.length;
			pushU32(rows, offset);
			pushU32(rows, payload.length);
			pushU32(rows, payload.length);
		} else {
			const compressed = lz4CompressBlock(payload);
			pushU32(body, wordAt(bytes, chunk.offset));
			pushU32(body, payload.length);
			for (const byte of compressed) body.push(byte);
			const size = compressed.length + 8;
			cursor += size;
			pushU32(rows, offset);
			pushU32(rows, size);
			pushU32(rows, payload.length);
		}
		await yieldToBrowser();
	}

	const table: number[] = [];
	pushU32(table, tableTag);
	pushU32(table, chunks.length);
	table.push(...rows);
	if (chunkTableAt + table.length > padSize) {
		throw new Error(
			"This save's chunk table no longer fits the space reserved for it.",
		);
	}

	const nodeTableAt = wordAt(bytes, bytes.length - 8);
	const doneTag = wordAt(bytes, bytes.length - 4);
	const footer = bytes.subarray(nodeTableAt, bytes.length - 8);
	const footerAt = padSize + body.length;
	const out = new Uint8Array(footerAt + footer.length + 8);
	out.set(header, 0);
	out.set(table, chunkTableAt);
	out.set(body, padSize);
	out.set(footer, footerAt);
	const view = new DataView(out.buffer);
	view.setUint32(out.length - 8, footerAt, true);
	view.setUint32(out.length - 4, doneTag, true);
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
