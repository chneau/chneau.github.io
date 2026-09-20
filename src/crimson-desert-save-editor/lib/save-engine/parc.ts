/**
 * Generic PARC container mechanics: object-list layout, locators, field
 * parsing, and the pointer bookkeeping needed to insert or move serialized
 * blocks without disturbing anything else.
 *
 * These helpers are not inventory-, equipment- or companion-specific, but they
 * used to live in whichever feature module needed them first — so features
 * imported each other sideways (`companions` -> `equipment-editor`,
 * `catalog-equipment` -> `equipment-editor`) and several of them were
 * duplicated. Importing them from here keeps feature modules depending on the
 * format, not on each other.
 */

import {
	concatBytes,
	indexOfBytes,
	packU64,
	readU16,
	readU32,
	readU64,
	writeU32,
} from "./bytes";
import { defined } from "./defined";
import {
	type BlockParser,
	type ParcBlob,
	type ParsedField,
	parseParcBlob,
	serializeParc,
	type TOCEntry,
	type TypeDef,
} from "./parc-serializer";

const SENTINEL = new Uint8Array(8).fill(0xff);

/** One serialized socket entry, as parsed from an object list. */
export type ItemSocketRecord = {
	currentEndurance: number | null;
	itemKey: number | null;
	fieldOffsets: Record<string, number>;
	values: Record<string, unknown>;
};

/** Shorthand for the identity fields every object-list element carries. */
type IdentifiedRecord = {
	itemNo: number;
};

const isZero = (data: Uint8Array, start: number, end: number): boolean => {
	for (let index = start; index < end; index++) {
		if ((data[index] ?? 0) !== 0) return false;
	}
	return true;
};

/** Decode an object-list header, returning `[count, cursorAfterHeader]`. */
export const listLayout = (
	data: Uint8Array,
	start: number,
	tail: number,
): [number, number] => {
	for (const delta of [0, 1, 2, 3]) {
		const body = start + delta;
		if (body + 18 > tail) continue;
		const prefix = data[body] ?? 0;
		let markerEnd = body;
		while (markerEnd < tail && (data[markerEnd] ?? 0) === 1) markerEnd += 1;
		if (
			markerEnd > body &&
			markerEnd + 17 <= tail &&
			(data[markerEnd] ?? 0) === 0 &&
			isZero(data, markerEnd + 5, markerEnd + 18)
		) {
			return [readU32(data, markerEnd + 1), markerEnd + 18];
		}
		if (
			prefix === 0 &&
			(data[body + 1] ?? 0) === 0 &&
			(data[body + 2] ?? 0) === 0 &&
			(data[body + 3] ?? 0) === 0
		) {
			return [readU32(data, body + 4), body + 18];
		}
		if (prefix === 0) {
			const count =
				(data[body + 1] ?? 0) |
				((data[body + 2] ?? 0) << 8) |
				((data[body + 3] ?? 0) << 16);
			return [count, body + 18];
		}
		if (
			prefix === 1 &&
			body + 21 <= tail &&
			(data[body + 1] ?? 0) === 1 &&
			(data[body + 2] ?? 0) === 1 &&
			(data[body + 3] ?? 0) === 0
		) {
			return [readU32(data, body + 4), body + 21];
		}
		if (prefix === 1) {
			return [((data[body + 1] ?? 0) << 8) | (data[body + 2] ?? 0), body + 19];
		}
	}
	throw new Error(
		`Could not decode object-list header at 0x${start
			.toString(16)
			.toUpperCase()}`,
	);
};

export const locator = (
	data: Uint8Array,
	cursor: number,
	typeMap: Map<number, TypeDef>,
): [number, Uint8Array, number] => {
	const maskCount = readU16(data, cursor);
	if (maskCount > 0 && maskCount <= 16) {
		const masks = data.subarray(cursor + 2, cursor + 2 + maskCount);
		const typePosition = cursor + 2 + maskCount;
		const typeIndex = readU16(data, typePosition);
		const payload = readU32(data, typePosition + 11);
		const wrapperEnd = typePosition + 15;
		if (typeMap.has(typeIndex) && payload === wrapperEnd) {
			return [typeIndex, masks, payload];
		}
	}

	const typeIndex = readU16(data, cursor + 3);
	const sentinel = readU64(data, cursor + 6);
	const payload = readU32(data, cursor + 14);
	if (
		sentinel === 0xffffffffffffffffn &&
		typeMap.has(typeIndex) &&
		payload === cursor + 18
	) {
		return [typeIndex, new Uint8Array([data[cursor + 2] ?? 0]), payload];
	}
	throw new Error(
		`Invalid object locator at 0x${cursor.toString(16).toUpperCase()}`,
	);
};

