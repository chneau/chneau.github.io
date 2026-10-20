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

type RecordFieldValue = {
	recordStart: number;
	fieldName: string;
	bytes: Uint8Array;
	replace?: boolean;
};

type InsertRecordFieldsRequest = {
	rootType: string;
	listField: string;
	fields: RecordFieldValue[];
};

type InsertRecordFieldsResult = {
	payload: Uint8Array;
	fieldsCreated: number;
	recordsTouched: number;
	bytesAdded: number;
};

type RootFieldValue = {
	fieldName: string;
	bytes: Uint8Array;
};

type InsertRootFieldsRequest = {
	rootType: string;
	fields: RootFieldValue[];
};

export const scalarBytes = (size: number, value: number): Uint8Array => {
	const buffer = new Uint8Array(size);
	if (size === 1) writeU8(buffer, 0, value);
	else if (size === 2) writeU16(buffer, 0, value);
	else if (size === 4) writeU32(buffer, 0, value);
	else if (size === 8) writeU64(buffer, 0, BigInt(value));
	else throw new Error(`Unsupported scalar width ${size}`);
	return buffer;
};

export const stringFieldBytes = (text: string): Uint8Array => {
	const encoded = new TextEncoder().encode(text);
	const buffer = new Uint8Array(4 + encoded.length);
	writeU32(buffer, 0, encoded.length);
	buffer.set(encoded, 4);
	return buffer;
};

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

type FieldTarget = {
	type: TypeDef;
	typeName: string;
	maskStart: number;
	maskLength: number;
	emptyAt: number;
	fields: ParsedField[];
	sizeWord: number | null;
	trailingBytes: number;
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
	at: number;
	bytes: Uint8Array;
};

const runPosition = (target: FieldTarget, first: number): number => {
	const present: Array<ParsedField | undefined> = [];
	for (const field of target.fields) {
		if (field.present) present[field.fieldIndex] = field;
	}
	let cursor = target.emptyAt;
	for (let index = 0; index < first; index++) {
		const definition = target.type.fields[index];
		if (!definition) break;
		const field = present[index];
		if (field?.end !== undefined) {
			cursor = field.end;
		} else if (definition.metaKind === 6 || definition.metaKind === 7) {
			cursor += 1;
		}
	}
	return cursor;
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
		runs.push({
			target,
			fields: current,
			at: runPosition(target, first.index),
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

type Creation = {
	target: FieldTarget;
	fieldName: string;
	bytes: Uint8Array;
	replace: boolean;
};

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

const rootTarget = (raw: Uint8Array, root: RootTarget): FieldTarget => {
	const entry = defined(root.parc.tocEntries[root.tocIndex], "root TOC entry");
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

	const targets = new Map<number, FieldTarget>();
	const objectsByStart = new Map<number, WalkedObject>();
	for (const object of objects) {
		if (!objectsByStart.has(object.start)) {
			objectsByStart.set(object.start, object);
		}
	}
	const requests: Creation[] = [];
	for (const value of request.fields) {
		const object = objectsByStart.get(value.recordStart);
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
