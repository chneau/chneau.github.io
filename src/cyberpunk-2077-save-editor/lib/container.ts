/**
 * Cyberpunk 2077 `sav.dat` — the `VASC` container.
 *
 * ## The shape of the file
 *
 * A `sav.dat` is a *container* around a serialised object tree, in four regions
 * that are deliberately out of order:
 *
 * 1. a fixed header — a `VASC`/`CSAV`/`SAVE`/`EVAS` magic, three version
 *    numbers, an unknown string and two unknown words;
 * 2. a **chunk table** — a `CLZF` tag, a count, and twelve bytes per entry
 *    (offset, compressed size, uncompressed size);
 * 3. the **chunks** — each an `XLZ4` tag, its uncompressed size, and an LZ4
 *    *block*;
 * 4. a **node table** — a `NODE` tag, a packed count, then per node a name, a
 *    sibling index, a child index and a byte range into the decompressed
 *    stream. The last eight bytes of the file are that table's offset and a
 *    `DONE` tag.
 *
 * The chunk table sits *between* the header and the chunks, so the regions have
 * to be found by seeking rather than by reading forwards. The table is padded
 * beyond the count actually used — that slack is what lets the writer grow the
 * table without moving the chunks — and its true size is recovered from where
 * the first chunk starts.
 *
 * ## The decompressed stream, and the padding in front of it
 *
 * Inflating the chunks yields one contiguous buffer. Its first `chunksStart`
 * bytes are a zero-filled pad the size of everything written before the chunks
 * — the header and the table — and the node descriptors' offsets are relative
 * to that padded buffer, not to the file. That indirection is load-bearing: it
 * is why a node's `dataOffset` is not its position in `sav.dat`, and it is why
 * `flatten` has to be told `chunksStart` rather than inventing offsets of its
 * own.
 *
 * Each node's payload begins with its own four-byte index, and the descriptor
 * claiming that node must agree with it. That redundancy is the format's own
 * integrity check, so both directions of this codec enforce it rather than
 * trusting it.
 *
 * ## Gaps are payload
 *
 * A node's descriptor covers a byte range that its children sit inside. The
 * bytes between the end of a node's own data and its first child — and between
 * its last child and the end of its range — are real payload the game calls a
 * "data blob". They are carried through verbatim (`beforeChildren` and
 * `afterChildren` on `SaveNode`) rather than parsed, because this editor has no
 * vocabulary for them and discarding them would corrupt every subsystem it does
 * not understand.
 */
import type { Bytes } from "../../shared";
import { lz4CompressBlock, lz4DecompressBlock } from "./lz4";

/** How much of the decompressed stream one chunk holds. */
const CHUNK_SIZE = 0x40000;

/** Little-endian magic for an ASCII tag, matching how the file stores it. */
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

/**
 * A REDengine 4 node, as the container describes it.
 *
 * `index` is the node's position in the pre-order walk, which is also the
 * four-byte prefix written at the start of its payload.
 *
 * The link fields are writable, and that is deliberate rather than a lapse:
 * rebuilding a tree from a document has to fill them in *after* the children
 * exist, because a node's `childIndex` is the index its first child will take,
 * and that is only knowable once the pre-order walk has run. Making them
 * `readonly` would mean either a cast at each assignment or a second pass that
 * computes the indices by hand — both worse than saying plainly that these four
 * fields are filled in during construction and are not edited afterwards.
 *
 * `data` and `afterChildren` are the two payload runs around the children, and
 * together with the children they reconstruct the original byte stream exactly.
 */
export type SaveNode = {
	index: number;
	readonly name: string;
	nextIndex: number;
	childIndex: number;
	/** Bytes of payload between this node's prefix and its first child. */
	readonly data: Bytes;
	/** Payload between the end of the last child and the end of this node. */
	readonly afterChildren: Bytes;
	children: SaveNode[];
};

/** The header fields preserved verbatim across a decode/encode pair. */
export type SaveVersion = {
	readonly v1: number;
	readonly v2: number;
	readonly v3: number;
	/** Unknown, but round-tripped: the game writes something here. */
	readonly suk: string;
	readonly uk0: number;
	readonly uk1: number;
	/** Chunk-table entries reserved, padding included. Zero when absent. */
	readonly tableEntriesCount?: number;
	/** True when chunks are stored uncompressed, as the console build writes them. */
	readonly ps4w: boolean;
};

/** A decoded container: its header, the root of its node tree, and the stream. */
export type DecodedContainer = {
	readonly version: SaveVersion;
	readonly root: SaveNode;
	/** The inflated stream, pad included. Kept so a rebuild can be byte-exact. */
	readonly nodeData: Bytes;
	/** Size of the zero pad in front of the stream; the stream follows it. */
	readonly padSize: number;
};

/** One row of the chunk table. */
type ChunkDescriptor = {
	offset: number;
	size: number;
	dataSize: number;
};