export const present = (mask: Uint8Array, index: number): boolean => {
	return (
		Math.floor(index / 8) < mask.length &&
		((mask[Math.floor(index / 8)] ?? 0) & (1 << (index % 8))) !== 0
	);
};

export const readObjectListValues = (
	raw: Uint8Array,
	start: number,
	tail: number,
	parser: BlockParser,
	expectedType: string,
): ItemSocketRecord[] => {
	const [count, startCursor] = listLayout(raw, start, tail);
	let cursor = startCursor;
	const values: ItemSocketRecord[] = [];
	for (let index = 0; index < count; index++) {
		const elementEnd = parser.parseListElement(cursor, tail);
		const [typeIndex, mask, payload] = locator(
			raw,
			cursor,
			parser.parc.typeByIndex,
		);
		const typeDef = parser.parc.typeByIndex.get(typeIndex);
		if (!typeDef || typeDef.name !== expectedType) {
			throw new Error(`Expected ${expectedType}, got ${typeDef?.name}`);
		}
		const [parsedFields] = parser.parseFields(
			typeDef,
			mask,
			payload + 4,
			elementEnd,
		);
		const entryValues: Record<string, unknown> = {};
		const entryOffsets: Record<string, number> = {};
		for (const field of parsedFields) {
			if (!field.present) continue;
			entryValues[field.name] = field.value;
			entryOffsets[field.name] = field.start ?? 0;
		}
		values.push({
			currentEndurance:
				"_currentEndurance" in entryValues
					? Number(entryValues._currentEndurance)
					: null,
			itemKey: "_itemKey" in entryValues ? Number(entryValues._itemKey) : null,
			fieldOffsets: entryOffsets,
			values: entryValues,
		});
		cursor = elementEnd;
	}
	return values;
};

/**
 * Parse fields while accounting for PARC's list terminator bytes.
 *
 * ItemSaveData serializes an additional 0x01 terminator before the next scalar
 * field; missing it shifts every post-list field by one byte.
 */
export const parseFieldsWithListTrailers = (
	raw: Uint8Array,
	parser: BlockParser,
	typeDef: TypeDef,
	mask: Uint8Array,
	position: number,
	tail: number,
): ParsedField[] => {
	const parsed: ParsedField[] = [];
	let cursor = position;
	for (let index = 0; index < typeDef.fields.length; index++) {
		const field = defined(typeDef.fields[index], "field definition");
		if (!present(mask, index)) {
			parsed.push({ fieldIndex: index, name: field.name, present: false });
			continue;
		}
		const start = cursor;
		const [value, fieldEnd] = parser.parseFieldValue(field, cursor, tail);
		parsed.push({
			fieldIndex: index,
			name: field.name,
			present: true,
			value,
			start,
			end: fieldEnd,
		});
		cursor = fieldEnd;
		if (
			(field.metaKind === 6 || field.metaKind === 7) &&
			(raw[cursor] ?? 0) === 1 &&
			(raw[cursor + 1] ?? 0) === 1
		) {
			cursor += 2;
		}
	}
	return parsed;
};

/**
 * Recover fixed-width ItemSaveData tail fields by locating them backwards from
 * the record boundary. Records containing character-conversion data (mask bit
 * 23) keep the conservative forward parse.
 */
export const readPostListScalarsFromEnd = (
	_raw: Uint8Array,
	parser: BlockParser,
	typeDef: TypeDef,
	mask: Uint8Array,
	recordEnd: number,
): [Record<string, unknown>, Record<string, number>] => {
	if (present(mask, 23)) return [{}, {}];

	let cursor = recordEnd - 4;
	const values: Record<string, unknown> = {};
	const offsets: Record<string, number> = {};
	for (let index = typeDef.fields.length - 1; index > 16; index--) {
		if (!present(mask, index)) continue;
		const field = defined(typeDef.fields[index], "field definition");
		if (field.metaKind !== 0 && field.metaKind !== 2) return [{}, {}];
		if (field.metaSize <= 0) return [{}, {}];
		cursor -= field.metaSize;
		offsets[field.name] = cursor;
		values[field.name] = parser.readScalar(field, cursor);
	}
	return [values, offsets];
};

