/**
 * TypeScript port of the upstream PARC serializer (`parc_serializer.py`) from
 * SWISS Knife / Crimson Desert Save Editor (MPL-2.0).
 *
 * This is a derivative of that covered source; preserve the upstream
 * attribution and license notices when redistributing.
 *
 * The parser returns plain objects rather than Python dicts. Byte ranges that
 * the Python code exposes as `bytes` are returned as `Uint8Array`.
 */

import {
	bytesEqual,
	concatBytes,
	readF32,
	readF64,
	readI16,
	readI32,
	readI64,
	readU8,
	readU16,
	readU32,
	readU64,
	utf8DecodeBytes,
	writeU32,
} from "./bytes";
import { defined } from "./defined";

type FieldDef = {
	name: string;
	typeName: string;
	metaKind: number;
	metaSize: number;
	metaAux: number;
};

export type TypeDef = {
	index: number;
	name: string;
	fields: FieldDef[];
};

export type TOCEntry = {
	index: number;
	classIndex: number;
	sentinel1: number;
	sentinel2: number;
	dataOffset: number;
	dataSize: number;
};

export type ParcBlob = {
	raw: Uint8Array;
	header: Uint8Array;
	schemaBytes: Uint8Array;
	schemaOffset: number;
	schemaEnd: number;
	tocHeaderBytes: Uint8Array;
	tocOffset: number;
	types: TypeDef[];
	typeByIndex: Map<number, TypeDef>;
	tocEntries: TOCEntry[];
	dataStart: number;
	numRootEntries: number;
	streamSize: number;
	blockRaw: Map<number, Uint8Array>;
	modifiedBlocks: Map<number, Uint8Array>;
};

const fieldPresent = (maskBytes: Uint8Array, fieldIndex: number): boolean => {
	const byteIndex = Math.floor(fieldIndex / 8);
	const bitIndex = fieldIndex % 8;
	if (byteIndex >= maskBytes.length) return false;
	return ((maskBytes[byteIndex] ?? 0) & (1 << bitIndex)) !== 0;
};

export const parseParcBlob = (data: Uint8Array): ParcBlob => {
	if (data.length < 14) throw new Error("Blob too small");
	const magic = readU16(data, 0);
	if (magic !== 0xffff) {
		throw new Error(
			`Bad inner magic: 0x${magic.toString(16).toUpperCase().padStart(4, "0")}`,
		);
	}
	// Views, not copies: the parsed sections alias `data` and every consumer
	// either reads them or copies before writing (patchScalars, concatBytes),
	// so the multi-megabyte payload is never duplicated per parse.
	const header = data.subarray(0, 14);

	const schemaOffset = 14;
	let pos = schemaOffset;
	const numRootEntries = readU32(data, pos);
	const numTypes = readU16(data, pos + 4);
	pos += 6;

	const types: TypeDef[] = [];
	const typeByIndex = new Map<number, TypeDef>();
	for (let index = 0; index < numTypes; index++) {
		const nameLength = readU32(data, pos);
		pos += 4;
		const name = utf8DecodeBytes(data.subarray(pos, pos + nameLength));
		pos += nameLength;
		const fieldCount = readU16(data, pos);
		pos += 2;

		const fields: FieldDef[] = [];
		for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex++) {
			const fieldNameLength = readU32(data, pos);
			pos += 4;
			const fieldName = utf8DecodeBytes(
				data.subarray(pos, pos + fieldNameLength),
			);
			pos += fieldNameLength;
			const typeNameLength = readU32(data, pos);
			pos += 4;
			const typeName = utf8DecodeBytes(
				data.subarray(pos, pos + typeNameLength),
			);
			pos += typeNameLength;
			const metaKind = readU16(data, pos);
			const metaSize = readU16(data, pos + 2);
			const metaAux = readU32(data, pos + 4);
			pos += 8;
			fields.push({ name: fieldName, typeName, metaKind, metaSize, metaAux });
		}

		const typeDef: TypeDef = { index, name, fields };
		types.push(typeDef);
		typeByIndex.set(index, typeDef);
	}

	const schemaEnd = pos;
	const schemaBytes = data.subarray(schemaOffset, schemaEnd);

	const tocOffset = schemaEnd;
	const entryCount = readU32(data, pos + 4);
	const streamSize = readU32(data, pos + 8);
	const tocHeaderBytes = data.subarray(pos, pos + 12);
	pos += 12;

	const tocEntries: TOCEntry[] = [];
	for (let index = 0; index < entryCount; index++) {
		tocEntries.push({
			index,
			classIndex: readU32(data, pos),
			sentinel1: readU32(data, pos + 4),
			sentinel2: readU32(data, pos + 8),
			dataOffset: readU32(data, pos + 12),
			dataSize: readU32(data, pos + 16),
		});
		pos += 20;
	}

	const dataStart = pos;

	const blockRaw = new Map<number, Uint8Array>();
	for (const entry of tocEntries) {
		blockRaw.set(
			entry.index,
			data.subarray(entry.dataOffset, entry.dataOffset + entry.dataSize),
		);
	}

	return {
		raw: data,
		header,
		schemaBytes,
		schemaOffset,
		schemaEnd,
		tocHeaderBytes,
		tocOffset,
		types,
		typeByIndex,
		tocEntries,
		dataStart,
		numRootEntries,
		streamSize,
		blockRaw,
		modifiedBlocks: new Map(),
	};
};

