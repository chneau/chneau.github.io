/**
 * Reading records out of the save's object graph, with byte offsets.
 *
 * The readers this editor already had answer "what does the save contain" —
 * `readInventory` for stacks, `readClan` for the companion roster. The editors
 * added here need the other half: for every value they show, the payload
 * offset to write it back to. Walking the graph generically keeps that out of
 * each feature:
 *
 *   - a root block is found by its type name, and its own fields come back with
 *     offsets, so `CharacterStatusSaveData._level` is one lookup;
 *   - an object list (`ReflectObject`) is walked element by element, which is
 *     how the bond, region and quest tables are stored;
 *   - an inline child object (`ReflectObject`, e.g. a bond's `_levelData`) is
 *     descended into, which is where those tables keep their level and XP.
 *
 * Only fields the presence mask marks as present are reported. That is the
 * distinction that matters for editing: an absent field's offset does not
 * exist in the payload at all, so writing it needs an insertion rather than a
 * write, and callers can tell the two cases apart.
 */

import { defined } from "./defined";
import { listLayout, locator } from "./parc";
import {
	BlockParser,
	type ParcBlob,
	type ParsedField,
	parseParcBlob,
	type TypeDef,
} from "./parc-serializer";

/** One object read from the payload, with every present field's offset. */
export type WalkedObject = {
	type: TypeDef;
	/** First byte of the element's locator wrapper. */
	start: number;
	/** First byte after the element. */
	end: number;
	/** Absolute offset of the element's payload header. */
	payload: number;
	mask: Uint8Array;
	fields: ParsedField[];
	values: Record<string, unknown>;
	offsets: Record<string, number>;
};

/**
 * A root block, ready to be walked. Its own fields are reported the same way an
 * element's are, so a caller that edits a root scalar (the player's level, say)
 * does not need a second shape.
 */
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

/**
 * One field of a walked list, as a column.
 *
 * `starts`/`ends`/`values` hold one row per element that has the field
 * present, and `rows` maps each element of the list to its row — or -1 when
 * the element's mask leaves the field out. The stage table (46k rows, ~4
 * present fields) ends up with four small arrays per field plus one
 * `Int32Array(46k)` per field, instead of ~600k `ParsedField` objects,
 * subarray views, and value boxes retained by one object-per-field-per-element
 * walk.
 */
type FieldColumn = {
	fieldIndex: number;
	name: string;
	starts: number[];
	ends: number[];
	values: unknown[];
	rows: Int32Array;
};

/**
 * The result of a columnar walk: per-element extents, and one column per
 * field. Element extents (`starts`/`ends`/`payloads`/`masks`/`types`) are flat
 * arrays indexed by element; field data lives in the columns.
 */
type WalkedList = {
	count: number;
	/** First byte of each element's locator wrapper. */
	starts: number[];
	/** First byte after each element. */
	ends: number[];
	/** Absolute offset of each element's payload header. */
	payloads: number[];
	masks: Uint8Array[];
	types: TypeDef[];
	columns: FieldColumn[];
};

/**
 * Walks an object list once, recording element extents and every present
 * field's `(start, end, value)` into columns instead of one `ParsedField` per
 * field per element. Allocation-free apart from the columns themselves: field
 * parsing goes through `BlockParser.parseFieldExtents`, and the parser's
 * element-end memo means the header-end scan in `parseObjectList` has already
 * paid for the boundary work.
 */
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

/**
 * Reads every element of an object-list field. `parser` must come from the same
 * payload the field's offsets were read from.
 *
 * One `WalkedObject` per element, so edit callers can keep addressing records
 * the way they always have. The columns underneath stay flat for the walk's
 * lifetime: on a 46k-row table this retains one object per element plus one
 * array per field, where the per-field-object walk retained an order of
 * magnitude more.
 */
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

/**
 * The columnar walk itself, for consumers that only read a few named fields
 * off every row of a big table (the 46k-row quest stage list is the reason
 * this exists). Callers address a field of element `i` as
 * `list.fields.get(name)` plus `list.rows.get(name)[i]` — an O(1) lookup and a
 * typed-array read — instead of materializing any per-element object.
 *
 * `rows.get(name)` is an `Int32Array` over the elements, holding the row index
 * into the field's column for elements where the field is present and -1
 * where the mask omits it; `list.has(name)[i]` mirrors that as a boolean. This
 * is the difference the edit paths already rely on (`slots.state !== null`),
 * preserved per element rather than per object.
 */
export type ColumnarWalk = {
	count: number;
	/** Per-field column lookup, keyed by field name. */
	fields: Map<string, FieldColumn>;
	/**
	 * Per-field presence map over the elements: rows where the field is
	 * present are `true`. Equivalent to `rows.get(name)[i] >= 0` without the
	 * arithmetic in the caller.
	 */
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

/** The single root block of `typeName`; throws when it is missing or doubled. */
const findRoot = (parc: ParcBlob, typeName: string): number => {
	const entries = parc.tocEntries.filter(
		(entry) => parc.typeByIndex.get(entry.classIndex)?.name === typeName,
	);
	if (entries.length !== 1) {
		throw new Error(`Expected one ${typeName} block, found ${entries.length}`);
	}
	return defined(entries[0], "root block").index;
};

/** Parses the root of `typeName`, so its own fields can be read or walked. */
export const readRoot = (raw: Uint8Array, typeName: string): RootObject => {
	const [parc, parser] = openParc(raw);
	const tocIndex = findRoot(parc, typeName);
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

/** The present field of `name` on a root, or a clear failure. */
export const rootField = (root: RootObject, name: string): ParsedField => {
	const field = root.fields.find(
		(candidate) => candidate.name === name && candidate.present,
	);
	if (!field || field.start === undefined || field.end === undefined) {
		throw new Error(`${root.typeName}.${name} was not found`);
	}
	return field;
};

/**
 * Descends into an inline child object (a `ReflectObject` field). Returns null
 * when the field does not hold an inline object the parser can resolve — a
 * pointer to a zero-length object, or one of the layouts that stores its
 * payload elsewhere.
 */
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

/** The inline child object held by `fieldName` on `parent`. */
export const inlineChild = (
	parser: BlockParser,
	parent: WalkedObject,
	fieldName: string,
): WalkedObject | null => {
	const offset = parent.offsets[fieldName];
	if (offset === undefined) return null;
	return readInlineObject(parser, offset, parent.end);
};
