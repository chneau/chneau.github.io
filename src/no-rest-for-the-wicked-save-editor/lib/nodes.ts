/**
 * The CERIMAL value model: reads a document's content graph into the JSON the
 * editor works on, and writes it back in the same order with the same tag
 * decisions, so an untouched save comes back byte for byte.
 *
 * Split out of `format.ts` unchanged.
 */
import {
	base64Decode,
	isJsonObject,
	type JsonValue,
	type PathSegment,
	type SavePath,
} from "../../shared";
import {
	CerimalReader,
	CerimalWriter,
	formatGuid,
	parseGuid,
} from "./byte-reader";
import {
	definitionFor,
	enumSize,
	formatTypeRef,
	parseTypeRefText,
	readEnumValue,
	readSchema,
	readTypeRef,
	resolveTypeArgument,
	writeEnumValue,
	writeSchema,
	writeTypeRef,
} from "./schema";
import {
	type CerimalDocumentView,
	type DecodedDocument,
	type Schema,
	TYPE_ALIGN,
	TYPE_ASSET_GUID,
	TYPE_BOOL,
	TYPE_BYTE,
	TYPE_CHAR,
	TYPE_DECIMAL,
	TYPE_DOUBLE,
	TYPE_FLOAT,
	TYPE_FP,
	TYPE_GUID,
	TYPE_INT,
	TYPE_LFP,
	TYPE_LONG,
	TYPE_NINT,
	TYPE_NUINT,
	TYPE_SBYTE,
	TYPE_SHORT,
	TYPE_SIZE,
	TYPE_STRING,
	TYPE_UINT,
	TYPE_ULONG,
	TYPE_USHORT,
	type TypeDefinition,
	type TypeRef,
} from "./types";
import { hex64, xxHash64 } from "./xxhash";

/** The seven ASCII bytes that start every CERIMAL document. */
export const MAGIC = "CERIMAL";
// ---------------------------------------------------------------------------
// Value layout
// ---------------------------------------------------------------------------

/**
 * Whether a reference is introduced by a tag byte.
 *
 * Only strings and arrays are, along with class instances (whose members make
 * them variable width) and forward references to a generic argument (which
 * might resolve to either). Structs, enums and fixed-width primitives are
 * written bare, which is what lets a struct of them be copied as one block.
 */
const needsTag = (ref: TypeRef, schema: Schema): boolean => {
	switch (ref.kind) {
		case "primitive":
			return ref.wellKnown === TYPE_STRING;
		case "array":
		case "typeArgument":
			return true;
		case "named": {
			const index = schema.byGuid.get(ref.guidText);
			if (index === undefined) return true;
			return schema.definitions[index]?.kind === "class";
		}
	}
};

const alignUp = (offset: number, align: number): number =>
	align <= 1 ? offset : Math.ceil(offset / align) * align;

/**
 * The size of a value written as a bare block, or `null` when the type is not
 * fixed width.
 *
 * The reader and the writer both ask this question and must get the same
 * answer: a struct containing a string is stored member by member, each with a
 * tag, while a struct of numbers and enums is stored as one packed block with
 * padding between the members. Asking it in one place is what keeps the two
 * directions describing the same format — and asking it *before* reading any
 * bytes is what keeps a failed layout from leaving the stream half-consumed.
 */
const blittableSize = (
	ref: TypeRef,
	schema: Schema,
	typeArgs: readonly TypeRef[] | undefined,
	depth = 0,
): number | null => {
	if (depth > 32) return null;
	if (ref.kind === "primitive") {
		const size = TYPE_SIZE[ref.wellKnown];
		return size === undefined || size === 0 ? null : size;
	}
	if (ref.kind === "array") return null;
	if (ref.kind === "typeArgument") {
		const target = typeArgs?.[ref.index];
		return target === undefined
			? null
			: blittableSize(target, schema, typeArgs, depth + 1);
	}
	const definition = definitionFor(schema, ref);
	if (definition.kind === "class") return null;
	if (definition.kind === "enum") return enumSize(definition.underlying);
	const effective = ref.typeArgs.length > 0 ? ref.typeArgs : typeArgs;
	let size = 0;
	let align = 1;
	for (const member of definition.members) {
		if (!("typeRef" in member)) return null;
		const resolved = resolveTypeArgument(member.typeRef, effective);
		const memberSize = blittableSize(resolved, schema, effective, depth + 1);
		if (memberSize === null) return null;
		// Alignment comes from the member's own type, which is a whole type
		// reference rather than a width: an eight-byte member is aligned
		// differently from a string, and only a struct can nest.
		const memberAlign = alignmentOf(resolved, schema, effective);
		size = alignUp(size, memberAlign) + memberSize;
		align = Math.max(align, memberAlign);
	}
	return alignUp(size, align);
};