export const serializeParc = (parc: ParcBlob): Uint8Array => {
	const parts: Uint8Array[] = [parc.header, parc.schemaBytes];

	const newBlockData = new Map<number, Uint8Array>();
	for (const entry of parc.tocEntries) {
		newBlockData.set(
			entry.index,
			parc.modifiedBlocks.get(entry.index) ??
				parc.blockRaw.get(entry.index) ??
				new Uint8Array(),
		);
	}

	const tocSize = 12 + parc.tocEntries.length * 20;
	const newDataStart = parc.schemaEnd + tocSize;

	let currentOffset = newDataStart;
	const newTocEntries: TOCEntry[] = [];
	for (const entry of parc.tocEntries) {
		const blockBytes = newBlockData.get(entry.index) ?? new Uint8Array();
		newTocEntries.push({
			index: entry.index,
			classIndex: entry.classIndex,
			sentinel1: entry.sentinel1,
			sentinel2: entry.sentinel2,
			dataOffset: currentOffset,
			dataSize: blockBytes.length,
		});
		currentOffset += blockBytes.length;
	}

	const totalSize = currentOffset;

	parts.push(writeU32Buffer(0));
	parts.push(writeU32Buffer(newTocEntries.length));
	parts.push(writeU32Buffer(totalSize));

	for (const entry of newTocEntries) {
		parts.push(writeU32Buffer(entry.classIndex));
		parts.push(writeU32Buffer(entry.sentinel1));
		parts.push(writeU32Buffer(entry.sentinel2));
		parts.push(writeU32Buffer(entry.dataOffset));
		parts.push(writeU32Buffer(entry.dataSize));
	}

	for (const entry of newTocEntries) {
		parts.push(newBlockData.get(entry.index) ?? new Uint8Array());
	}

	const out = concatBytes(...parts);
	fixupGlobalSelfReferences(out, parc, newTocEntries);
	return out;
};

const writeU32Buffer = (value: number): Uint8Array => {
	const buffer = new Uint8Array(4);
	writeU32(buffer, 0, value);
	return buffer;
};

/** Bytes in the inline-pointer sentinel: eight `0xff`. */
const SENTINEL_BYTES = 8;

/**
 * The next inline-pointer sentinel at or after `from`, before `end`, or -1.
 *
 * Serialization walks every byte of every shifted block looking for this
 * marker. Measuring `out.subarray(pos, pos + 8)` against the sentinel
 * allocated a view per byte — the single largest cost of an otherwise
 * two-byte edit — so the bytes are read in place instead. The offsets found
 * are the same; only the garbage is gone.
 */
const findSentinel = (out: Uint8Array, from: number, end: number): number => {
	for (let pos = from; pos < end; pos++) {
		if (out[pos] !== 0xff) continue;
		let run = true;
		for (let index = 1; index < SENTINEL_BYTES; index++) {
			if (out[pos + index] !== 0xff) {
				run = false;
				break;
			}
		}
		if (run) return pos;
	}
	return -1;
};

