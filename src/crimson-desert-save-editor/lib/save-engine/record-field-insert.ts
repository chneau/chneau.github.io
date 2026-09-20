/**
 * Creating a field the save does not currently store.
 *
 * PARC records which of an object's fields are present with a bit in the
 * object's mask, and the game omits a field that still holds its default — a
 * false reward flag, an empty name, an experience of zero. So several of the
 * values worth editing are the ones that are *not there*: `_readMemoryRewarded`
 * is absent on every one of the 509 bonds in the endgame fixture,
 * `_mercenaryName` is absent on every companion, and
 * `CharacterStatusSaveData._experience` is absent on the player in both.
 *
 * Setting one of those is an insertion rather than a write: the field's bytes go
 * into the record at the position its field order implies, its presence bit goes
 * up, and everything after it moves. This module does that in the steps that are
 * easy to get wrong by hand:
 *
 *   - the missing fields of one record are merged into contiguous runs, so
 *     fields that end up adjacent cost one insertion rather than several;
 *   - `spliceInsertions` puts the runs in and relocates the inline pointers;
 *   - each presence bit and, for a list element, the record's size word are then
 *     recomputed at their shifted offsets.
 *
 * Two shapes of record are covered and they differ only in their framing. A list
 * element carries a size word at its end, and that word is what its length is
 * read from. A root block has a four-byte context word after its mask instead and
 * no size word at all — its length lives in the TOC, which `serializeParc`
 * recomputes from the bytes — so growing one changes no trailer. What a root can
 * have that an element cannot is bytes after its fields that are not fields: an
 * omitted list still serializes its empty marker. Appending a scalar field past
 * one of those markers would put it in the wrong place, so a root whose field
 * area is not its whole block is refused unless the new field goes in front of a
 * field that is already there.
 *
 * The caller gets a new payload back and is expected to re-read it before
 * committing — every applier in this engine proves its edit reopens with the
 * value it asked for.
 */

import {
	readU16,
	readU32,
	writeU8,
	writeU16,
	writeU32,
	writeU64,
} from "./bytes";
import { defined } from "./defined";
import {
	readRoot,
	rootField,
	type WalkedObject,
	walkObjectList,
} from "./object-walk";
import {
	type BlockInsertion,
	serializeWithPreservedRoots,
	shiftedOffset,
	spliceInsertions,
} from "./parc";
import type { ParcBlob, ParsedField, TypeDef } from "./parc-serializer";

type FieldDef = TypeDef["fields"][number];

/** One field to create or replace, on one element of an object list. */
type RecordFieldValue = {
	/** Absolute start of the element, as `walkObjectList` reports it. */
	recordStart: number;
	fieldName: string;
	/** The field's serialized bytes, with no framing beyond its own encoding. */
	bytes: Uint8Array;
	/** Swap the bytes of a field the record already carries instead of failing. */
	replace?: boolean;
};

type InsertRecordFieldsRequest = {
	/** Root block that owns the list, e.g. `FriendlySaveData`. */
	rootType: string;
	/** Object-list field on that root, e.g. `_friendlyDataList`. */
	listField: string;
	fields: RecordFieldValue[];
};

type InsertRecordFieldsResult = {
	payload: Uint8Array;
	fieldsCreated: number;
	recordsTouched: number;
	bytesAdded: number;
};

/** One scalar to create on a root block, e.g. the player's `_experience`. */
type RootFieldValue = {
	fieldName: string;
	bytes: Uint8Array;
};

type InsertRootFieldsRequest = {
	/** Root block that owns the field, e.g. `CharacterStatusSaveData`. */
	rootType: string;
	fields: RootFieldValue[];
};

/** Bytes of an unsigned scalar, little-endian, for `RecordFieldValue.bytes`. */
export const scalarBytes = (size: number, value: number): Uint8Array => {
	const buffer = new Uint8Array(size);
	if (size === 1) writeU8(buffer, 0, value);
	else if (size === 2) writeU16(buffer, 0, value);
	else if (size === 4) writeU32(buffer, 0, value);
	else if (size === 8) writeU64(buffer, 0, BigInt(value));
	else throw new Error(`Unsupported scalar width ${size}`);
	return buffer;
};

/** Bytes of a `staticstringA`-style field: a length prefix, then UTF-8. */
export const stringFieldBytes = (text: string): Uint8Array => {
	const encoded = new TextEncoder().encode(text);
	const buffer = new Uint8Array(4 + encoded.length);
	writeU32(buffer, 0, encoded.length);
	buffer.set(encoded, 4);
	return buffer;
};