/** Write a new object-list count back into its header. */
export const writeListCount = (
	block: Uint8Array,
	absoluteStart: number,
	listAbs: number,
	count: number,
): void => {
	const pos = listAbs - absoluteStart;
	let markerEnd = pos;
	while (markerEnd < block.length && (block[markerEnd] ?? 0) === 1) {
		markerEnd += 1;
	}
	if (
		markerEnd > pos &&
		markerEnd + 17 <= block.length &&
		(block[markerEnd] ?? 0) === 0 &&
		isZero(block, markerEnd + 5, markerEnd + 18)
	) {
		writeU32(block, markerEnd + 1, count);
		return;
	}
	if (
		(block[pos] ?? 0) === 0 &&
		(block[pos + 1] ?? 0) === 0 &&
		(block[pos + 2] ?? 0) === 0 &&
		(block[pos + 3] ?? 0) === 0
	) {
		writeU32(block, pos + 4, count);
		return;
	}
	if ((block[pos] ?? 0) === 0) {
		if (count > 0xffffff) {
			throw new Error("List count exceeds compact three-byte encoding");
		}
		block[pos + 1] = count & 0xff;
		block[pos + 2] = (count >>> 8) & 0xff;
		block[pos + 3] = (count >>> 16) & 0xff;
		return;
	}
	if (
		(block[pos] ?? 0) === 1 &&
		(block[pos + 1] ?? 0) === 1 &&
		(block[pos + 2] ?? 0) === 1 &&
		(block[pos + 3] ?? 0) === 0
	) {
		writeU32(block, pos + 4, count);
		return;
	}
	if ((block[pos] ?? 0) === 1) {
		if (count > 0xffff) {
			throw new Error("List count exceeds compact two-byte encoding");
		}
		block[pos + 1] = (count >>> 8) & 0xff;
		block[pos + 2] = count & 0xff;
		return;
	}
	throw new Error("Unsupported object-list count encoding");
};

/** Retarget a cloned record's inline self-pointers to its new position. */
export const rebaseClonePointers = (
	clone: Uint8Array,
	sourceStart: number,
	sourceEnd: number,
	targetStart: number,
): void => {
	const delta = targetStart - sourceStart;
	let cursor = 0;
	let found = 0;
	for (;;) {
		const sentinel = indexOfBytes(clone, SENTINEL, cursor);
		if (sentinel < 0) break;
		const pointerOffset = sentinel + 8;
		if (pointerOffset + 4 <= clone.length) {
			const pointer = readU32(clone, pointerOffset);
			if (pointer >= sourceStart && pointer < sourceEnd) {
				writeU32(clone, pointerOffset, pointer + delta);
				found += 1;
			}
		}
		cursor = sentinel + 1;
	}
	if (found === 0) {
		throw new Error("Template record had no relocatable payload pointers");
	}
};

/**
 * A run of bytes to splice into a block, at an absolute payload offset.
 *
 * `remove` turns an insertion into a replacement, which is what rewriting a
 * field whose bytes are already there needs: a name is stored length-prefixed,
 * so a longer one is not a write to the old bytes but a swap of them.
 */
export type BlockInsertion = {
	at: number;
	bytes: Uint8Array;
	/** Bytes already at `at` to drop first; 0 inserts without removing. */
	remove?: number;
};

/**
 * Old absolute offset, moved by every edit at or before it.
 *
 * The comparison includes the edit point on purpose: bytes inserted *at*
 * `offset` push the byte that used to sit there, so both a pointer stored at
 * the edit point and a value addressing it have to move. Field creators rely on
 * this — a record's size word sits at the very offset a field is inserted at.
 */
export const shiftedOffset = (
	insertions: readonly BlockInsertion[],
	offset: number,
): number => {
	let total = 0;
	for (const insertion of insertions) {
		if (insertion.at <= offset) {
			total += insertion.bytes.length - (insertion.remove ?? 0);
		}
	}
	return offset + total;
};

/**
 * Splices byte runs into a block and moves every inline self-pointer with the
 * data it addresses.
 *
 * This is the block-level counterpart of `shiftExistingBlockPointers`, with two
 * differences the field-creation path needs. It scans the *original* block for
 * pointers, so bytes that arrive with an insertion — a name, a colour — can
 * never be mistaken for one; and it relocates each pointer by `shiftedOffset`
 * rather than by a single uniform delta, so several runs can go into one
 * block. A sentinel whose following word does not address the block is left
 * alone.
 *
 * A run with `remove` set replaces those bytes instead of inserting before
 * them. Pointers are read from the original block, so one that pointed into a
 * removed run has nothing left to address; that is reported rather than
 * silently relocated, because it means the caller overwrote a nested object
 * rather than a flat field.
 */