/** One row of the node table, before its payload is cut out of the stream. */
type NodeDescriptor = {
	name: string;
	nextIndex: number;
	childIndex: number;
	dataOffset: number;
	dataSize: number;
	data: Bytes;
	afterChildren: Bytes;
};

/**
 * Hands the main thread back to the browser.
 *
 * A late-game save is a few megabytes of node data in 256 KiB chunks, so a pass
 * over them runs for long enough that the tab can be offered for termination
 * if it never yields. The workbench deliberately keeps its engine on the main
 * thread (ADR-0001), which is only defensible if the work is handed back often.
 * A macrotask is what is needed: a microtask would drain before the browser
 * paints.
 */
const yieldToBrowser = (): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, 0);
	});

/** Little-endian reader over the whole file. */
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

/**
 * The node table's packed integers: seven bits per byte, low group first,
 * continuation in bit 6 and the sign in bit 7.
 *
 * The sign belongs to the whole value rather than to a byte, so a negative count
 * costs the same five bytes as a large positive one. Written and read together
 * here because the encoding is easy to get subtly wrong and impossible to spot
 * from the bytes alone.
 */
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

/**
 * The length-prefixed string the container uses for node names and the header's
 * unknown word.
 *
 * A negative length means UTF-8 with that many bytes; a positive one means that
 * many UTF-16 code units; zero means empty. Node names are ASCII in practice,
 * so a writer always takes the UTF-8 branch — which is what the game does when
 * it re-writes a save. A name that arrived as UTF-16 therefore comes back as the
 * same characters in fewer bytes, which is a change to the file and not to the
 * value.
 */
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

/** Appends a little-endian u32. */
const pushU32 = (bytes: number[], value: number): void => {
	const unsigned = value >>> 0;
	bytes.push(
		unsigned & 0xff,
		(unsigned >>> 8) & 0xff,
		(unsigned >>> 16) & 0xff,
		(unsigned >>> 24) & 0xff,
	);
};

/** Everything the tables describe, before the chunks are inflated. */
type ContainerStructure = {
	readonly version: SaveVersion;
	readonly chunks: ChunkDescriptor[];
	readonly descriptors: NodeDescriptor[];
	readonly padSize: number;
	/** Where the chunk table begins, which the uncompressed variant needs. */
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
	// The third version only exists from revision 83 onwards, so writing it
	// unconditionally would shift every byte after the header in an older save.
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

	// The chunk table's entries are read out of file order, so they are sorted
	// before use: the game emits ascending offsets, and sorting makes a file
	// written by a different tool behave the same.
	chunks.sort((left, right) => left.offset - right.offset);

	// The pad in front of the node stream is exactly as long as the header and
	// the reserved chunk table — which is where the first chunk begins.
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

/**
 * Inflates the chunks into the node stream.
 *
 * Yields between chunks, for the reason `yieldToBrowser` gives.
 */
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
	// The chunk data is written at `padSize` and not at zero, because the node
	// descriptors' offsets are relative to a buffer that begins with a pad the
	// size of everything written before the chunks. A reader that inflated into
	// offset 0 would find every descriptor pointing at the wrong node — which is
	// precisely the failure the per-node index check exists to catch.
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
			// The console build stores the chunk stream uncompressed, in which
			// case only the first entry carries a tag. A failure after that is
			// real damage rather than the uncompressed variant.
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

	// The uncompressed variant stores the node data straight into the chunk region
	// of the file rather than inflating it, so the pad in front of the buffer is
	// a range of the file that has to be copied in — the bytes between the header
	// and the first chunk, which for a compressed save would be the chunk table.
	// Copying more than that reads past the end of the file.
	if (ps4w) {
		cursor.seek(chunkTableAt);
		nodeData.set(cursor.slice(start - chunkTableAt), 0);
	}

	return { nodeData, ps4w };
};

/**
 * Rebuilds the node hierarchy from the flat descriptor list.
 *
 * The list is a pre-order walk stored flat with explicit sibling and child
 * links, so the tree is rebuilt by following links rather than by position.
 * `depth` is bounded because those links came off disk: a file claiming a cycle
 * would otherwise recurse until the stack gave out.
 */
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

	// Every node's payload starts with its own index. Checking it here is what
	// catches a stream that was reassembled in the wrong order.
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
		// A node with children owns its children plus any payload in the gaps
		// between them: `data` is what precedes the first child, `afterChildren`
		// what follows the last. Those gaps are real payload the game stores, and
		// dropping them would shift every byte after them.
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
		// A childless node owns its whole range: `data` is the lot of it, and the
		// trailing gap stays empty. Splitting it across both fields would write
		// the bytes twice on the way back out.
		descriptor.data = nodeData.slice(bodyStart, end);
	}

	// Only children are followed here. A node's `next` sibling belongs to the
	// parent that owns the group, and `decodeContainer` walks those; recursing
	// into it as well would rebuild the same node once per sibling and inflate
	// the tree without adding anything.
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