/** Refuses bytes that do not match the width and kind the schema declares. */
const checkEncoding = (definition: FieldDef, bytes: Uint8Array): void => {
	if (definition.metaKind === 0 || definition.metaKind === 2) {
		if (bytes.length !== definition.metaSize) {
			throw new Error(
				`${definition.name} must be ${definition.metaSize} bytes, got ${bytes.length}`,
			);
		}
		return;
	}
	if (definition.metaKind === 1) {
		if (bytes.length < 4 || readU32(bytes, 0) + 4 !== bytes.length) {
			throw new Error(
				`${definition.name} must be a length-prefixed byte string`,
			);
		}
		return;
	}
	throw new Error(
		`${definition.name} is a ${definition.typeName} field, which cannot be created this way`,
	);
};

/**
 * One record's field list, however the record is framed. Only the details the
 * insertion needs differ between a list element and a root block; the placement
 * rule and the splicing are the same.
 */
type FieldTarget = {
	type: TypeDef;
	typeName: string;
	/** Absolute offset of the presence mask. */
	maskStart: number;
	/** Presence mask byte count, which bounds the presence bits. */
	maskLength: number;
	/** Where a field goes when the record stores no field at all. */
	emptyAt: number;
	/** Fields in declaration order; present ones carry absolute offsets. */
	fields: ParsedField[];
	/** Absolute offset of the record's own size word, or null when it has none. */
	sizeWord: number | null;
	/** Bytes after the fields that are not fields at all; must be 0 to append. */
	trailingBytes: number;
	/** Absolute end of the parsed fields, where an appended run would go. */
	fieldsEnd: number;
};

type PendingField = {
	index: number;
	definition: FieldDef;
	bytes: Uint8Array;
};

type PendingRun = {
	target: FieldTarget;
	fields: PendingField[];
	/** Absolute payload offset the run's bytes go in at. */
	at: number;
	bytes: Uint8Array;
};

/**
 * Where a run belongs: before the next present field, else after the last. A
 * record with no present field at all keeps only its header, so the run goes
 * right after it.
 */
const runPosition = (
	target: FieldTarget,
	first: number,
	last: number,
): number => {
	let next: number | null = null;
	let previousEnd: number | null = null;
	for (const field of target.fields) {
		if (
			!field.present ||
			field.start === undefined ||
			field.end === undefined
		) {
			continue;
		}
		if (field.fieldIndex > last && (next === null || field.start < next)) {
			next = field.start;
		}
		if (
			field.fieldIndex < first &&
			(previousEnd === null || field.end > previousEnd)
		) {
			previousEnd = field.end;
		}
	}
	if (next !== null) return next;
	if (previousEnd !== null) return previousEnd;
	return target.emptyAt;
};

const groupRuns = (
	fields: PendingField[],
	target: FieldTarget,
): PendingRun[] => {
	const ordered = [...fields].sort((a, b) => a.index - b.index);
	const runs: PendingRun[] = [];
	let current: PendingField[] = [];
	const flush = (): void => {
		if (current.length === 0) return;
		const first = defined(current[0], "first field of a run");
		const last = defined(current[current.length - 1], "last field of a run");
		runs.push({
			target,
			fields: current,
			at: runPosition(target, first.index, last.index),
			bytes: concat(current.map((field) => field.bytes)),
		});
		current = [];
	};
	for (const field of ordered) {
		const previous = current[current.length - 1];
		if (previous && field.index !== previous.index + 1) flush();
		current.push(field);
	}
	flush();
	return runs;
};

const concat = (parts: Uint8Array[]): Uint8Array => {
	let length = 0;
	for (const part of parts) length += part.length;
	const output = new Uint8Array(length);
	let offset = 0;
	for (const part of parts) {
		output.set(part, offset);
		offset += part.length;
	}
	return output;
};

/** One field to create on one target, with the definition it is checked against. */
type Creation = {
	target: FieldTarget;
	fieldName: string;
	bytes: Uint8Array;
	replace: boolean;
};

/**
 * Splices the requested fields into one block, sets their presence bits, and
 * grows the size words of the records that took them. Records of the same block
 * are edited together, because each insertion moves every later offset in it.
 */