export const spliceInsertions = (
	block: Uint8Array,
	blockStart: number,
	insertions: readonly BlockInsertion[],
): Uint8Array => {
	const ordered = [...insertions].sort((a, b) => b.at - a.at);
	let output: Uint8Array = block.slice();
	for (const insertion of ordered) {
		const at = insertion.at - blockStart;
		const remove = insertion.remove ?? 0;
		if (at < 0 || at + remove > output.length) {
			throw new Error("Insertion falls outside the block it edits");
		}
		output = concatBytes(
			output.slice(0, at),
			insertion.bytes,
			output.slice(at + remove),
		);
	}

	const blockEnd = blockStart + block.length;
	let cursor = 0;
	for (;;) {
		const sentinel = indexOfBytes(block, SENTINEL, cursor);
		if (sentinel < 0) break;
		cursor = sentinel + 1;
		const pointerOffset = sentinel + 8;
		if (pointerOffset + 4 > block.length) continue;
		const pointer = readU32(block, pointerOffset);
		if (pointer < blockStart || pointer >= blockEnd) continue;
		for (const insertion of insertions) {
			const remove = insertion.remove ?? 0;
			if (
				remove > 0 &&
				pointer >= insertion.at &&
				pointer < insertion.at + remove
			) {
				throw new Error("A replaced field is the target of an inline pointer");
			}
		}
		writeU32(
			output,
			shiftedOffset(insertions, blockStart + pointerOffset) - blockStart,
			shiftedOffset(insertions, pointer),
		);
	}
	return output;
};

/** Move every inline pointer that pointed past `insertAbs` by `delta`. */
export const shiftExistingBlockPointers = (
	oldBlock: Uint8Array,
	newBlock: Uint8Array,
	blockStart: number,
	insertAbs: number,
	delta: number,
): void => {
	let cursor = 0;
	const oldBlockEnd = blockStart + oldBlock.length;
	for (;;) {
		const sentinel = indexOfBytes(oldBlock, SENTINEL, cursor);
		if (sentinel < 0) break;
		const pointerOffset = sentinel + 8;
		if (pointerOffset + 4 <= oldBlock.length) {
			const pointer = readU32(oldBlock, pointerOffset);
			if (pointer >= insertAbs && pointer < oldBlockEnd) {
				const oldPointerAbs = blockStart + pointerOffset;
				const newPointerOffset =
					pointerOffset + (oldPointerAbs >= insertAbs ? delta : 0);
				writeU32(newBlock, newPointerOffset, pointer + delta);
			}
		}
		cursor = sentinel + 1;
	}
};

/** First `itemNo` that does not already occur anywhere in the payload. */
export const unusedItemNo = (
	raw: Uint8Array,
	records: IdentifiedRecord[],
): number => {
	let candidate = Math.max(...records.map((record) => record.itemNo)) + 1;
	while (indexOfBytes(raw, packU64(candidate)) >= 0) candidate += 1;
	return candidate;
};

export const typeSignatureArray = (typeDef: TypeDef): unknown[][] => {
	return typeDef.fields.map((field) => [
		field.name,
		field.typeName,
		field.metaKind,
		field.metaSize,
		field.metaAux,
	]);
};

/** The payload of `entry` with every inline self-pointer made block-relative. */
export const normalizedBlock = (
	parc: ParcBlob,
	entry: TOCEntry,
): Uint8Array => {
	const block = (parc.blockRaw.get(entry.index) ?? new Uint8Array()).slice();
	let cursor = 0;
	for (;;) {
		const sentinel = indexOfBytes(block, SENTINEL, cursor);
		if (sentinel < 0) break;
		const pointerOffset = sentinel + 8;
		if (pointerOffset + 4 <= block.length) {
			const pointer = readU32(block, pointerOffset);
			if (
				pointer >= entry.dataOffset &&
				pointer < entry.dataOffset + entry.dataSize
			) {
				writeU32(block, pointerOffset, pointer - entry.dataOffset);
			}
		}
		cursor = sentinel + 1;
	}
	return block;
};

/**
 * Compare bytes allowing only actual inline pointers to relocate. Range-based
 * normalization can mistake an unrelated scalar for a pointer when a growing
 * earlier block moves this root's address range across that scalar.
 */