/** The alignment of a fixed-width value, or 1 when it is not fixed width. */
const alignmentOf = (
	ref: TypeRef,
	schema: Schema,
	typeArgs: readonly TypeRef[] | undefined,
): number => {
	if (ref.kind === "primitive") return TYPE_ALIGN[ref.wellKnown] ?? 1;
	if (ref.kind === "typeArgument") {
		const target = typeArgs?.[ref.index];
		return target === undefined ? 1 : alignmentOf(target, schema, typeArgs);
	}
	if (ref.kind !== "named") return 1;
	const definition = definitionFor(schema, ref);
	if (definition.kind === "class") return 1;
	if (definition.kind === "enum") return enumSize(definition.underlying);
	const effective = ref.typeArgs.length > 0 ? ref.typeArgs : typeArgs;
	let align = 1;
	for (const member of definition.members) {
		if (!("typeRef" in member)) return 1;
		align = Math.max(
			align,
			alignmentOf(
				resolveTypeArgument(member.typeRef, effective),
				schema,
				effective,
			),
		);
	}
	return align;
};

// ---------------------------------------------------------------------------
// Reading the content graph
// ---------------------------------------------------------------------------

/**
 * State for one pass over a content section.
 *
 * `path` is mutated in place rather than copied per node: a realm save holds
 * millions of them, and a fresh array at every step is a fresh array per step
 * in the collector's queue. `backrefs` is the table the tags index into.
 */
type ReadContext = {
	readonly reader: CerimalReader;
	readonly schema: Schema;
	readonly backrefs: JsonValue[];
	/** Paths of the values the file registered, in the order it registered them. */
	readonly registered: SavePath[];
	/** Extents of the multi-dimensional arrays, which the document cannot imply. */
	readonly dimensions: (readonly [SavePath, readonly number[]])[];
	readonly path: PathSegment[];
};

const readPrimitive = (
	reader: CerimalReader,
	wellKnown: number,
	tagPayload: number,
): JsonValue => {
	switch (wellKnown) {
		case TYPE_BOOL:
			return reader.u8("a boolean") !== 0;
		case TYPE_SBYTE:
			return reader.i8("a signed byte");
		case TYPE_BYTE:
			return reader.u8("a byte");
		case TYPE_SHORT:
			return reader.i16("a 16-bit integer");
		case TYPE_USHORT:
		case TYPE_CHAR:
			return reader.u16("a 16-bit integer");
		case TYPE_INT:
			return reader.i32("a 32-bit integer");
		case TYPE_UINT:
			return reader.u32("a 32-bit integer");
		case TYPE_FLOAT:
			return reader.f32("a 32-bit float");
		case TYPE_DOUBLE:
			return reader.f64("a 64-bit float");
		case TYPE_FP:
			// Fixed point, with sixteen fractional bits: stored as an integer
			// and only turned into a number on the way out.
			return Number(reader.i64("a fixed-point value")) / 65536;
		case TYPE_LFP:
			return reader.i32("a fixed-point value") / 65536;
		case TYPE_STRING:
			return new TextDecoder().decode(reader.borrow(tagPayload, "a string"));
		case TYPE_GUID:
			return formatGuid(reader.borrow(16, "a GUID"));
		case TYPE_DECIMAL:
			return Array.from(reader.borrow(16, "a decimal"))
				.map((byte) => byte.toString(16).padStart(2, "0"))
				.join("");
		case TYPE_LONG:
		case TYPE_NINT:
			// A 64-bit integer does not survive a JavaScript number, so it is
			// carried as its decimal text, which round-trips exactly.
			return reader.i64("a 64-bit integer").toString();
		case TYPE_ULONG:
		case TYPE_NUINT:
		case TYPE_ASSET_GUID:
			return reader.u64("a 64-bit integer").toString();
		default:
			throw new Error(
				`CERIMAL primitive type ${wellKnown} cannot be read by this editor.`,
			);
	}
};

