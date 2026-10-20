import { defined } from "./defined";
import { listLayout, locator } from "./parc";
import {
	BlockParser,
	type ParcBlob,
	type ParsedField,
	parseParcBlob,
	type TypeDef,
} from "./parc-serializer";

export type WalkedObject = {
	type: TypeDef;
	start: number;
	end: number;
	payload: number;
	mask: Uint8Array;
	fields: ParsedField[];
	values: Record<string, unknown>;
	offsets: Record<string, number>;
};

export type RootObject = {
	parc: ParcBlob;
	parser: BlockParser;
	tocIndex: number;
	typeName: string;
	type: TypeDef;
	fields: ParsedField[];
	values: Record<string, unknown>;
	offsets: Record<string, number>;
};

type FieldColumn = {
	fieldIndex: number;
	name: string;
	starts: number[];
	ends: number[];
	values: unknown[];
	rows: Int32Array;
};

type WalkedList = {
	count: number;
	starts: number[];
	ends: number[];
	payloads: number[];
	masks: Uint8Array[];
	types: TypeDef[];
	columns: FieldColumn[];
};

const walkColumns = (parser: BlockParser, field: ParsedField): WalkedList => {
	if (field.start === undefined || field.end === undefined) {
		throw new Error(`${field.name} has no serialized range`);
	}
	const [count, headerEnd] = listLayout(parser.data, field.start, field.end);
	const starts: number[] = [];
	const ends: number[] = [];
	const payloads: number[] = [];
	const masks: Uint8Array[] = [];
	const types: TypeDef[] = [];
	const columnsByType = new Map<number, FieldColumn[]>();
	const rowTables = new Map<number, Int32Array[]>();
	let cursor = headerEnd;

	for (let index = 0; index < count; index++) {
		const end = parser.parseListElement(cursor, field.end);
		const [typeIndex, mask, payload] = locator(
			parser.data,
			cursor,
			parser.parc.typeByIndex,
		);
		const type = parser.parc.typeByIndex.get(typeIndex);
		if (!type) {
			throw new Error(`Unknown element type ${typeIndex} in ${field.name}`);
		}
		starts.push(cursor);
		ends.push(end);
		payloads.push(payload);
		masks.push(mask);
		types.push(type);

		let columns = columnsByType.get(typeIndex);
		if (columns === undefined) {
			columns = type.fields.map((fieldDef, fieldIndex) => ({
				fieldIndex,
				name: fieldDef.name,
				starts: [],
				ends: [],
				values: [],
				rows: new Int32Array(count).fill(-1),
			}));
			columnsByType.set(typeIndex, columns);
			rowTables.set(
				typeIndex,
				columns.map((column) => column.rows),
			);
		}
		const rows = defined(rowTables.get(typeIndex), "column rows");
		parser.parseFieldExtents(
			type,
			mask,
			payload + 4,
			end,
			(fieldIndex, _name, start, fieldEnd, value) => {
				const column = defined(columns, "field columns")[fieldIndex];
				if (!column) return;
				const row = column.starts.length;
				column.starts.push(start);
				column.ends.push(fieldEnd);
				column.values.push(value);
				const rowTable = rows[fieldIndex];
				if (rowTable) rowTable[index] = row;
			},
		);
		cursor = end;
	}
	return {
		count,
		starts,
		ends,
		payloads,
		masks,
		types,
		columns: [...columnsByType.values()].flat(),
	};
};

const collectFields = (
	fields: ParsedField[],
): {
	values: Record<string, unknown>;
	offsets: Record<string, number>;
} => {
	const values: Record<string, unknown> = {};
	const offsets: Record<string, number> = {};
	for (const field of fields) {
		if (!field.present) continue;
		values[field.name] = field.value;
		offsets[field.name] = field.start ?? 0;
	}
	return { values, offsets };
};