export const relocatedRoot = (
	before: ParcBlob,
	oldEntry: TOCEntry,
	newEntry: TOCEntry,
): Uint8Array => {
	const source = before.blockRaw.get(oldEntry.index) ?? new Uint8Array();
	const expected = source.slice();
	const delta = newEntry.dataOffset - oldEntry.dataOffset;
	let cursor = 0;
	for (;;) {
		const sentinel = indexOfBytes(source, SENTINEL, cursor);
		if (sentinel < 0) break;
		const pos = sentinel + 8;
		if (pos + 4 <= source.length) {
			const pointer = readU32(source, pos);
			if (pointer === oldEntry.dataOffset + pos + 4) {
				writeU32(expected, pos, pointer + delta);
			}
		}
		cursor = sentinel + 1;
	}
	return expected;
};

export const preservedRoot = (
	before: ParcBlob,
	oldEntry: TOCEntry,
	after: ParcBlob,
	newEntry: TOCEntry,
): boolean => {
	return sameBytes(
		relocatedRoot(before, oldEntry, newEntry),
		after.blockRaw.get(newEntry.index) ?? new Uint8Array(),
	);
};

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => {
	if (a.length !== b.length) return false;
	for (let index = 0; index < a.length; index++) {
		if (a[index] !== b[index]) return false;
	}
	return true;
};

/**
 * Serializes an edited blob while relocating every root the caller did not
 * change itself. `serializeParc` shifts inline pointers by a heuristic when a
 * block grows; overwriting the untouched roots with their deterministic
 * relocation removes any doubt about the ones that only moved.
 */
export const serializeWithPreservedRoots = (
	parc: ParcBlob,
	modifiedTocIndices: Iterable<number> = parc.modifiedBlocks.keys(),
): Uint8Array => {
	const modified = new Set(modifiedTocIndices);
	const edited = serializeParc(parc);
	const layout = parseParcBlob(edited);
	for (let index = 0; index < parc.tocEntries.length; index++) {
		const oldEntry = defined(parc.tocEntries[index], "old TOC entry");
		if (modified.has(oldEntry.index)) continue;
		const newEntry = defined(layout.tocEntries[index], "new TOC entry");
		edited.set(relocatedRoot(parc, oldEntry, newEntry), newEntry.dataOffset);
	}
	return edited;
};

/**
 * Make every inline self-pointer block-relative, so a record read from one
 * payload can be compared against the same record read from another.
 */
export const relativizeInlinePointers = (
	blob: Uint8Array,
	base: number,
): Uint8Array => {
	let cursor = 0;
	for (;;) {
		const sentinel = indexOfBytes(blob, SENTINEL, cursor);
		if (sentinel < 0) return blob;
		const pos = sentinel + 8;
		if (pos + 4 > blob.length) return blob;
		const pointer = readU32(blob, pos);
		if (pointer === base + pos + 4) writeU32(blob, pos, pointer - base);
		cursor = sentinel + 1;
	}
};

/**
 * Refuse an edit that changed the schema, the TOC order, or any root other
 * than the ones the caller edited.
 */
const assertRootsPreserved = (
	beforeRaw: Uint8Array,
	afterRaw: Uint8Array,
	changedTypeNames: readonly string[],
	context: string,
): void => {
	const changed = new Set(changedTypeNames);
	const before = parseParcBlob(beforeRaw);
	const after = parseParcBlob(afterRaw);
	if (
		before.types.map((type) => type.name).join() !==
		after.types.map((type) => type.name).join()
	) {
		throw new Error(`Schema changed during ${context}`);
	}
	if (before.tocEntries.length !== after.tocEntries.length) {
		throw new Error(`TOC entry count changed during ${context}`);
	}
	for (let index = 0; index < before.tocEntries.length; index++) {
		const oldEntry = defined(before.tocEntries[index], "old TOC entry");
		const newEntry = defined(after.tocEntries[index], "new TOC entry");
		const oldName = before.typeByIndex.get(oldEntry.classIndex)?.name;
		const newName = after.typeByIndex.get(newEntry.classIndex)?.name;
		if (oldName !== newName) {
			throw new Error(`TOC entry order changed during ${context}`);
		}
		if (oldName !== undefined && changed.has(oldName)) continue;
		if (!preservedRoot(before, oldEntry, after, newEntry)) {
			throw new Error(`Unrelated ${oldName} block changed during ${context}`);
		}
	}
};

/**
 * Refuse an edit that changed the schema, the TOC order, or any root other
 * than the inventory the caller meant to touch.
 */
export const assertNonInventoryBlocksUnchanged = (
	beforeRaw: Uint8Array,
	afterRaw: Uint8Array,
): void => {
	assertRootsPreserved(
		beforeRaw,
		afterRaw,
		["InventorySaveData"],
		"inventory socket edit",
	);
};