/**
 * The base type a class inherits from, resolved against its generic arguments.
 *
 * Split out because the reader and the writer both walk the inheritance chain
 * and must agree on the order they visit it: base fields first, so a derived
 * field of the same name overwrites the one it hides.
 */
const baseOf = (
	definition: TypeDefinition,
	schema: Schema,
	typeArgs: readonly TypeRef[] | undefined,
): {
	readonly definition: TypeDefinition;
	readonly typeArgs: readonly TypeRef[];
} | null => {
	if (definition.kind !== "class") return null;
	const base = definition.base;
	if (!(base?.hasBase === true) || !base.baseTypeRef) return null;
	const resolved = resolveTypeArgument(base.baseTypeRef, typeArgs);
	if (resolved.kind !== "named") return null;
	const index = schema.byGuid.get(resolved.guidText);
	const parent = index === undefined ? undefined : schema.definitions[index];
	if (!parent) return null;
	return {
		definition: parent,
		typeArgs:
			resolved.typeArgs.length > 0
				? resolved.typeArgs.map((argument) =>
						resolveTypeArgument(argument, typeArgs),
					)
				: (typeArgs ?? []),
	};
};

/** Reads a record's members into `into`, base class first. */
const readRecordFields = (
	context: ReadContext,
	definition: TypeDefinition,
	typeArgs: readonly TypeRef[] | undefined,
	into: { [key: string]: JsonValue },
): void => {
	const { reader, schema } = context;
	const parent = baseOf(definition, schema, typeArgs);
	if (parent) {
		readRecordFields(context, parent.definition, parent.typeArgs, into);
	}
	if (definition.kind === "enum") return;

	for (const [index, member] of definition.members.entries()) {
		if (definition.kind === "class") {
			if (!("kind" in member)) {
				throw new Error(`${definition.name} is a class with a variant member.`);
			}
			if (member.kind === "field") {
				context.path.push(member.name);
				into[member.name] = readNode(context, member.typeRef, typeArgs);
				context.path.pop();
			} else if (member.kind === "list") {
				// A list and a dictionary have no name in the schema, only a
				// position, so the position is the key in the decoded document.
				const key = `$list${index}`;
				context.path.push(key);
				const count = reader.sevenBit("a list's length");
				const items: JsonValue[] = [];
				for (let item = 0; item < count; item += 1) {
					context.path.push(item);
					items.push(readNode(context, member.elementType, typeArgs));
					context.path.pop();
				}
				into[key] = items;
				context.path.pop();
			} else {
				const key = `$dict${index}`;
				context.path.push(key);
				const count = reader.sevenBit("a dictionary's length");
				const entries: JsonValue[] = [];
				for (let entry = 0; entry < count; entry += 1) {
					context.path.push(entry);
					const pair: { key: JsonValue; value: JsonValue } = {
						key: null,
						value: null,
					};
					context.path.push("key");
					pair.key = readNode(context, member.keyType, typeArgs);
					context.path.pop();
					context.path.push("value");
					pair.value = readNode(context, member.valueType, typeArgs);
					context.path.pop();
					entries.push(pair);
					context.path.pop();
				}
				into[key] = entries;
				context.path.pop();
			}
			continue;
		}
		if (!("typeRef" in member)) {
			throw new Error(`${definition.name} is a struct with an enum variant.`);
		}
		context.path.push(member.name);
		into[member.name] = readNode(context, member.typeRef, typeArgs);
		context.path.pop();
	}
};