const fixupGlobalSelfReferences = (
	out: Uint8Array,
	oldParc: ParcBlob,
	newTocEntries: TOCEntry[],
): void => {
	const shiftedBlocks: Array<[number, number, number]> = [];
	for (let index = 0; index < newTocEntries.length; index++) {
		const newEntry = defined(newTocEntries[index], "new TOC entry");
		const oldEntry = defined(oldParc.tocEntries[index], "old TOC entry");
		const delta = newEntry.dataOffset - oldEntry.dataOffset;
		if (delta !== 0) {
			shiftedBlocks.push([
				newEntry.dataOffset,
				newEntry.dataOffset + newEntry.dataSize,
				delta,
			]);
		}
	}

	if (shiftedBlocks.length === 0) return;

	const deltas = new Set(shiftedBlocks.map(([, , delta]) => delta));
	if (deltas.size !== 1) return;
	const delta = defined([...deltas][0], "block delta");

	const typeIndices = new Set(oldParc.typeByIndex.keys());

	for (const [blockStart, blockEnd] of shiftedBlocks) {
		let pos = blockStart;
		while (pos < blockEnd - 12) {
			const found = findSentinel(out, pos, blockEnd - 12);
			if (found < 0) break;
			pos = found;

			const refPos = pos + 8;
			if (refPos + 4 > blockEnd) {
				pos += 1;
				continue;
			}

			const oldRef = readU32(out, refPos);
			const expectedOldRef = pos - delta + 12;
			if (oldRef === expectedOldRef) {
				writeU32(out, refPos, oldRef + delta);
				pos += 12;
				continue;
			}

			let foundValid = false;
			for (const maskByteCount of [1, 2, 3, 4, 8]) {
				const locStart = pos - (maskByteCount + 5);
				if (locStart < blockStart) continue;
				const readMaskByteCount = readU16(out, locStart);
				if (readMaskByteCount !== maskByteCount) continue;
				const typeIndexPos = locStart + 2 + maskByteCount;
				if (typeIndexPos + 3 > pos) continue;
				const typeIndex = readU16(out, typeIndexPos);
				if (!typeIndices.has(typeIndex)) continue;
				if ((out[typeIndexPos + 2] ?? 0) !== 0) continue;
				writeU32(out, refPos, oldRef + delta);
				foundValid = true;
				break;
			}

			pos += foundValid ? 12 : 1;
		}
	}
};

type ParsedFieldValue =
	| number
	| { kind: "inline_bytes"; count: number; data: Uint8Array }
	| { kind: "dynamic_array"; raw: Uint8Array }
	| { kind: "object_locator"; raw: Uint8Array; locatorKind: number }
	| { kind: "object_list"; raw: Uint8Array };

export type ParsedField = {
	fieldIndex: number;
	name: string;
	present: boolean;
	raw?: Uint8Array;
	value?: ParsedFieldValue;
	start?: number;
	end?: number;
};

type ParsedBlock = {
	tocIndex: number;
	classIndex: number;
	className: string;
	maskByteCount: number;
	maskBytes: Uint8Array;
	context: number;
	fields: ParsedField[];
	rawTail: Uint8Array;
};

export class BlockParser {
	readonly parc: ParcBlob;
	readonly data: Uint8Array;
	/** Element end offsets memoized across the parses of one payload. A list
	 * is walked twice in normal use — once to find where it ends, once to report
	 * its fields — and the walk is the expensive part on 46k-row tables. Sound
	 * because both walks must already agree on every boundary for the parsed
	 * output to be usable; this only skips recomputing the same answer. */
	private elementEnds = new Map<number, number>();
	/** One shared absent entry per (type, field index). Absent fields outnumber
	 * present ones in the big tables — the quest stage table has 15 slots but 2
	 * present — and an absent entry carries no data at all, only
	 * `present: false`. Rebuilding one per field per element was the largest
	 * allocation in a generic walk. Consumers only read `.present`/`.name` and
	 * never mutate an entry, so sharing one instance is safe. */
	private absentFields = new WeakMap<TypeDef, ParsedField[]>();

	constructor(parc: ParcBlob) {
		this.parc = parc;
		this.data = parc.raw;
	}