const applyCreations = (
	parc: ParcBlob,
	tocIndex: number,
	requests: Creation[],
	context: string,
): { created: number; touched: number; delta: number } => {
	const entry = defined(parc.tocEntries[tocIndex], "root TOC entry");
	const oldBlock = defined(
		parc.modifiedBlocks.get(entry.index) ?? parc.blockRaw.get(entry.index),
		context,
	);

	const pending = new Map<
		FieldTarget,
		{ newFields: PendingField[]; delta: number }
	>();
	const replacements: BlockInsertion[] = [];
	for (const request of requests) {
		const { target } = request;
		const fieldIndex = target.type.fields.findIndex(
			(field) => field.name === request.fieldName,
		);
		if (fieldIndex < 0) {
			throw new Error(
				`${request.fieldName} is not a field of ${target.typeName}`,
			);
		}
		const definition = defined(
			target.type.fields[fieldIndex],
			"field definition",
		);
		checkEncoding(definition, request.bytes);
		const state = pending.get(target) ?? { newFields: [], delta: 0 };
		const present = target.fields.find(
			(candidate) => candidate.name === request.fieldName && candidate.present,
		);
		if (present) {
			if (!request.replace) {
				throw new Error(
					`${request.fieldName} is already present on ${target.typeName}; write it instead of creating it`,
				);
			}
			if (present.start === undefined || present.end === undefined) {
				throw new Error(`${request.fieldName} has no serialized range`);
			}
			const remove = present.end - present.start;
			replacements.push({
				at: present.start,
				remove,
				bytes: request.bytes,
			});
			state.delta += request.bytes.length - remove;
			pending.set(target, state);
			continue;
		}
		if (
			Math.floor(fieldIndex / 8) >= target.maskLength ||
			target.maskLength === 0
		) {
			throw new Error(
				`${target.typeName} cannot record presence for ${request.fieldName}`,
			);
		}
		state.newFields.push({
			index: fieldIndex,
			definition,
			bytes: request.bytes,
		});
		pending.set(target, state);
	}

	const runs = [...pending.entries()].flatMap(([target, state]) =>
		groupRuns(state.newFields, target),
	);
	for (const run of runs) {
		if (run.at < run.target.emptyAt) {
			throw new Error(
				`${run.target.typeName} has no room for the new field before its fields`,
			);
		}
		if (run.at > run.target.fieldsEnd) {
			throw new Error(
				`${run.target.typeName} has no room for the new field before its end`,
			);
		}
		// Appending past bytes that are not fields — an omitted list's empty
		// marker, say — would put the new field on the wrong side of them.
		if (run.at === run.target.fieldsEnd && run.target.trailingBytes > 0) {
			throw new Error(
				`${run.target.typeName} keeps ${run.target.trailingBytes} bytes after its fields, so a field cannot be appended to it`,
			);
		}
	}
	const insertions: BlockInsertion[] = [
		...runs.map((run) => ({ at: run.at, bytes: run.bytes })),
		...replacements,
	];
	const positions = new Set<number>();
	for (const insertion of insertions) {
		if (positions.has(insertion.at)) {
			throw new Error("Two field edits of one record land on the same offset");
		}
		positions.add(insertion.at);
	}

	const newBlock = spliceInsertions(oldBlock, entry.dataOffset, insertions);
	const absolute = (offset: number): number =>
		shiftedOffset(insertions, offset) - entry.dataOffset;

	let created = 0;
	for (const run of runs) {
		for (const field of run.fields) {
			const maskByte = Math.floor(field.index / 8);
			const position = absolute(run.target.maskStart + maskByte);
			if (position < 0 || position >= newBlock.length) {
				throw new Error("New presence bit falls outside the block");
			}
			newBlock[position] = (newBlock[position] ?? 0) | (1 << (field.index % 8));
			created += 1;
		}
		const state = defined(pending.get(run.target), "edited record");
		state.delta += run.bytes.length;
	}
	for (const [target, state] of pending) {
		if (target.sizeWord === null) continue;
		const position = absolute(target.sizeWord);
		writeU32(
			newBlock,
			position,
			readU32(oldBlock, target.sizeWord - entry.dataOffset) + state.delta,
		);
	}

	parc.modifiedBlocks.set(entry.index, newBlock);
	return {
		created,
		touched: pending.size,
		delta: [...pending.values()].reduce(
			(total, state) => total + state.delta,
			0,
		),
	};
};

/** The field target of one element of an object list. */
const elementTarget = (object: WalkedObject): FieldTarget => {
	const fieldsEnd = object.end - 4;
	return {
		type: object.type,
		typeName: object.type.name,
		maskStart: object.start + 2,
		maskLength: object.mask.length,
		emptyAt: object.payload + 4,
		fields: object.fields,
		sizeWord: fieldsEnd,
		trailingBytes: 0,
		fieldsEnd,
	};
};