const readValue = (
	context: ReadContext,
	ref: TypeRef,
	tagPayload: number,
	typeArgs: readonly TypeRef[] | undefined,
): JsonValue => {
	const { reader, schema } = context;
	if (ref.kind === "primitive") {
		return readPrimitive(reader, ref.wellKnown, tagPayload);
	}
	if (ref.kind === "typeArgument") {
		const target = typeArgs?.[ref.index];
		if (!target) {
			throw new Error("The schema uses a generic argument it never supplied.");
		}
		return readValue(context, target, tagPayload, typeArgs);
	}
	if (ref.kind === "array") {
		// Only the first extent rides in the tag; the rest follow as 7-bit
		// integers, and the elements are stored flattened.
		const dimensions: number[] = [tagPayload];
		for (let rank = 1; rank < ref.rank; rank += 1) {
			dimensions.push(reader.sevenBit("an array's extent"));
		}
		if (ref.rank > 1) {
			context.dimensions.push([[...context.path], dimensions]);
		}
		const total = dimensions.reduce((product, extent) => product * extent, 1);
		const items: JsonValue[] = [];
		for (let index = 0; index < total; index += 1) {
			context.path.push(index);
			items.push(readNode(context, ref.element, typeArgs));
			context.path.pop();
		}
		return items;
	}

	const definition = definitionFor(schema, ref);
	const effective = ref.typeArgs.length > 0 ? ref.typeArgs : typeArgs;
	if (definition.kind === "enum") {
		const value = readEnumValue(reader, definition.underlying);
		const variant = definition.members.find(
			(candidate) => "value" in candidate && candidate.value === value,
		);
		return variant && "name" in variant ? variant.name : value.toString();
	}
	const into: { [key: string]: JsonValue } = {};
	if (definition.kind !== "class") {
		// A struct of fixed-width members is one packed block, padding and all,
		// with each member read from its own place inside it. The size is asked
		// for before a byte is taken, so a struct that is not fixed width costs
		// nothing and leaves the stream where it was.
		const size = blittableSize(ref, schema, effective);
		if (size !== null) {
			const block: ReadContext = {
				...context,
				reader: new CerimalReader(
					reader.borrow(size, `a ${definition.name} value`),
				),
			};
			let offset = 0;
			for (const member of definition.members) {
				if (!("typeRef" in member)) {
					throw new Error(
						`${definition.name} has a variant where a field belongs.`,
					);
				}
				const resolved = resolveTypeArgument(member.typeRef, effective);
				const memberSize = blittableSize(resolved, schema, effective);
				if (memberSize === null) {
					throw new Error(
						`${definition.name}.${member.name} has no fixed width.`,
					);
				}
				offset = alignUp(offset, alignmentOf(resolved, schema, effective));
				block.reader.seek(offset);
				into[member.name] = readValue(block, resolved, 0, effective);
				offset += memberSize;
			}
			return into;
		}
	}
	readRecordFields(context, definition, effective, into);
	return into;
};

const readNode = (
	context: ReadContext,
	ref: TypeRef,
	typeArgs: readonly TypeRef[] | undefined,
): JsonValue => {
	const { reader, schema } = context;
	const resolved = resolveTypeArgument(ref, typeArgs);
	if (!needsTag(resolved, schema)) {
		return readValue(context, resolved, 0, typeArgs);
	}
	const tag = reader.sevenBit("a value tag");
	const kind = tag & 0x3;
	if (kind === 0) return null;
	if (kind === 1) {
		const slot = tag >> 2;
		const value = context.backrefs[slot];
		if (value === undefined) {
			throw new Error(
				`The content stream refers back to value ${slot}, which it never wrote.`,
			);
		}
		return value;
	}
	if (kind === 2) {
		const value = readValue(context, resolved, tag >> 3, typeArgs);
		// Bit 2 of the tag says the value joins the back-reference table, and it
		// joins *after* being read — so a value nested inside it is registered
		// first and takes the lower slot.
		if (((tag >> 2) & 1) !== 0) {
			context.registered.push([...context.path]);
			context.backrefs.push(value);
		}
		return value;
	}
	const runtimeType = readTypeRef(reader);
	return {
		$type: formatTypeRef(runtimeType, schema),
		$value: readNode(context, runtimeType, typeArgs),
	};
};

// ---------------------------------------------------------------------------
// Writing the content graph
// ---------------------------------------------------------------------------

/** State for one pass over a content section being rebuilt. */
type WriteContext = {
	readonly writer: CerimalWriter;
	readonly schema: Schema;
	/** Values already in the back-reference table, keyed by object identity. */
	readonly backrefs: Map<JsonValue, number>;
	/** The paths whose values the file registered, as a set of path keys. */
	readonly registered: ReadonlySet<string>;
	readonly dimensions: ReadonlyMap<string, readonly number[]>;
	readonly path: PathSegment[];
	/** The next slot to hand out; the file's table is filled in write order. */
	nextSlot: number;
};

const pathKey = (path: readonly PathSegment[]): string => JSON.stringify(path);

export const asNumber = (value: JsonValue, what: string): number => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	throw new Error(
		`This field wants a number for ${what}, not ${typeof value}.`,
	);
};