	private absentFieldsFor(typedef: TypeDef): ParsedField[] {
		let entries = this.absentFields.get(typedef);
		if (!entries) {
			entries = typedef.fields.map((field, index) => ({
				fieldIndex: index,
				name: field.name,
				present: false,
			}));
			this.absentFields.set(typedef, entries);
		}
		return entries;
	}

	parseRootBlock(tocIndex: number): ParsedBlock {
		const entry = defined(this.parc.tocEntries[tocIndex], "TOC entry");
		const typedef = this.parc.typeByIndex.get(entry.classIndex);
		if (!typedef) {
			throw new Error(`Unknown class index ${entry.classIndex}`);
		}
		let pos = entry.dataOffset;
		const tail = pos + entry.dataSize;

		const maskByteCount = readU16(this.data, pos);
		pos += 2;
		const maskBytes = this.data.subarray(pos, pos + maskByteCount);
		pos += maskByteCount;
		const context = readU32(this.data, pos);
		pos += 4;

		const [fields, end] = this.parseFields(typedef, maskBytes, pos, tail);

		return {
			tocIndex,
			classIndex: entry.classIndex,
			className: typedef.name,
			maskByteCount,
			maskBytes,
			context,
			fields,
			rawTail: this.data.subarray(end, tail),
		};
	}

	/**
	 * `parseFields` without building anything: reports each present field as
	 * `(fieldIndex, start, end, value)` through `visit` and returns the cursor
	 * after the last field. Used by the columnar list walk, which needs extents
	 * and scalars for tens of thousands of elements but never materializes a
	 * `ParsedField` or a `raw` view per field — allocating those was the walk's
	 * dominant cost. Absent fields produce no callback at all.
	 */
	parseFieldExtents(
		typedef: TypeDef,
		maskBytes: Uint8Array,
		pos: number,
		tail: number,
		visit: (
			fieldIndex: number,
			name: string,
			start: number,
			end: number,
			value: ParsedFieldValue,
		) => void,
	): number {
		let cursor = pos;
		for (let index = 0; index < typedef.fields.length; index++) {
			const fdef = defined(typedef.fields[index], "field definition");
			if (!fieldPresent(maskBytes, index)) continue;
			const start = cursor;
			const [value, end] = this.parseFieldValue(fdef, cursor, tail);
			visit(index, fdef.name, start, end, value);
			cursor = end;
		}
		return cursor;
	}

	parseFields(
		typedef: TypeDef,
		maskBytes: Uint8Array,
		pos: number,
		tail: number,
	): [ParsedField[], number] {
		const fields: ParsedField[] = [];
		const absent = this.absentFieldsFor(typedef);
		let cursor = pos;
		for (let index = 0; index < typedef.fields.length; index++) {
			const fdef = defined(typedef.fields[index], "field definition");
			if (!fieldPresent(maskBytes, index)) {
				fields.push(defined(absent[index], "absent field entry"));
				continue;
			}
			const start = cursor;
			const [value, end] = this.parseFieldValue(fdef, cursor, tail);
			fields.push({
				fieldIndex: index,
				name: fdef.name,
				present: true,
				// A view, not a copy: lists hold tens of thousands of elements and
				// this once allocated one slice per field per element.
				raw: this.data.subarray(start, end),
				value,
				start,
				end,
			});
			cursor = end;
		}
		return [fields, cursor];
	}

	parseFieldValue(
		fdef: FieldDef,
		pos: number,
		tail: number,
	): [ParsedFieldValue, number] {
		const metaKind = fdef.metaKind;
		const metaSize = fdef.metaSize;

		if ((metaKind === 0 || metaKind === 2) && metaSize > 0) {
			return [this.readScalar(fdef, pos), pos + metaSize];
		}
		if (metaKind === 1 && metaSize > 0) {
			const count = readU32(this.data, pos);
			const end = pos + 4 + count * metaSize;
			return [
				{ kind: "inline_bytes", count, data: this.data.subarray(pos + 4, end) },
				end,
			];
		}
		if (metaKind === 3 && metaSize > 0) {
			return this.parseDynamicArray(fdef, pos, tail);
		}
		if (metaKind === 4 || metaKind === 5) {
			return this.parseObjectLocator(fdef, pos, tail, metaKind);
		}
		if (metaKind === 6 || metaKind === 7) {
			return this.parseObjectList(fdef, pos, tail);
		}
		throw new Error(`Unknown meta_kind=${metaKind} for field ${fdef.name}`);
	}