/**
 * Reads a `sav.dat`.
 *
 * Asynchronous because inflating the chunks yields between them; the table
 * parsing itself is microseconds on a real save and is not worth interrupting.
 */
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

	// The descriptor list holds only real nodes, and descriptor 0 is the first
	// of the file's top-level nodes — there is no descriptor for the file itself.
	// So the tree gets a synthetic root that groups them, which is also what the
	// game does: `flatten` writes a negative-index node's bytes without giving it
	// a descriptor, so the two directions agree.
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

/**
 * The number of nodes a tree will produce descriptors for, which sizes the
 * descriptor array on write.
 *
 * A node with a negative index gets no descriptor — it is the synthetic root or
 * a data blob, described by its position rather than by a row — so it does not
 * count. `flatten` walks with the same rule, which is what keeps the array the
 * right length.
 */
const countNodes = (node: SaveNode): number => {
	let total = node.index < 0 ? 0 : 1;
	for (const child of node.children) total += countNodes(child);
	return total;
};

/**
 * Flattens the tree back into descriptors and a stream.
 *
 * The inverse of `buildNode`. Nodes are visited depth first and each takes the
 * next index in sequence, which is what makes the four-byte prefix written
 * ahead of a payload agree with the descriptor claiming it — the property
 * `buildNode` checks on the way back in.
 *
 * `padSize` zeroes are emitted in front, because the descriptors' offsets are
 * relative to the padded buffer rather than to the file.
 *
 * Descriptors are preallocated to the final count rather than pushed, because a
 * node's `childIndex` points one past the end of the array at the moment it is
 * assigned and only becomes meaningful once its children have been written.
 */
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
		// Each child's `nextIndex` is set here, not in `writeNode`, because a
		// node's "next index" is the index its *following sibling* takes — and
		// that is only knowable once the whole group has been walked. `writeNode`
		// would otherwise leave a child pointing at whatever pre-order index came
		// next, which after its own children were written is somewhere else
		// entirely.
		for (const [position, child] of node.children.entries()) {
			const descriptor = writeNode(child);
			if (descriptor === undefined) continue;
			const following = node.children[position + 1];
			descriptor.nextIndex = following === undefined ? -1 : following.index;
		}
	};

	const writeNode = (node: SaveNode): NodeDescriptor | undefined => {
		// A node with a negative index is one the format describes without a
		// descriptor of its own — the synthetic root, and any data blob the game
		// leaves between a node and its children. Its bytes belong to its
		// position in the stream, and it consumes no index. Descriptor 0 is the
		// first *real* top-level node, which is why a decoded root has children
		// rather than being one itself.
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
		// `dataSize` covers the prefix and this node's own payload only, measured
		// *before* the children: a reader uses it to bound where this node's data
		// ends and its first child's begins. Measuring after would swallow the
		// whole subtree and every child would be read as absent.
		descriptor.dataSize = stream.length - descriptor.dataOffset;
		writeChildren(node);
		for (const byte of node.afterChildren) stream.push(byte);
		return descriptor;
	};

	writeNode(root);

	// The format's own redundancy, enforced on the way out: every payload prefix
	// must claim the index of the descriptor that describes it, or the reader
	// rejects the save this codec just wrote.
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

/**
 * Rebuilds a `sav.dat` from a decoded container.
 *
 * The header is rewritten from `version`, the node table and the chunks from
 * the tree. Asynchronous because compressing the chunks yields between them,
 * for the reason `inflateChunks` does.
 */
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

	// The chunk table is padded to a reserved entry count and the node stream is
	// padded to match, so the two depend on each other.
	//
	// The table is never smaller than the 256 entries the game reserves by
	// default, so the pad that implies is known before the stream is measured —
	// which is what makes this a fixed point rather than an iteration. The extra
	// headroom is for a stream that has outgrown the reservation, which is the
	// one case where the table has to grow rather than be reused.
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
	// The chunks cover the stream *after* the pad. A reader rebuilds the buffer by
	// writing `padSize` zero bytes and then concatenating the inflated chunks, so
	// compressing the pad here too would inflate it twice and leave every
	// descriptor offset short by `padSize`.
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
	// The table is written into the space reserved for it; the rest of that space
	// stays zero, which is what the game's own writer leaves there.
	out.set(table, chunkTableAt);
	out.set(chunkBytes, chunkBodyAt);
	out.set(footer, nodeTableAt);
	return out;
};

/** Every node in the tree, depth first, for the summary and for searching. */
export const walkNodes = (root: SaveNode): readonly SaveNode[] => {
	const found: SaveNode[] = [];
	const visit = (node: SaveNode): void => {
		found.push(node);
		for (const child of node.children) visit(child);
	};
	visit(root);
	return found;
};

/** The first node with this name, searched depth first. */
export const findNode = (root: SaveNode, name: string): SaveNode | undefined =>
	walkNodes(root).find((node) => node.name === name);