const asBigInt = (value: JsonValue, what: string): bigint => {
	if (typeof value === "number" && Number.isInteger(value)) {
		return BigInt(value);
	}
	if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
	throw new Error(`This field wants a whole 64-bit number for ${what}.`);
};

const asText = (value: JsonValue, what: string): string => {
	if (typeof value === "string") return value;
	throw new Error(`This field wants text for ${what}, not ${typeof value}.`);
};

const asBoolean = (value: JsonValue, what: string): boolean => {
	if (typeof value === "boolean") return value;
	throw new Error(`This field wants true or false for ${what}.`);
};

const asHexBytes = (value: JsonValue, what: string): Uint8Array => {
	const text = asText(value, what);
	if (text.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(text)) {
		throw new Error(`This field wants ${what} as pairs of hex digits.`);
	}
	const bytes = new Uint8Array(text.length / 2);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Number.parseInt(text.slice(index * 2, index * 2 + 2), 16);
	}
	return bytes;
};

const writePrimitive = (
	writer: CerimalWriter,
	wellKnown: number,
	value: JsonValue,
): void => {
	switch (wellKnown) {
		case TYPE_BOOL:
			writer.u8(asBoolean(value, "BOOL") ? 1 : 0);
			return;
		case TYPE_SBYTE:
			writer.i8(asNumber(value, "SBYTE"));
			return;
		case TYPE_BYTE:
			writer.u8(asNumber(value, "BYTE"));
			return;
		case TYPE_SHORT:
			writer.i16(asNumber(value, "SHORT"));
			return;
		case TYPE_USHORT:
		case TYPE_CHAR:
			writer.u16(asNumber(value, "USHORT"));
			return;
		case TYPE_INT:
			writer.i32(asNumber(value, "INT"));
			return;
		case TYPE_UINT:
			writer.u32(asNumber(value, "UINT"));
			return;
		case TYPE_FLOAT:
			writer.f32(asNumber(value, "FLOAT"));
			return;
		case TYPE_DOUBLE:
			writer.f64(asNumber(value, "DOUBLE"));
			return;
		case TYPE_FP:
			// `Math.round` because the stored value is an integer number of
			// 1/65536ths, and the document holds a float that may have lost the
			// last bit of it on the way through JSON. Rounding is what makes a
			// value that was read and written back unchanged come out identical.
			writer.i64(BigInt(Math.round(asNumber(value, "FP") * 65536)));
			return;
		case TYPE_LFP:
			writer.i32(Math.round(asNumber(value, "LFP") * 65536));
			return;
		case TYPE_STRING:
			writer.raw(new TextEncoder().encode(asText(value, "STRING")));
			return;
		case TYPE_GUID:
			writer.raw(parseGuid(asText(value, "GUID")));
			return;
		case TYPE_DECIMAL:
			writer.raw(asHexBytes(value, "DECIMAL"));
			return;
		case TYPE_LONG:
		case TYPE_NINT:
			writer.i64(asBigInt(value, "LONG"));
			return;
		case TYPE_ULONG:
		case TYPE_NUINT:
		case TYPE_ASSET_GUID:
			writer.u64(asBigInt(value, "ULONG"));
			return;
		default:
			throw new Error(
				`CERIMAL primitive type ${wellKnown} cannot be written by this editor.`,
			);
	}
};