	parseDynamicArray(
		_fdef: FieldDef,
		pos: number,
		tail: number,
	): [ParsedFieldValue, number] {
		const metaSize = _fdef.metaSize;
		const start = pos;

		if (
			pos + 14 <= tail &&
			bytesEqual(
				this.data.subarray(pos, pos + 5),
				new Uint8Array([0, 0, 6, 1, 0]),
			)
		) {
			const count = readU32(this.data, pos + 5);
			const end = pos + 9 + count * metaSize + 5;
			if (
				count < 0x10000 &&
				end <= tail &&
				bytesEqual(
					this.data.subarray(end - 5, end),
					new Uint8Array([1, 1, 1, 1, 1]),
				)
			) {
				return [
					{ kind: "dynamic_array", raw: this.data.subarray(start, end) },
					end,
				];
			}
		}

		if ((this.data[pos] ?? 0) === 1 && pos + 7 <= tail) {
			let markerEnd = pos;
			while (markerEnd < tail && (this.data[markerEnd] ?? 0) === 1) {
				markerEnd += 1;
			}
			if (
				markerEnd > pos &&
				markerEnd < tail &&
				(this.data[markerEnd] ?? 0) === 0 &&
				markerEnd + 5 <= tail
			) {
				const count = readU32(this.data, markerEnd + 1);
				let end = pos + (markerEnd - pos + 1) + 4 + count * metaSize;
				if (count < 0x10000 && end <= tail) {
					if (end < tail && (this.data[end] ?? 0) === 1) end += 1;
					return [
						{ kind: "dynamic_array", raw: this.data.subarray(start, end) },
						end,
					];
				}
			}
		}

		if (
			pos + 6 <= tail &&
			(this.data[pos] ?? 0) === 0 &&
			(this.data[pos + 1] ?? 0) === 0 &&
			(this.data[pos + 4] ?? 0) === 0 &&
			(this.data[pos + 5] ?? 0) === 0
		) {
			const count = readU16(this.data, pos + 2);
			const end = pos + 6 + count * metaSize;
			if (end <= tail) {
				return [
					{ kind: "dynamic_array", raw: this.data.subarray(start, end) },
					end,
				];
			}
		}

		const count = readU32(this.data, pos + 1);
		const end = pos + 5 + count * metaSize;
		if (count < 0x1000000 && end <= tail) {
			return [
				{ kind: "dynamic_array", raw: this.data.subarray(start, end) },
				end,
			];
		}

		throw new Error(
			`Dynamic array decode failed at 0x${pos.toString(16).toUpperCase()}`,
		);
	}

	readScalar(fdef: FieldDef, pos: number): number {
		const metaSize = fdef.metaSize;
		const typeName = fdef.typeName.toLowerCase();
		if (metaSize === 1) return readU8(this.data, pos);
		if (metaSize === 2) {
			if (typeName.includes("int16")) return readI16(this.data, pos);
			return readU16(this.data, pos);
		}
		if (metaSize === 4) {
			if (typeName.includes("float")) return readF32(this.data, pos);
			if (typeName.includes("int32")) return readI32(this.data, pos);
			return readU32(this.data, pos);
		}
		if (metaSize === 8) {
			if (typeName.includes("double")) return readF64(this.data, pos);
			if (typeName.includes("int64")) return Number(readI64(this.data, pos));
			return Number(readU64(this.data, pos));
		}
		let value = 0;
		for (let index = metaSize - 1; index >= 0; index--) {
			value = value * 256 + (this.data[pos + index] ?? 0);
		}
		return value;
	}

