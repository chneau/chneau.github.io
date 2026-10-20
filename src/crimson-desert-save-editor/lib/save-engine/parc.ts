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
	decodeListHeader,
	type ListCountField,
	MAX_LIST_COUNT,
	type ParcBlob,
	parseParcBlob,
	serializeParc,
	type TOCEntry,
	type TypeDef,
} from "./parc-serializer";

const SENTINEL = new Uint8Array(8).fill(0xff);

const forEachZeroSentinelLocator = (
	block: Uint8Array,
	typeCount: number,
	visit: (payloadField: number, payload: number) => void,
): void => {
	for (let start = 0; start + 18 <= block.length; start++) {
		const maskByteCount = readU16(block, start);
		if (maskByteCount < 1 || maskByteCount > 16) continue;
		const offset = start + 2 + maskByteCount;
		if (offset + 15 > block.length) continue;
		if (readU16(block, offset) >= typeCount) continue;
		if ((block[offset + 2] ?? 0) !== 0) continue;
		if (readU32(block, offset + 3) !== 0) continue;
		if (readU32(block, offset + 7) !== 0) continue;
		visit(offset + 11, readU32(block, offset + 11));
	}
};

export type ItemSocketRecord = {
	currentEndurance: number | null;
	itemKey: number | null;
	typeIndex: number;
	recordStart: number;
	fieldOffsets: Record<string, number>;
	values: Record<string, unknown>;
};

type IdentifiedRecord = {
	itemNo: number;
};

export const listLayout = (
	data: Uint8Array,
	start: number,
	tail: number,
): [number, number] => {
	const header = decodeListHeader(data, start, tail);
	return [header.count, header.headerEnd];
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
			typeIndex,
			recordStart: cursor,
			fieldOffsets: entryOffsets,
			values: entryValues,
		});
		cursor = elementEnd;
	}
	return values;
};

const writeCountField = (
	block: Uint8Array,
	field: ListCountField,
	value: number,
): void => {
	if (field.width === 2) {
		if (value > 0xffff) {
			throw new Error("List count exceeds compact two-byte encoding");
		}
		block[field.offset] = (value >>> 8) & 0xff;
		block[field.offset + 1] = value & 0xff;
		return;
	}
	writeU32(block, field.offset, value);
};

export const writeListCount = (
	block: Uint8Array,
	absoluteStart: number,
	listAbs: number,
	count: number,
): void => {
	if (!Number.isInteger(count) || count < 0 || count > MAX_LIST_COUNT) {
		throw new Error(`Implausible count ${count}`);
	}
	const header = decodeListHeader(block, listAbs - absoluteStart, block.length);
	writeCountField(block, header.countField, count);
	if (header.countMinusOneField) {
		writeCountField(block, header.countMinusOneField, (count - 1) >>> 0);
	}
};

export const rebaseClonePointers = (
	clone: Uint8Array,
	sourceStart: number,
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
			if (pointer === sourceStart + pointerOffset + 4) {
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

export type BlockInsertion = {
	at: number;
	bytes: Uint8Array;
	remove?: number;
};

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

	let cursor = 0;
	for (;;) {
		const sentinel = indexOfBytes(block, SENTINEL, cursor);
		if (sentinel < 0) break;
		cursor = sentinel + 1;
		const pointerOffset = sentinel + 8;
		if (pointerOffset + 4 > block.length) continue;
		const pointer = readU32(block, pointerOffset);
		if (pointer !== blockStart + pointerOffset + 4) continue;
		const pointerAbs = blockStart + pointerOffset;
		for (const insertion of insertions) {
			const remove = insertion.remove ?? 0;
			if (
				remove > 0 &&
				pointerAbs >= insertion.at &&
				pointerAbs < insertion.at + remove
			) {
				throw new Error("An inline pointer field is inside a replaced range");
			}
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

export const shiftExistingBlockPointers = (
	oldBlock: Uint8Array,
	newBlock: Uint8Array,
	blockStart: number,
	insertAbs: number,
	delta: number,
): void => {
	let cursor = 0;
	for (;;) {
		const sentinel = indexOfBytes(oldBlock, SENTINEL, cursor);
		if (sentinel < 0) break;
		const pointerOffset = sentinel + 8;
		if (pointerOffset + 4 <= oldBlock.length) {
			const pointer = readU32(oldBlock, pointerOffset);
			if (pointer === blockStart + pointerOffset + 4 && pointer >= insertAbs) {
				const oldPointerAbs = blockStart + pointerOffset;
				const newPointerOffset =
					pointerOffset + (oldPointerAbs >= insertAbs ? delta : 0);
				writeU32(newBlock, newPointerOffset, pointer + delta);
			}
		}
		cursor = sentinel + 1;
	}
};

export const unusedItemNo = (
	raw: Uint8Array,
	records: IdentifiedRecord[],
): number => {
	let highest = 0;
	for (const record of records) {
		if (record.itemNo > highest) highest = record.itemNo;
	}
	let candidate = highest + 1;
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
			if (pointer === entry.dataOffset + pointerOffset + 4) {
				writeU32(block, pointerOffset, pointer - entry.dataOffset);
			}
		}
		cursor = sentinel + 1;
	}
	forEachZeroSentinelLocator(
		block,
		parc.types.length,
		(pointerOffset, pointer) => {
			if (pointer === entry.dataOffset + pointerOffset + 4) {
				writeU32(block, pointerOffset, pointer - entry.dataOffset);
			}
		},
	);
	return block;
};

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
	forEachZeroSentinelLocator(
		source,
		before.types.length,
		(pointerOffset, pointer) => {
			if (pointer === oldEntry.dataOffset + pointerOffset + 4) {
				writeU32(expected, pointerOffset, pointer + delta);
			}
		},
	);
	return expected;
};

export const preservedRoot = (
	before: ParcBlob,
	oldEntry: TOCEntry,
	after: ParcBlob,
	newEntry: TOCEntry,
): boolean => {
	return sameBytes(
		normalizedBlock(before, oldEntry),
		normalizedBlock(after, newEntry),
	);
};

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => {
	if (a.length !== b.length) return false;
	for (let index = 0; index < a.length; index++) {
		if (a[index] !== b[index]) return false;
	}
	return true;
};

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