/** The field target of a root block, whose framing its own header describes. */
const rootTarget = (raw: Uint8Array, root: RootTarget): FieldTarget => {
	const entry = defined(root.parc.tocEntries[root.tocIndex], "root TOC entry");
	// The block leads with the mask byte count, then the mask, then a context
	// word — the same header `parseRootBlock` walks.
	const maskLength = readU16(raw, entry.dataOffset);
	const maskStart = entry.dataOffset + 2;
	const payloadStart = maskStart + maskLength + 4;
	let fieldsEnd = payloadStart;
	for (const field of root.fields) {
		if (field.present && field.end !== undefined && field.end > fieldsEnd) {
			fieldsEnd = field.end;
		}
	}
	return {
		type: root.type,
		typeName: root.typeName,
		maskStart,
		maskLength,
		emptyAt: payloadStart,
		fields: root.fields,
		sizeWord: null,
		trailingBytes: entry.dataOffset + entry.dataSize - fieldsEnd,
		fieldsEnd,
	};
};

type RootTarget = {
	parc: ParcBlob;
	tocIndex: number;
	typeName: string;
	type: TypeDef;
	fields: ParsedField[];
};

/**
 * Creates fields on elements of one object list. Every requested field must be
 * genuinely absent and must belong to the element at the offset given.
 */
export const insertRecordFields = (
	raw: Uint8Array,
	request: InsertRecordFieldsRequest,
): InsertRecordFieldsResult => {
	if (request.fields.length === 0) {
		throw new Error("No fields were requested for creation");
	}
	const root = readRoot(raw, request.rootType);
	const listField = rootField(root, request.listField);
	const objects = walkObjectList(root.parser, listField);
	for (const object of objects) {
		if (readU32(raw, object.end - 4) !== object.end - 4 - object.payload) {
			throw new Error(
				`${object.type.name} records without a size word are not supported`,
			);
		}
	}

	// One target per element, reused by every request that lands on it: two
	// requests on one record have to be planned as one record, or their size-word
	// growth would be applied twice.
	const targets = new Map<number, FieldTarget>();
	const requests: Creation[] = [];
	for (const value of request.fields) {
		const object = objects.find(
			(candidate) => candidate.start === value.recordStart,
		);
		if (!object) {
			throw new Error(
				`${request.listField} has no element at payload offset ${value.recordStart}`,
			);
		}
		if (!object.type.fields.some((field) => field.name === value.fieldName)) {
			throw new Error(
				`${value.fieldName} is not a field of ${object.type.name}`,
			);
		}
		let target = targets.get(value.recordStart);
		if (!target) {
			target = elementTarget(object);
			targets.set(value.recordStart, target);
		}
		requests.push({
			target,
			fieldName: value.fieldName,
			bytes: value.bytes,
			replace: value.replace === true,
		});
	}

	const applied = applyCreations(
		root.parc,
		root.tocIndex,
		requests,
		request.listField,
	);
	return {
		payload: serializeWithPreservedRoots(root.parc),
		fieldsCreated: applied.created,
		recordsTouched: applied.touched,
		bytesAdded: applied.delta,
	};
};

/**
 * Creates scalar fields on a root block. This is what makes a value the game
 * only stores once it is non-zero — the player's experience, an omitted
 * sub-level count — editable instead of permanently reading as its default.
 */
export const insertRootFields = (
	raw: Uint8Array,
	request: InsertRootFieldsRequest,
): InsertRecordFieldsResult => {
	if (request.fields.length === 0) {
		throw new Error("No fields were requested for creation");
	}
	const root = readRoot(raw, request.rootType);
	const target = rootTarget(raw, {
		parc: root.parc,
		tocIndex: root.tocIndex,
		typeName: root.typeName,
		type: root.type,
		fields: root.fields,
	});
	const requests: Creation[] = request.fields.map((value) => ({
		target,
		fieldName: value.fieldName,
		bytes: value.bytes,
		replace: false,
	}));
	const applied = applyCreations(
		root.parc,
		root.tocIndex,
		requests,
		request.rootType,
	);
	return {
		payload: serializeWithPreservedRoots(root.parc),
		fieldsCreated: applied.created,
		recordsTouched: applied.touched,
		bytesAdded: applied.delta,
	};
};