	parseObjectLocator(
		_fdef: FieldDef,
		pos: number,
		tail: number,
		locatorKind: number,
	): [ParsedFieldValue, number] {
		const start = pos;
		let bodyCursor = pos;

		if (locatorKind === 5) {
			bodyCursor = -1;
			for (const delta of [0, 1, 3]) {
				const probe = pos + delta;
				if (probe + 2 > tail) continue;
				const maskByteCount = readU16(this.data, probe);
				if (maskByteCount > 0 && maskByteCount <= 16) {
					bodyCursor = probe;
					break;
				}
			}
			if (bodyCursor < 0) {
				throw new Error(
					`Invalid object pointer locator at 0x${pos
						.toString(16)
						.toUpperCase()}`,
				);
			}
		}

		if (bodyCursor + 18 > tail) {
			throw new Error(
				`Object locator overruns at 0x${bodyCursor.toString(16).toUpperCase()}`,
			);
		}

		const childMaskByteCount = readU16(this.data, bodyCursor);
		if (childMaskByteCount === 0 || childMaskByteCount > 16) {
			throw new Error(`Invalid mask count ${childMaskByteCount}`);
		}

		const off = bodyCursor + 2 + childMaskByteCount;
		const wrapperEnd = off + 2 + 1 + 4 + 4 + 4;

		const childMaskBytes = this.data.subarray(
			bodyCursor + 2,
			bodyCursor + 2 + childMaskByteCount,
		);
		const childTypeIndex = readU16(this.data, off);
		const childPayloadOffset = readU32(this.data, off + 11);

		let end = wrapperEnd;

		const childTypedef = this.parc.typeByIndex.get(childTypeIndex);
		if (childTypedef && childPayloadOffset === wrapperEnd) {
			const [, payloadEnd] = this.parseInlinePayload(
				childTypedef,
				childMaskBytes,
				childPayloadOffset,
				tail,
			);
			end = payloadEnd;
		}

		const raw = this.data.subarray(start, end);
		return [{ kind: "object_locator", raw, locatorKind }, end];
	}

	parseInlinePayload(
		typedef: TypeDef,
		maskBytes: Uint8Array,
		payloadStart: number,
		tail: number,
	): [null, number] {
		if (payloadStart + 8 > tail) {
			throw new Error(
				`Inline payload overruns at 0x${payloadStart
					.toString(16)
					.toUpperCase()}`,
			);
		}

		let cursor = payloadStart + 4;

		for (let index = 0; index < typedef.fields.length; index++) {
			const fdef = defined(typedef.fields[index], "field definition");
			if (!fieldPresent(maskBytes, index)) continue;
			const [, next] = this.parseFieldValue(fdef, cursor, tail);
			cursor = next;
		}

		let sizeFieldOffset = -1;
		const maxProbe = Math.min(tail - 4, cursor + 64);
		for (let probe = cursor; probe <= maxProbe; probe++) {
			if (readU32(this.data, probe) === probe - payloadStart) {
				sizeFieldOffset = probe;
				break;
			}
		}

		const end = sizeFieldOffset < 0 ? cursor : sizeFieldOffset + 4;
		return [null, end];
	}