const writeRecordFields = (
	context: WriteContext,
	definition: TypeDefinition,
	typeArgs: readonly TypeRef[] | undefined,
	value: { readonly [key: string]: JsonValue },
): void => {
	const { writer, schema } = context;
	const parent = baseOf(definition, schema, typeArgs);
	if (parent) {
		writeRecordFields(context, parent.definition, parent.typeArgs, value);
	}
	if (definition.kind === "enum") return;

	const field = (name: string): JsonValue => {
		const found = value[name];
		if (found === undefined) {
			throw new Error(`${definition.name} has no field called ${name}.`);
		}
		return found;
	};

	for (const [index, member] of definition.members.entries()) {
		if (definition.kind === "class") {
			if (!("kind" in member)) {
				throw new Error(`${definition.name} is a class with a variant member.`);
			}
			if (member.kind === "field") {
				context.path.push(member.name);
				writeNode(context, member.typeRef, field(member.name), typeArgs);
				context.path.pop();
			} else if (member.kind === "list") {
				const key = `$list${index}`;
				const items = value[key];
				if (!Array.isArray(items)) {
					throw new Error(`${definition.name} has no list at ${key}.`);
				}
				context.path.push(key);
				writer.sevenBit(items.length);
				for (const [item, entry] of items.entries()) {
					context.path.push(item);
					writeNode(context, member.elementType, entry, typeArgs);
					context.path.pop();
				}
				context.path.pop();
			} else {
				const key = `$dict${index}`;
				const entries = value[key];
				if (!Array.isArray(entries)) {
					throw new Error(`${definition.name} has no dictionary at ${key}.`);
				}
				context.path.push(key);
				writer.sevenBit(entries.length);
				for (const [entryIndex, pair] of entries.entries()) {
					if (!isJsonObject(pair)) {
						throw new Error(`An entry of ${key} is not a key and a value.`);
					}
					context.path.push(entryIndex);
					context.path.push("key");
					writeNode(context, member.keyType, pair.key ?? null, typeArgs);
					context.path.pop();
					context.path.push("value");
					writeNode(context, member.valueType, pair.value ?? null, typeArgs);
					context.path.pop();
					context.path.pop();
				}
				context.path.pop();
			}
			continue;
		}
		if (!("typeRef" in member)) {
			throw new Error(`${definition.name} is a struct with an enum variant.`);
		}
		context.path.push(member.name);
		writeNode(context, member.typeRef, field(member.name), typeArgs);
		context.path.pop();
	}
};

/**
 * The extents to write an array with.
 *
 * Only the first is recoverable from a flattened document. A rank of one needs
 * nothing; anything higher was recorded when the save was read, because
 * `[2,3,4]` and `[24,1,1]` hold the same twenty-four elements and only the
 * file knows which it meant.
 */
const arrayExtents = (
	context: WriteContext,
	rank: number,
	length: number,
): readonly number[] => {
	if (rank <= 1) return [length];
	const recorded = context.dimensions.get(pathKey(context.path));
	if (!recorded) {
		throw new Error(
			"This save holds a multi-dimensional array, and this document does not record its shape.",
		);
	}
	return recorded;
};

/**
 * Writes a value that is already known not to be introduced by a tag.
 *
 * There is no payload parameter, unlike the reader's: the payload a tag carries
 * is a length or an extent, and both are implied by what gets written — a
 * string writes its own bytes and an array its own elements — so it is computed
 * once, in `tagPayloadFor`, and never needed again.
 */
const writeValue = (
	context: WriteContext,
	ref: TypeRef,
	value: JsonValue,
	typeArgs: readonly TypeRef[] | undefined,
): void => {
	const { writer, schema } = context;
	if (ref.kind === "primitive") {
		writePrimitive(writer, ref.wellKnown, value);
		return;
	}
	if (ref.kind === "typeArgument") {
		const target = typeArgs?.[ref.index];
		if (!target) {
			throw new Error("The schema uses a generic argument it never supplied.");
		}
		writeValue(context, target, value, typeArgs);
		return;
	}
	if (ref.kind === "array") {
		if (!Array.isArray(value)) {
			throw new Error(
				`${formatTypeRef(ref, schema)} is an array, and this value is not one.`,
			);
		}
		const extents = arrayExtents(context, ref.rank, value.length);
		for (let rank = 1; rank < extents.length; rank += 1) {
			writer.sevenBit(extents[rank] ?? 0);
		}
		for (const [index, item] of value.entries()) {
			context.path.push(index);
			writeNode(context, ref.element, item, typeArgs);
			context.path.pop();
		}
		return;
	}

	const definition = definitionFor(schema, ref);
	const effective = ref.typeArgs.length > 0 ? ref.typeArgs : typeArgs;
	if (definition.kind === "enum") {
		const variant =
			typeof value === "string"
				? definition.members.find(
						(candidate) => "name" in candidate && candidate.name === value,
					)
				: undefined;
		writeEnumValue(
			writer,
			definition.underlying,
			variant && "value" in variant
				? variant.value
				: asBigInt(value, definition.name),
		);
		return;
	}
	if (definition.kind !== "class") {
		// The same question the reader asked, so the two agree on which of the
		// two forms a struct is stored in. Padding goes out as zeroes: the real
		// saves do contain structs that need it — `System.Nullable<T>` fills
		// nine of its sixteen bytes — and all eleven of them come back
		// byte-identical, so the game's own writer leaves that padding zero.
		const size = blittableSize(ref, schema, effective);
		if (size !== null) {
			const object = isJsonObject(value) ? value : {};
			const block = new CerimalWriter(size);
			const blockContext: WriteContext = { ...context, writer: block };
			let offset = 0;
			for (const member of definition.members) {
				if (!("typeRef" in member)) {
					throw new Error(
						`${definition.name} has a variant where a field belongs.`,
					);
				}
				const resolved = resolveTypeArgument(member.typeRef, effective);
				const memberSize = blittableSize(resolved, schema, effective);
				if (memberSize === null) {
					throw new Error(
						`${definition.name}.${member.name} has no fixed width.`,
					);
				}
				const memberOffset = alignUp(
					offset,
					alignmentOf(resolved, schema, effective),
				);
				while (block.length < memberOffset) block.u8(0);
				const field = object[member.name] ?? null;
				writeValue(blockContext, resolved, field, effective);
				offset = memberOffset + memberSize;
			}
			while (block.length < size) block.u8(0);
			writer.raw(block.finish());
			return;
		}
	}
	writeRecordFields(
		context,
		definition,
		effective,
		isJsonObject(value) ? value : {},
	);
};