export const walkObjectList = (
	parser: BlockParser,
	field: ParsedField,
): WalkedObject[] => {
	const walked = walkColumns(parser, field);
	const objects: WalkedObject[] = Array.from({ length: walked.count });
	for (let index = 0; index < walked.count; index++) {
		const values: Record<string, unknown> = {};
		const offsets: Record<string, number> = {};
		const fields: ParsedField[] = [];
		for (const column of walked.columns) {
			const row = column.rows[index] ?? -1;
			if (row < 0) continue;
			const start = column.starts[row] ?? 0;
			const end = column.ends[row] ?? 0;
			const value = column.values[row];
			values[column.name] = value;
			offsets[column.name] = start;
			fields.push({
				fieldIndex: column.fieldIndex,
				name: column.name,
				present: true,
				start,
				end,
				value: value as ParsedField["value"],
			});
		}
		objects[index] = {
			type: defined(walked.types[index], "element type"),
			start: walked.starts[index] ?? 0,
			end: walked.ends[index] ?? 0,
			payload: walked.payloads[index] ?? 0,
			mask: walked.masks[index] ?? new Uint8Array(0),
			fields,
			values,
			offsets,
		};
	}
	return objects;
};

export type ColumnarWalk = {
	count: number;
	fields: Map<string, FieldColumn>;
	has: Map<string, Uint8Array>;
};

export const walkObjectListColumns = (
	parser: BlockParser,
	field: ParsedField,
): ColumnarWalk => {
	const walked = walkColumns(parser, field);
	const fields = new Map<string, FieldColumn>();
	const has = new Map<string, Uint8Array>();
	for (const column of walked.columns) {
		fields.set(column.name, column);
		const presence = new Uint8Array(walked.count);
		for (let index = 0; index < walked.count; index++) {
			if ((column.rows[index] ?? -1) >= 0) presence[index] = 1;
		}
		has.set(column.name, presence);
	}
	return { count: walked.count, fields, has };
};

const openParc = (raw: Uint8Array): [ParcBlob, BlockParser] => {
	const parc = parseParcBlob(raw);
	return [parc, new BlockParser(parc)];
};

const findRoot = (
	parc: ParcBlob,
	typeName: string,
	ordinal?: number,
): number => {
	const entries = parc.tocEntries.filter(
		(entry) => parc.typeByIndex.get(entry.classIndex)?.name === typeName,
	);
	if (ordinal === undefined) {
		if (entries.length !== 1) {
			throw new Error(
				`Expected one ${typeName} block, found ${entries.length}`,
			);
		}
		return defined(entries[0], "root block").index;
	}
	const entry = entries[ordinal];
	if (entry === undefined) {
		throw new Error(
			`Expected ${typeName} block ${ordinal}, found ${entries.length}`,
		);
	}
	return entry.index;
};

export const readRoot = (
	raw: Uint8Array,
	typeName: string,
	ordinal?: number,
): RootObject => {
	const [parc, parser] = openParc(raw);
	const tocIndex = findRoot(parc, typeName, ordinal);
	const root = parser.parseRootBlock(tocIndex);
	const type = defined(
		parc.typeByIndex.get(root.classIndex),
		`${typeName} type definition`,
	);
	const { values, offsets } = collectFields(root.fields);
	return {
		parc,
		parser,
		tocIndex,
		typeName,
		type,
		fields: root.fields,
		values,
		offsets,
	};
};

export const rootField = (root: RootObject, name: string): ParsedField => {
	const field = root.fields.find(
		(candidate) => candidate.name === name && candidate.present,
	);
	if (!field || field.start === undefined || field.end === undefined) {
		throw new Error(`${root.typeName}.${name} was not found`);
	}
	return field;
};

const readInlineObject = (
	parser: BlockParser,
	cursor: number,
	tail: number,
): WalkedObject | null => {
	try {
		const [typeIndex, mask, payload] = locator(
			parser.data,
			cursor,
			parser.parc.typeByIndex,
		);
		const type = parser.parc.typeByIndex.get(typeIndex);
		if (!type) return null;
		const end = parser.parseListElement(cursor, tail);
		const [fields] = parser.parseFields(type, mask, payload + 4, end);
		return {
			type,
			start: cursor,
			end,
			payload,
			mask,
			fields,
			...collectFields(fields),
		};
	} catch {
		return null;
	}
};

export const inlineChild = (
	parser: BlockParser,
	parent: WalkedObject,
	fieldName: string,
): WalkedObject | null => {
	const offset = parent.offsets[fieldName];
	if (offset === undefined) return null;
	return readInlineObject(parser, offset, parent.end);
};