	parseObjectList(
		_fdef: FieldDef,
		pos: number,
		tail: number,
	): [ParsedFieldValue, number] {
		const start = pos;
		let lastError: unknown = null;

		// The header is probed at up to four byte shifts. Every probe that
		// decodes a valid list walks the same self-describing elements, so the
		// first success already gives the max end — confirmed empirically on
		// 85k+ lists across both fixtures (a shifted probe that "succeeds" with
		// a shorter walk was never observed). Early-exiting avoids re-walking
		// 46k-element stage tables three extra times per parse.
		for (const delta of [0, 1, 2, 3]) {
			const body = pos + delta;
			if (body + 18 > tail) continue;
			try {
				const prefixU8 = this.data[body] ?? 0;
				let count = 0;
				let headerSize = 0;

				let markerEnd = body;
				while (markerEnd < tail && (this.data[markerEnd] ?? 0) === 1) {
					markerEnd += 1;
				}

				if (
					markerEnd > body &&
					markerEnd + 17 <= tail &&
					(this.data[markerEnd] ?? 0) === 0 &&
					bytesEqual(
						this.data.subarray(markerEnd + 5, markerEnd + 18),
						new Uint8Array(13),
					)
				) {
					count = readU32(this.data, markerEnd + 1);
					headerSize = markerEnd - body + 1 + 4 + 13;
				} else if (
					prefixU8 === 0 &&
					(this.data[body + 1] ?? 0) === 0 &&
					(this.data[body + 2] ?? 0) === 0 &&
					(this.data[body + 3] ?? 0) === 0
				) {
					count = readU32(this.data, body + 4);
					headerSize = 18;
				} else if (prefixU8 === 0) {
					count =
						(this.data[body + 1] ?? 0) |
						((this.data[body + 2] ?? 0) << 8) |
						((this.data[body + 3] ?? 0) << 16);
					headerSize = 18;
				} else if (
					prefixU8 === 1 &&
					body + 21 <= tail &&
					(this.data[body + 1] ?? 0) === 1 &&
					(this.data[body + 2] ?? 0) === 1 &&
					(this.data[body + 3] ?? 0) === 0
				) {
					count = readU32(this.data, body + 4);
					headerSize = 21;
				} else if (prefixU8 === 1) {
					count =
						((this.data[body + 1] ?? 0) << 8) | (this.data[body + 2] ?? 0);
					headerSize = 19;
				} else {
					throw new Error(
						`Unsupported list prefix 0x${prefixU8
							.toString(16)
							.toUpperCase()
							.padStart(2, "0")}`,
					);
				}

				if (count > 100000) {
					throw new Error(`Implausible count ${count}`);
				}

				let elementCursor = body + headerSize;
				for (let index = 0; index < count; index++) {
					elementCursor = this.parseListElement(elementCursor, tail);
				}

				const raw = this.data.subarray(start, elementCursor);
				return [{ kind: "object_list", raw }, elementCursor];
			} catch (error) {
				lastError = error;
			}
		}

		throw lastError instanceof Error
			? lastError
			: new Error("Object list decode failed");
	}

	parseListElement(cursor: number, tail: number): number {
		// Boundaries are deterministic for (data, cursor), so memoize per cursor.
		// The end-scan in `parseObjectList` warms this for the later
		// field-collection walk of the same list.
		const cached = this.elementEnds.get(cursor);
		if (cached !== undefined) return cached;
		let end: number;
		try {
			end = this.parseFullLocatorElement(cursor, tail);
		} catch {
			// Fall through to the compact layout.
			end = this.parseCompactElement(cursor, tail);
		}
		this.elementEnds.set(cursor, end);
		return end;
	}

	parseFullLocatorElement(cursor: number, tail: number): number {
		if (cursor + 18 > tail) throw new Error("Overruns");

		const childMaskByteCount = readU16(this.data, cursor);
		if (childMaskByteCount === 0 || childMaskByteCount > 16) {
			throw new Error(`Invalid mask count ${childMaskByteCount}`);
		}

		const off = cursor + 2 + childMaskByteCount;
		const wrapperEnd = off + 2 + 1 + 4 + 4 + 4;
		if (wrapperEnd > tail) throw new Error("Wrapper overruns");

		const childMaskBytes = this.data.subarray(
			cursor + 2,
			cursor + 2 + childMaskByteCount,
		);
		const childTypeIndex = readU16(this.data, off);
		const childPayloadOffset = readU32(this.data, off + 11);

		const typedef = this.parc.typeByIndex.get(childTypeIndex);
		if (!typedef) throw new Error(`Invalid type index ${childTypeIndex}`);
		if (childPayloadOffset !== wrapperEnd) {
			throw new Error("Payload not inline");
		}

		const [, end] = this.parseInlinePayload(
			typedef,
			childMaskBytes,
			childPayloadOffset,
			tail,
		);
		return end;
	}

	parseCompactElement(cursor: number, tail: number): number {
		if (cursor + 18 > tail) throw new Error("Overruns");

		const childTypeIndex = readU16(this.data, cursor + 3);
		if (readU64(this.data, cursor + 6) !== 0xffffffffffffffffn) {
			throw new Error("Compact sentinel mismatch");
		}

		const childPayloadOffset = readU32(this.data, cursor + 14);
		if (childPayloadOffset !== cursor + 18) {
			throw new Error("Compact payload not inline");
		}

		const typedef = this.parc.typeByIndex.get(childTypeIndex);
		if (!typedef) throw new Error(`Invalid type index ${childTypeIndex}`);

		const childMaskBytes = new Uint8Array([this.data[cursor + 2] ?? 0]);
		const [, end] = this.parseInlinePayload(
			typedef,
			childMaskBytes,
			childPayloadOffset,
			tail,
		);
		return end;
	}
}