/** The tag payload for a tagged value: a string's length, an array's first extent. */
const tagPayloadFor = (
	context: WriteContext,
	ref: TypeRef,
	value: JsonValue,
): number => {
	if (ref.kind === "primitive" && ref.wellKnown === TYPE_STRING) {
		return new TextEncoder().encode(asText(value, "STRING")).length;
	}
	if (ref.kind === "array" && Array.isArray(value)) {
		return arrayExtents(context, ref.rank, value.length)[0] ?? 0;
	}
	// A class instance, or a forward reference that resolved to one of the two
	// above, carries no length: the payload is unused and written as zero.
	return 0;
};

const writeNode = (
	context: WriteContext,
	ref: TypeRef,
	value: JsonValue,
	typeArgs: readonly TypeRef[] | undefined,
): void => {
	const { writer, schema } = context;
	const resolved = resolveTypeArgument(ref, typeArgs);
	if (!needsTag(resolved, schema)) {
		writeValue(context, resolved, value, typeArgs);
		return;
	}
	if (value === null) {
		writer.sevenBit(0);
		return;
	}
	// A value the file already wrote is written again as a reference to it.
	//
	// The lookup is the game's own rule, not a heuristic: its writer keeps a
	// table of everything it has written and consults it before every value, so
	// walking the document in the same order reaches the same decisions. For an
	// object the table is keyed by reference, and the reader hands back the very
	// same instance for a back-reference, so identity in the document is the
	// record. For a primitive it is keyed by value, and the biggest real save
	// leans on that: 16 371 of its back-references are strings, every one of them
	// a Steam ID or a name written once and referred to everywhere after. A table
	// of paths would be a megabyte of side data to say what the map already says.
	const slot = context.backrefs.get(value);
	if (slot !== undefined) {
		writer.sevenBit(1 | (slot << 2));
		return;
	}
	// A runtime type override: the tag says which type the value really is,
	// rather than the one its field declared, and the type follows the tag. The
	// reader turns it into a `$type`/`$value` pair, and this puts it back.
	if (
		isJsonObject(value) &&
		typeof value.$type === "string" &&
		"$value" in value
	) {
		const runtimeType = parseTypeRefText(value.$type, schema);
		writer.sevenBit(3);
		writeTypeRef(writer, runtimeType);
		writeNode(context, runtimeType, value.$value, typeArgs);
		return;
	}
	const register = context.registered.has(pathKey(context.path));
	const payload = tagPayloadFor(context, resolved, value);
	writer.sevenBit(2 | (register ? 4 : 0) | (payload << 3));
	writeValue(context, resolved, value, typeArgs);
	if (register) {
		// Registered after the value is written, so anything nested inside it
		// already holds the lower slot — the order the reader sees.
		context.backrefs.set(value, context.nextSlot);
		context.nextSlot += 1;
	}
};

// ---------------------------------------------------------------------------
// One document
// ---------------------------------------------------------------------------

/**
 * Reads one document, checksum and all.
 *
 * The checksum covers the schema and the content as one contiguous run, which
 * is how they sit in the file, so it is hashed in place rather than over a
 * copy. It is checked *before* the content is walked: a damaged file should be
 * refused in a millisecond rather than turned into a plausible tree first.
 */
export const readDocument = (
	reader: CerimalReader,
	stream: Uint8Array,
): DecodedDocument => {
	const version = reader.u8("a document's version");
	if (version !== 2 && version !== 3) {
		throw new Error(
			`This CERIMAL document declares version ${version}; this editor reads versions 2 and 3.`,
		);
	}
	const schemaSize = reader.u32("a document's schema size");
	const contentSize = reader.u32("a document's content size");
	const compression = version <= 2 ? 0 : reader.u32("a document's compression");
	if (compression !== 0) {
		throw new Error(
			"This document is compressed with Zstandard, which a browser cannot read without the game's dictionary.",
		);
	}
	const checksum = reader.u64("a document's checksum");
	const bodyStart = reader.position;
	const schemaBytes = reader.borrow(schemaSize, "a document's schema");
	const bodyEnd = reader.position + contentSize;
	const actual = xxHash64(stream.subarray(bodyStart, bodyEnd));
	if (actual !== checksum) {
		throw new Error(
			`This document is damaged: it declares the checksum ${hex64(
				checksum,
			)} and its schema and content hash to ${hex64(actual)}.`,
		);
	}
	reader.seek(bodyEnd);

	const schema = readSchema(schemaBytes);
	const content = new CerimalReader(
		stream.subarray(bodyEnd - contentSize, bodyEnd),
	);
	const context: ReadContext = {
		reader: content,
		schema,
		backrefs: [],
		registered: [],
		dimensions: [],
		path: [],
	};
	// The content opens with the size of its back-reference table and the slot
	// each registration will occupy. The slots are counted, not listed, by the
	// writer this format ships with: they run 0, 1, 2 … in the order the
	// registrations are written.
	const slotCount = content.sevenBit("the back-reference table's size");
	for (let slot = 0; slot < slotCount; slot += 1) {
		const declared = content.sevenBit("a back-reference slot");
		if (declared !== slot) {
			throw new Error(
				`This document numbers its shared values ${declared} where ${slot} was expected, so this editor cannot rebuild it byte for byte.`,
			);
		}
	}
	const data = readNode(context, schema.rootTypeRef, undefined);
	if (content.remaining !== 0) {
		throw new Error(
			`This document's content has ${content.remaining} unread byte(s) after its data, so it is not what its schema describes.`,
		);
	}
	if (context.registered.length !== slotCount) {
		throw new Error(
			`This document declares ${slotCount} shared values and registers ${context.registered.length}, so this editor cannot rebuild it byte for byte.`,
		);
	}
	return {
		header: { version, compression, checksum, schemaSize, contentSize },
		rootType: formatTypeRef(schema.rootTypeRef, schema),
		data,
		registered: context.registered,
		dimensions: context.dimensions,
		schema,
		schemaBytes,
	};
};

/** Writes one document, checksum included, into `out` at its current position. */
export const writeDocument = (
	out: CerimalWriter,
	view: CerimalDocumentView,
): void => {
	const schema = readSchema(base64Decode(view.schema));
	const registered = view.registered.map(pathKey);
	const context: WriteContext = {
		writer: out,
		schema,
		backrefs: new Map<JsonValue, number>(),
		registered: new Set(registered),
		dimensions: new Map(
			view.dimensions.map(([path, extents]) => [pathKey(path), extents]),
		),
		path: [],
		nextSlot: 0,
	};

	out.raw(new TextEncoder().encode(MAGIC));
	out.u8(view.version);
	const schemaSizeAt = out.length;
	out.u32(0);
	const contentSizeAt = out.length;
	out.u32(0);
	if (view.version > 2) out.u32(view.compression);
	const checksumAt = out.length;
	out.u64(0n);

	const bodyStart = out.length;
	writeSchema(out, schema);
	const contentStart = out.length;
	out.sevenBit(registered.length);
	for (let slot = 0; slot < registered.length; slot += 1) out.sevenBit(slot);
	writeNode(context, schema.rootTypeRef, view.data, undefined);
	const bodyEnd = out.length;

	out.patchU32(schemaSizeAt, contentStart - bodyStart);
	out.patchU32(contentSizeAt, bodyEnd - contentStart);
	out.patchU64(checksumAt, xxHash64(out.writtenFrom(bodyStart)));
};