export const findInventoryTocIndex = (parc: ParcBlob): number | undefined => {
	for (const entry of parc.tocEntries) {
		if (
			entry.classIndex < parc.types.length &&
			parc.types[entry.classIndex]?.name === "InventorySaveData"
		) {
			return entry.index;
		}
	}
	return undefined;
};

type InventoryCategoryInfo = {
	locatorAbs: number;
	payloadAbs: number;
	maskBytes: Uint8Array;
	inventoryKey: number;
	hasItemList: boolean;
	itemListAbs: number;
	itemCount: number;
	itemCountOffsetAbs: number;
	itemsEndAbs: number;
	elemEndAbs: number;
};

export const findInventoryCategories = (
	parc: ParcBlob,
	invToc: number,
): InventoryCategoryInfo[] => {
	const entry = defined(parc.tocEntries[invToc], "inventory TOC entry");
	const data = parc.raw;
	const absStart = entry.dataOffset;
	const blockEnd = absStart + entry.dataSize;

	let pos = absStart;
	const maskByteCount = readU16(data, pos);
	pos += 2;
	pos += maskByteCount;
	pos += 4;

	const listRaw = data.subarray(pos);
	if (listRaw[0] === 0) {
		const catCount =
			(listRaw[1] ?? 0) === 0 &&
			(listRaw[2] ?? 0) === 0 &&
			(listRaw[3] ?? 0) === 0
				? readU32(data, pos + 4)
				: (listRaw[1] ?? 0) |
					((listRaw[2] ?? 0) << 8) |
					((listRaw[3] ?? 0) << 16);
		let elemCursor = pos + 18;
		const parser = new BlockParser(parc);
		const categories: InventoryCategoryInfo[] = [];

		for (let index = 0; index < catCount; index++) {
			const locatorAbs = elemCursor;
			const elemMbc = readU16(data, elemCursor);
			const elemMask = data.subarray(elemCursor + 2, elemCursor + 2 + elemMbc);
			const off = elemCursor + 2 + elemMbc;
			const payloadAbs = readU32(data, off + 11);

			let ppos = payloadAbs + 4;
			let inventoryKey = -1;
			if (fieldPresent(elemMask, 0)) {
				inventoryKey = readU16(data, ppos);
				ppos += 2;
			}
			if (fieldPresent(elemMask, 1)) ppos += 2;

			const hasItemList = fieldPresent(elemMask, 2);
			let itemListAbs = -1;
			let itemCount = 0;
			let itemCountOffsetAbs = 0;
			let itemsEndAbs = ppos;

			if (hasItemList) {
				itemListAbs = ppos;
				const ilRaw = data.subarray(ppos);
				if (ilRaw[0] === 0) {
					itemCount =
						(ilRaw[1] ?? 0) === 0 &&
						(ilRaw[2] ?? 0) === 0 &&
						(ilRaw[3] ?? 0) === 0
							? readU32(data, ppos + 4)
							: (ilRaw[1] ?? 0) |
								((ilRaw[2] ?? 0) << 8) |
								((ilRaw[3] ?? 0) << 16);
				} else {
					itemCount = 0;
				}
				itemCountOffsetAbs = ppos + 1;

				let itemCursor = ppos + 18;
				for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
					itemCursor = parser.parseFullLocatorElement(itemCursor, blockEnd);
				}
				itemsEndAbs = itemCursor;
			}

			const elemEnd = parser.parseFullLocatorElement(elemCursor, blockEnd);

			categories.push({
				locatorAbs,
				payloadAbs,
				maskBytes: elemMask,
				inventoryKey,
				hasItemList,
				itemListAbs,
				itemCount,
				itemCountOffsetAbs,
				itemsEndAbs,
				elemEndAbs: elemEnd,
			});
			elemCursor = elemEnd;
		}

		return categories;
	}

	throw new Error(
		`Unexpected _inventorylist header prefix: 0x${(listRaw[0] ?? 0)
			.toString(16)
			.toUpperCase()
			.padStart(2, "0")}`,
	);
};
