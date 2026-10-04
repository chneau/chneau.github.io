/**
 * The Unreal property-tag stream — one codec for both levels of a *Deadly Days:
 * Roadtrip* save.
 *
 * ## Why this module exists twice over
 *
 * A Roadtrip save is a GVAS container whose `SaveDataMap` is a map of names to
 * opaque byte blobs. Each blob is *itself* a property-tag stream with a
 * one-byte version prefix. So the same "read a tag, read its value" code runs at
 * the outer level and, recursively, at every level inside a blob. The reference
 * implementation this was ported from hand-wrote the inner half only and
 * delegated the container to the `uesave` CLI; the container is hand-written
 * here too, in `gvas.ts`, and this module is what both halves share.
 *
 * ## Byte order
 *
 * The shared `ByteReader`/`ByteWriter` in `shared/save/bytes.ts` are big-endian
 * ("Unreal's default archive order"). A save *on disk* is not: `FMemoryWriter`
 * writes in the platform's order and every shipping target is x86-64, so a
 * `SaveSlot_DDR_0.sav` is little-endian throughout. `UnrealReader` and
 * `UnrealWriter` below are the shared primitives with every multi-byte access
 * byte-swapped, so the bounds checking, the error messages and the growing
 * buffer are written once and the byte order is stated once.
 *
 * ## Layout, as measured rather than as assumed
 *
 * A tag is:
 *
 *     FString name          the property name
 *     FString type          "IntProperty", "MapProperty", …
 *     int32   arrayIndex    UE's FPropertyTag::ArrayIndex
 *     int32   size          see below
 *     …      value          depends entirely on the type
 *
 * `size` means two different things, and which one is not negotiable:
 *
 * - For `EnumProperty`, `StructProperty`, `MapProperty` and `ArrayProperty` it
 *   is the byte length of the *inner type name* that immediately follows —
 *   `size` bytes of NUL-terminated Latin-1, e.g. `"StrProperty\0"` for a map
 *   keyed by string.
 * - For everything else it is the byte length of the value payload, *excluding*
 *   the one-byte `hasGuid` flag and the 16 GUID bytes that precede most scalar
 *   values.
 *
 * Both are recomputed on the way out rather than carried in the document. The
 * reference implementation stored them, which is fine until a change alters how
 * much a structure holds — and altering that is the whole point of an editor,
 * whether a quick change does it or a hand does it in the inspector. A stored
 * length is a length that can go stale, and a stale one is a file the engine
 * refuses.
 *
 * The one measured oddity: an `ArrayProperty` writes `int32 bodySize`, then
 * `uint8 hasElementGuid`, then `int32 count` — there is *no* `hasGuid` byte in
 * front of `bodySize`, unlike every scalar type. The reference implementation
 * tried both readings and picked between them per array by guessing which
 * produced a plausible count; feeding it the real `PersistedData` array, the
 * other reading takes the low byte of `bodySize` (333) as a flag and then reads
 * 301 989 888 elements. There is one reading, and it is the one here.
 */

/* -------------------------------------------------------------------------- */
/* A little-endian Unreal archive over the shared primitives                   */
/* -------------------------------------------------------------------------- */

import {
	ByteReader,
	ByteWriter,
	fromHex,
	isJsonObject,
	type JsonValue,
	requireArrayAt,
	requireNumberAt,
	requireStringAt,
	toHex,
	utf16leBytes,
} from "../../shared";

/**
 * Whether a string has to be stored as UTF-16.
 *
 * Unreal decides on the *encoded* value, not on "is this printable": anything
 * below U+0080 is written as a single ANSI byte even when it is a tab or a
 * newline, and this game's saves are full of embedded `\r\n\t` JSON. Testing for
 * "not printable ASCII" instead would re-encode those as UTF-16 and change the
 * bytes of an untouched save. Written as a loop rather than a regular
 * expression so the rule is a comparison against 0x7f and nothing else.
 */
const needsUtf16 = (value: string): boolean => {
	for (let index = 0; index < value.length; index += 1) {
		if (value.charCodeAt(index) > 0x7f) return true;
	}
	return false;
};

/**
 * Reads a `FMemoryWriter` archive.
 *
 * The shared reader is already little-endian, which is what Unreal uses, so
 * this class overrides only the one genuinely Unreal-specific rule: the
 * terminator byte is *stored* even though the declared length excludes it.
 */
export class UnrealReader extends ByteReader {
	override fString(what = "FString"): string {
		const field = this.i32(`${what} length`);
		// A zero length is Unreal's spelling of the empty string: no terminator
		// byte is stored at all, and writing a `1` here instead is a four-byte
		// difference in an otherwise untouched save.
		if (field === 0) return "";
		const utf16 = field < 0;
		const chars = (utf16 ? -field : field) - 1;
		if (chars < 0) return "";
		// The declared count excludes the terminator, but the terminator is on
		// disk, so the bytes read are one unit wider than the text kept.
		const stored = utf16 ? (chars + 1) * 2 : chars + 1;
		const bytes = this.raw(stored, what);
		return new TextDecoder(utf16 ? "utf-16le" : "utf-8").decode(
			bytes.subarray(0, utf16 ? chars * 2 : chars),
		);
	}
}

/**
 * The mirror of `UnrealReader`.
 *
 * No byte swapping: the shared writer is little-endian, as Unreal is. What
 * remains here is the 64-bit and float paths, because `setBigInt64` and
 * `setFloat*` want their argument in host order while the surrounding word
 * writes are already on disk in the order the format uses.
 */
export class UnrealWriter extends ByteWriter {
	override i64(value: bigint): this {
		// Written as two 32-bit halves so no 64-bit byte juggling is needed:
		// the low word is first on disk.
		const word = BigInt.asUintN(64, value);
		this.u32(Number(word & 0xffffffffn));
		return this.u32(Number((word >> 32n) & 0xffffffffn));
	}

	override fString(value: string): this {
		if (value === "") return this.i32(0);
		if (needsUtf16(value)) {
			this.i32(-(value.length + 1));
			this.raw(utf16leBytes(value));
			return this.raw(utf16leBytes("\u0000"));
		}
		this.i32(value.length + 1);
		this.raw(new TextEncoder().encode(value));
		return this.u8(0);
	}
}

/* -------------------------------------------------------------------------- */
/* Hex, for the byte runs this codec keeps verbatim                            */
/* -------------------------------------------------------------------------- */

// `toHex`/`fromHex` are the shared ones (`shared/save/bytes.ts`), so this codec
// no longer keeps its own copy. `fromHex` validates — an odd-length or
// non-hex string is refused rather than silently truncated to `NaN` bytes.

/* -------------------------------------------------------------------------- */
/* GUIDs                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A 16-byte Unreal GUID, written the way `uesave` and Unreal's own `ToString`
 * group it: `9c54d522-a826-4fbe-9421-074661b482d0`.
 *
 * The 32 hex digits are the file's bytes read as four *little-endian* 32-bit
 * words, in order. That is the whole of the permutation, and it was measured
 * rather than recalled: writing the id `00010203-0405-0607-0809-0a0b0c0d0e0f`
 * through `uesave from-json` produces the bytes `03 02 01 00 07 06 05 04 0b
 * 0a 09 08 0f 0e 0d 0c`. The custom-version table is the only place a save
 * carries GUIDs, and it has to survive a round trip or the game will not
 * recognise the package it is loading.
 */
export type Guid = string;

const GUID_HEX = 32;

const stripDashes = (guid: Guid): string => guid.replace(/-/g, "");

export const readGuid = (reader: UnrealReader, what = "GUID"): Guid => {
	const words = [0, 1, 2, 3].map((word) =>
		reader.u32(`${what} word ${word}`).toString(16).padStart(8, "0"),
	);
	const hex = words.join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
		16,
		20,
	)}-${hex.slice(20)}`;
};

export const writeGuid = (
	writer: UnrealWriter,
	guid: Guid,
	what = "GUID",
): void => {
	const hex = stripDashes(guid);
	if (hex.length !== GUID_HEX || !/^[0-9a-fA-F]+$/.test(hex)) {
		throw new Error(`${what} "${guid}" is not 32 hex digits.`);
	}
	for (let word = 0; word < 4; word += 1) {
		writer.u32(Number.parseInt(hex.slice(word * 8, word * 8 + 8), 16));
	}
};

/* -------------------------------------------------------------------------- */
/* The value model                                                             */
/* -------------------------------------------------------------------------- */

/** An asset reference: the FSoftObjectPath triple Unreal stores. */
type SoftObject = {
	readonly path: string;
	readonly subPath: string;
	readonly instanceIndex: number;
};

type BoolValue = {
	readonly type: "BoolProperty";
	readonly value: number;
};

type ByteValue = {
	readonly type: "ByteProperty";
	readonly value: number;
};

type IntValue = {
	readonly type: "IntProperty";
	readonly value: number;
	readonly guid: Guid | null;
};

/**
 * 64-bit integers travel as decimal strings.
 *
 * They are millisecond timestamps and there is no `bigint` in JSON, and a
 * `number` would quietly lose precision above 2^53 — which is inside the range
 * a 64-bit field can legitimately hold. A string is the honest carrier and it
 * round-trips exactly.
 */
type Int64Value = {
	readonly type: "Int64Property";
	readonly value: string;
	readonly guid: Guid | null;
};

type FloatValue = {
	readonly type: "FloatProperty";
	readonly value: number;
	readonly guid: Guid | null;
};

type DoubleValue = {
	readonly type: "DoubleProperty";
	readonly value: number;
	readonly guid: Guid | null;
};

type StrValue = {
	readonly type: "StrProperty";
	readonly value: string;
	readonly guid: Guid | null;
};

type NameValue = {
	readonly type: "NameProperty";
	readonly value: string;
	readonly guid: Guid | null;
};

type SoftObjectValue = {
	readonly type: "SoftObjectProperty";
	readonly target: SoftObject;
	readonly guid: Guid | null;
};

/**
 * A property type this codec does not model.
 *
 * The payload is kept as raw bytes and written back untouched, which is lossless
 * for any type whose payload length is the tag's `size` — which is every type
 * that is not enum, struct, map or array. A type in that last group would need
 * to be parsed to be skipped, and a codec that cannot parse it says so rather
 * than guessing.
 */
type OpaqueValue = {
	readonly type: "OpaqueProperty";
	readonly declaredType: string;
	readonly hex: string;
	readonly guid: Guid | null;
};

type EnumValue = {
	readonly type: "EnumProperty";
	readonly enumType: string;
	readonly enumTypeIndex: number;
	readonly packageName: string;
	readonly packageNameIndex: number;
	readonly underlyingType: string;
	readonly underlyingTypeIndex: number;
	/**
	 * `null` for the "None" enum, which stores a bare byte rather than a name —
	 * UE uses it for the `TEnumAsByte` of a `UENUM` with no names loaded.
	 */
	readonly name: string | null;
	readonly value: number;
	readonly guid: Guid | null;
};

/**
 * A struct body: three physical encodings and one of them is a whole list.
 *
 * The list is carried whole, terminator and trailing bytes included, rather
 * than as a bare array of tags. Every level of a save nests lists inside lists,
 * and dropping the framing at any one of them means an untouched save no longer
 * re-encodes to the same bytes — which is the one property these tools are
 * built to keep.
 */
type StructFields =
	| { readonly kind: "ticks"; readonly ticks: string }
	| {
			/**
			 * A raw `FGuid`, and the byte the engine writes in front of it.
			 *
			 * `MetaUpgrades` holds one of these per upgrade. The bytes are
			 * `int32 16`, `uint8 0`, `uint8 0x08`, then the sixteen GUID bytes —
			 * and the reference implementation's list of stat GUIDs
			 * (`66a6656c1c94b54ab616a2304ff5d0dc` and eleven more) is the
			 * sixteen bytes *after* the `0x08`, which is what settles where the
			 * GUID starts. The byte is preserved verbatim; what it means is not
			 * established here, and nothing in this codec depends on knowing.
			 */
			readonly kind: "guid";
			readonly prefix: number;
			readonly guid: Guid;
	  }
	| { readonly kind: "properties"; readonly list: PropertyList };

type StructValue = {
	readonly type: "StructProperty";
	readonly structType: string;
	readonly structTypeIndex: number;
	readonly packageName: string;
	readonly packageNameIndex: number;
	readonly guid: Guid | null;
	readonly fields: StructFields;
};

/** One key or one value inside a map, keyed on its own physical shape. */
type MapElement =
	| { readonly kind: "string"; readonly value: string }
	| { readonly kind: "int"; readonly value: number }
	| { readonly kind: "int64"; readonly value: string }
	| { readonly kind: "float"; readonly value: number }
	| { readonly kind: "softObject"; readonly target: SoftObject }
	| { readonly kind: "struct"; readonly list: PropertyList };

type MapEntry = { readonly key: MapElement; readonly value: MapElement };

/** The `StructProperty` name pair that a map key or value of that type carries. */
type StructRef = {
	readonly structType: string;
	readonly structTypeIndex: number;
	readonly packageName: string;
	readonly packageNameIndex: number;
};

type MapValue = {
	readonly type: "MapProperty";
	readonly keyType: string;
	readonly keyTypeIndex: number;
	readonly keyStruct: StructRef | null;
	readonly valueType: string;
	readonly valueTypeIndex: number;
	readonly valueStruct: StructRef | null;
	readonly guid: Guid | null;
	readonly keysToRemove: number;
	readonly entries: readonly MapEntry[];
};

/**
 * One element of an array.
 *
 * `blob` is the interesting one: a `TArray<uint8>` in this game is not an
 * opaque byte run, it is a *nested property list* with its own version byte. See
 * `readArray` for why it is decoded rather than left as numbers.
 */
type ArrayItem =
	| { readonly kind: "byte"; readonly value: number }
	| { readonly kind: "int"; readonly value: number }
	| { readonly kind: "string"; readonly value: string }
	| { readonly kind: "softObject"; readonly target: SoftObject }
	| { readonly kind: "struct"; readonly list: PropertyList }
	| { readonly kind: "blob"; readonly value: PropertyBlob };

/** A `TArray<uint8>` that is really a property list, with its own framing. */
type PropertyBlob = {
	readonly version: number;
	readonly properties: readonly PropertyTag[];
	readonly trailing: string;
};

type ArrayValue = {
	readonly type: "ArrayProperty";
	readonly itemType: string;
	readonly itemTypeIndex: number;
	/** Present only when `itemType` is a struct: its name and owning package. */
	readonly struct: StructRef | null;
	readonly elementGuid: Guid | null;
	readonly items: readonly ArrayItem[];
};

type PropertyValue =
	| BoolValue
	| ByteValue
	| IntValue
	| Int64Value
	| FloatValue
	| DoubleValue
	| StrValue
	| NameValue
	| SoftObjectValue
	| OpaqueValue
	| EnumValue
	| StructValue
	| MapValue
	| ArrayValue;

/**
 * One tagged property.
 *
 * The wire type name is not stored separately: it is exactly the `type`
 * discriminant of `value` (or, for an unmodelled type, its `declaredType`), and
 * carrying it twice would let a hand-edited document claim one type and encode
 * another.
 */
type PropertyTag = {
	readonly name: string;
	readonly arrayIndex: number;
	readonly value: PropertyValue;
};

/**
 * A property list, and the bytes that follow its closing `"None"`.
 *
 * A list is closed by the name `"None"` and nothing else. What follows it is not
 * part of the list: four zero bytes at the end of a byte blob, the next map key
 * after a struct. The reference implementation read an `int32` there and it
 * happens to be zero often enough to pass unnoticed — but the second save entry
 * in `SaveSlot_DDR_0.sav` shows the case that breaks it, with `"None"` at
 * offset 2 293 and the next entry's name starting at 2 302 with no room for an
 * `int32` between them. So the run is carried as `trailing` and written back
 * unchanged, which is exact whatever it contains.
 */
export type PropertyList = {
	readonly properties: readonly PropertyTag[];
	readonly trailing: string;
};

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/** The name the game gives an `ArrayProperty` whose elements are bytes. */
const BYTE_ARRAY_ITEM_TYPE = "ByteProperty";

/**
 * Refuses a count no buffer could satisfy.
 *
 * A `uint8` element is the smallest an array element can be, so a count larger
 * than the bytes remaining is a corrupt or hostile length; without this a
 * truncated save would spin through four billion iterations before the bounds
 * check fired. The same argument rejects a negative count.
 */
const readCount = (reader: UnrealReader, what: string): number => {
	const count = reader.i32(`${what} count`);
	if (count < 0 || count > reader.remaining) {
		throw new Error(
			`Implausible ${what} count ${count} at offset ${
				reader.position - 4
			}: only ${reader.remaining} byte(s) remain.`,
		);
	}
	return count;
};

/** The `hasGuid` flag and the GUID it guards, which most scalar values carry. */
const readGuidFlag = (reader: UnrealReader, what: string): Guid | null => {
	const hasGuid = reader.u8(`${what} hasGuid`);
	if (hasGuid === 0) return null;
	if (hasGuid !== 1) {
		throw new Error(
			`${what} has a hasGuid flag of ${hasGuid} at offset ${
				reader.position - 1
			}; it must be 0 or 1.`,
		);
	}
	return readGuid(reader, `${what} guid`);
};

const writeGuidFlag = (
	writer: UnrealWriter,
	guid: Guid | null,
	what: string,
): void => {
	if (guid === null) {
		writer.u8(0);
		return;
	}
	writer.u8(1);
	writeGuid(writer, guid, `${what} guid`);
};

/** The NUL-terminated inner type name whose length is the tag's `size`. */
const readInnerType = (reader: UnrealReader, size: number): string => {
	if (size < 1) {
		throw new Error(
			`A tag claiming a ${size}-byte inner type name is not something this codec can read.`,
		);
	}
	return reader.latin1(size, "inner type name").replace(/\0+$/, "");
};

const writeInnerType = (name: string): Uint8Array =>
	new TextEncoder().encode(`${name}\u0000`);

const readStructRef = (reader: UnrealReader, what: string): StructRef => ({
	structType: reader.fString(`${what} struct type`),
	structTypeIndex: reader.i32(`${what} struct type index`),
	packageName: reader.fString(`${what} package name`),
	packageNameIndex: reader.i32(`${what} package name index`),
});

const writeStructRef = (writer: UnrealWriter, ref: StructRef): void => {
	writer.fString(ref.structType);
	writer.i32(ref.structTypeIndex);
	writer.fString(ref.packageName);
	writer.i32(ref.packageNameIndex);
};

const readSoftObject = (reader: UnrealReader): SoftObject => ({
	path: reader.fString("SoftObjectProperty path"),
	subPath: reader.fString("SoftObjectProperty sub path"),
	instanceIndex: reader.i32("SoftObjectProperty instance index"),
});

/**
 * Reads a value given only the tag's type name and size.
 *
 * One branch per Unreal property type, and the type name is the only thing that
 * says which — which is why the writer derives the same name from the value
 * rather than carrying a second copy of it.
 */
const readValueBody = (
	reader: UnrealReader,
	type: string,
	size: number,
): PropertyValue => {
	switch (type) {
		case "BoolProperty":
			return { type: "BoolProperty", value: reader.u8("BoolProperty") };
		case "ByteProperty":
			return { type: "ByteProperty", value: reader.u8("ByteProperty") };
		case "IntProperty":
			return {
				type: "IntProperty",
				guid: readGuidFlag(reader, type),
				value: reader.i32("IntProperty"),
			};
		case "Int64Property":
			return {
				type: "Int64Property",
				guid: readGuidFlag(reader, type),
				value: reader.i64("Int64Property").toString(),
			};
		case "FloatProperty":
			return {
				type: "FloatProperty",
				guid: readGuidFlag(reader, type),
				value: reader.f32("FloatProperty"),
			};
		case "DoubleProperty":
			return {
				type: "DoubleProperty",
				guid: readGuidFlag(reader, type),
				value: reader.f64("DoubleProperty"),
			};
		case "StrProperty":
			return {
				type: "StrProperty",
				guid: readGuidFlag(reader, type),
				value: reader.fString("StrProperty"),
			};
		case "NameProperty":
			return {
				type: "NameProperty",
				guid: readGuidFlag(reader, type),
				value: reader.fString("NameProperty"),
			};
		case "SoftObjectProperty": {
			const guid = readGuidFlag(reader, type);
			return {
				type: "SoftObjectProperty",
				guid,
				target: readSoftObject(reader),
			};
		}
		case "EnumProperty":
			return readEnum(reader, size);
		case "StructProperty":
			return readStruct(reader, size);
		case "MapProperty":
			return readMap(reader, size);
		case "ArrayProperty":
			return readArray(reader, size);
		default:
			return readOpaque(reader, type, size);
	}
};

const readEnum = (reader: UnrealReader, size: number): EnumValue => {
	const enumType = readInnerType(reader, size);
	const enumTypeIndex = reader.i32("EnumProperty type index");
	const packageName = reader.fString("EnumProperty package name");
	const packageNameIndex = reader.i32("EnumProperty package name index");
	const underlyingType = reader.fString("EnumProperty underlying type");
	const underlyingTypeIndex = reader.i32("EnumProperty underlying type index");
	// Present for framing fidelity only; `writeValueBody` recomputes it.
	reader.i32("EnumProperty body size");
	if (enumType === "None") {
		return {
			type: "EnumProperty",
			enumType,
			enumTypeIndex,
			packageName,
			packageNameIndex,
			underlyingType,
			underlyingTypeIndex,
			name: null,
			value: reader.u8("EnumProperty value"),
			guid: null,
		};
	}
	return {
		type: "EnumProperty",
		enumType,
		enumTypeIndex,
		packageName,
		packageNameIndex,
		underlyingType,
		underlyingTypeIndex,
		name: reader.fString("EnumProperty name"),
		value: 0,
		guid: readGuidFlag(reader, "EnumProperty value"),
	};
};

const readStruct = (reader: UnrealReader, size: number): StructValue => {
	const structType = readInnerType(reader, size);
	const structTypeIndex = reader.i32("StructProperty type index");
	const packageName = reader.fString("StructProperty package name");
	const packageNameIndex = reader.i32("StructProperty package name index");
	// Framing only; recomputed on the way out so an edited struct stays honest.
	reader.i32("StructProperty body size");
	let guid: Guid | null = null;
	let fields: StructFields;
	if (structType === "DateTime") {
		guid = readGuidFlag(reader, "StructProperty");
		fields = { kind: "ticks", ticks: reader.i64("DateTime ticks").toString() };
	} else if (structType === "Guid") {
		// A raw `FGuid` is the one struct body that is not a property list, and
		// the one that does not answer to the `hasGuid` flag: the byte in that
		// position is 8 in every one of the thirty stat identifiers
		// `MetaUpgrades` holds, so reading it as a boolean is what stops a
		// strict reader dead. It is kept and written back unchanged.
		fields = {
			kind: "guid",
			prefix: reader.u8("Guid struct prefix"),
			guid: readGuid(reader, "Guid struct"),
		};
	} else {
		guid = readGuidFlag(reader, "StructProperty");
		fields = { kind: "properties", list: readProperties(reader) };
	}
	return {
		type: "StructProperty",
		structType,
		structTypeIndex,
		packageName,
		packageNameIndex,
		guid,
		fields,
	};
};

const readMap = (reader: UnrealReader, size: number): MapValue => {
	const keyType = readInnerType(reader, size);
	const keyTypeIndex = reader.i32("MapProperty key type index");
	const keyStruct =
		keyType === "StructProperty"
			? readStructRef(reader, "MapProperty key")
			: null;
	const valueType = reader.fString("MapProperty value type");
	const valueTypeIndex = reader.i32("MapProperty value type index");
	const valueStruct =
		valueType === "StructProperty"
			? readStructRef(reader, "MapProperty value")
			: null;
	// Framing only; recomputed on the way out.
	reader.i32("MapProperty body size");
	const guid = readGuidFlag(reader, "MapProperty");
	const keysToRemove = reader.i32("MapProperty keys to remove");
	const count = readCount(reader, "MapProperty");
	const entries: MapEntry[] = [];
	for (let index = 0; index < count; index += 1) {
		entries.push({
			key: readMapElement(reader, keyType, "MapProperty key"),
			value: readMapElement(reader, valueType, "MapProperty value"),
		});
	}
	return {
		type: "MapProperty",
		keyType,
		keyTypeIndex,
		keyStruct,
		valueType,
		valueTypeIndex,
		valueStruct,
		guid,
		keysToRemove,
		entries,
	};
};

const readMapElement = (
	reader: UnrealReader,
	type: string,
	what: string,
): MapElement => {
	switch (type) {
		case "StrProperty":
		case "NameProperty":
			return { kind: "string", value: reader.fString(what) };
		case "IntProperty":
			return { kind: "int", value: reader.i32(what) };
		case "Int64Property":
			return { kind: "int64", value: reader.i64(what).toString() };
		case "FloatProperty":
			return { kind: "float", value: reader.f32(what) };
		case "SoftObjectProperty":
			return { kind: "softObject", target: readSoftObject(reader) };
		case "StructProperty":
			return { kind: "struct", list: readProperties(reader) };
		default:
			throw new Error(
				`A map of ${type} cannot be read: there is no length in the format to skip an element of, so the element type has to be one this codec models.`,
			);
	}
};

/**
 * Reads an array, and decodes a byte array into the property list it is.
 *
 * This game's `SaveData` struct holds its payload as `TArray<uint8>`, and that
 * payload is not opaque: it is a property-tag stream with a one-byte version in
 * front. Leaving it as 298 087 numbers would make the editor useless — none of
 * the fields anyone wants to change would be visible, and every quick change
 * would be a byte-pattern search. So the bytes are decoded, and then *checked*:
 * the nested list is written straight back out and compared, and it is only
 * accepted as a blob if the two are identical. A byte array that is not a
 * property list therefore stays a byte array, and the invariant the tests assert
 * — an untouched save re-encodes to the same bytes — holds either way.
 */
const readArray = (reader: UnrealReader, size: number): ArrayValue => {
	const itemType = readInnerType(reader, size);
	const itemTypeIndex = reader.i32("ArrayProperty item type index");
	const struct =
		itemType === "StructProperty"
			? readStructRef(reader, "ArrayProperty")
			: null;
	reader.i32("ArrayProperty body size");
	const elementGuid = readGuidFlag(reader, "ArrayProperty element");
	const count = readCount(reader, "ArrayProperty");
	const items =
		itemType === BYTE_ARRAY_ITEM_TYPE
			? readByteItems(reader, count)
			: readArrayItems(reader, itemType, count);
	return {
		type: "ArrayProperty",
		itemType,
		itemTypeIndex,
		struct,
		elementGuid,
		items,
	};
};

const readArrayItems = (
	reader: UnrealReader,
	itemType: string,
	count: number,
): readonly ArrayItem[] => {
	const items: ArrayItem[] = [];
	for (let index = 0; index < count; index += 1) {
		items.push(readArrayItem(reader, itemType, `ArrayProperty item ${index}`));
	}
	return items;
};

const readByteItems = (
	reader: UnrealReader,
	count: number,
): readonly ArrayItem[] => {
	const bytes = reader.raw(count, "ArrayProperty bytes");
	const blob = tryReadBlob(bytes);
	if (blob) return [{ kind: "blob", value: blob }];
	return [...bytes].map((value) => ({ kind: "byte", value }) as const);
};

const tryReadBlob = (bytes: Uint8Array): PropertyBlob | null => {
	try {
		const blob = readBlob(bytes);
		const written = writeBlob(blob);
		if (written.length !== bytes.length) return null;
		for (let index = 0; index < bytes.length; index += 1) {
			if (written[index] !== bytes[index]) return null;
		}
		return blob;
	} catch {
		// Not a property list. That is an ordinary outcome, not a failure: most
		// byte arrays in a save are data, and the caller keeps them as bytes.
		return null;
	}
};

const readArrayItem = (
	reader: UnrealReader,
	itemType: string,
	what: string,
): ArrayItem => {
	switch (itemType) {
		case "IntProperty":
			return { kind: "int", value: reader.i32(what) };
		case "Int64Property":
			// Read as a string for the same reason an Int64Property value is: a
			// `number` would not survive the trip through JSON.
			return { kind: "string", value: reader.i64(what).toString() };
		case "StrProperty":
		case "NameProperty":
			return { kind: "string", value: reader.fString(what) };
		case "SoftObjectProperty":
			return { kind: "softObject", target: readSoftObject(reader) };
		case "StructProperty":
			return { kind: "struct", list: readProperties(reader) };
		default:
			throw new Error(
				`An array of ${itemType} cannot be read: as with map elements, the format carries no length to skip an element of.`,
			);
	}
};

const readOpaque = (
	reader: UnrealReader,
	type: string,
	size: number,
): OpaqueValue => {
	const guid = readGuidFlag(reader, type);
	return {
		type: "OpaqueProperty",
		declaredType: type,
		guid,
		hex: toHex(reader.raw(size, type)),
	};
};

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

const writeSoftObject = (writer: UnrealWriter, target: SoftObject): void => {
	writer.fString(target.path);
	writer.fString(target.subPath);
	writer.i32(target.instanceIndex);
};

const writeMapElement = (
	writer: UnrealWriter,
	element: MapElement,
	what: string,
): void => {
	switch (element.kind) {
		case "string":
			writer.fString(element.value);
			return;
		case "int":
			writer.i32(element.value);
			return;
		case "int64":
			writer.i64(BigInt(element.value));
			return;
		case "float":
			writer.f32(element.value);
			return;
		case "softObject":
			writeSoftObject(writer, element.target);
			return;
		case "struct":
			writePropertiesList(writer, element.list);
			return;
		default:
			throw new Error(`${what} has an element kind this codec cannot write.`);
	}
};

const writeArrayItem = (
	writer: UnrealWriter,
	item: ArrayItem,
	what: string,
): void => {
	switch (item.kind) {
		case "byte":
			writer.u8(item.value);
			return;
		case "int":
			writer.i32(item.value);
			return;
		case "string":
			writer.fString(item.value);
			return;
		case "softObject":
			writeSoftObject(writer, item.target);
			return;
		case "struct":
			writePropertiesList(writer, item.list);
			return;
		case "blob":
			writer.raw(writeBlob(item.value));
			return;
		default:
			throw new Error(`${what} has an item kind this codec cannot write.`);
	}
};

/**
 * The wire type name for a value, which is also the second FString of its tag.
 *
 * A single source of truth, so the tag can never disagree with the value it
 * introduces.
 */
const wireTypeOf = (value: PropertyValue): string =>
	value.type === "OpaqueProperty" ? value.declaredType : value.type;

/** The inner type name whose length fills the tag's `size` field. */
const innerTypeOf = (value: PropertyValue): string | null => {
	switch (value.type) {
		case "EnumProperty":
			return value.enumType;
		case "StructProperty":
			return value.structType;
		case "MapProperty":
			return value.keyType;
		case "ArrayProperty":
			return value.itemType;
		default:
			return null;
	}
};

/**
 * Everything after the tag's `size` field, with the body sizes already right.
 *
 * The `bodySize` an enum, struct, map or array writes counts its content and
 * *excludes* the `hasGuid` byte and the GUID behind it — the same exclusion the
 * tag's `size` makes. It was one byte out on every one of them until it was
 * measured: `SaveDataMap`'s own body size in the committed save is 346 728, and
 * the value that follows its `hasGuid` byte is 346 729 bytes long.
 */
const writeValueBody = (writer: UnrealWriter, value: PropertyValue): void => {
	switch (value.type) {
		case "BoolProperty":
		case "ByteProperty":
			writer.u8(value.value);
			return;
		case "IntProperty":
			writeGuidFlag(writer, value.guid, value.type);
			writer.i32(value.value);
			return;
		case "Int64Property":
			writeGuidFlag(writer, value.guid, value.type);
			writer.i64(BigInt(value.value));
			return;
		case "FloatProperty":
			writeGuidFlag(writer, value.guid, value.type);
			writer.f32(value.value);
			return;
		case "DoubleProperty":
			writeGuidFlag(writer, value.guid, value.type);
			writer.f64(value.value);
			return;
		case "StrProperty":
		case "NameProperty":
			writeGuidFlag(writer, value.guid, value.type);
			writer.fString(value.value);
			return;
		case "SoftObjectProperty":
			writeGuidFlag(writer, value.guid, value.type);
			writeSoftObject(writer, value.target);
			return;
		case "OpaqueProperty":
			writeGuidFlag(writer, value.guid, value.declaredType);
			writer.raw(fromHex(value.hex, value.declaredType));
			return;
		case "EnumProperty": {
			writer.i32(value.enumTypeIndex);
			writer.fString(value.packageName);
			writer.i32(value.packageNameIndex);
			writer.fString(value.underlyingType);
			writer.i32(value.underlyingTypeIndex);
			const body = new UnrealWriter();
			if (value.name === null) body.u8(value.value);
			else body.fString(value.name);
			writer.i32(body.length);
			writeGuidFlag(writer, value.guid, "EnumProperty value");
			writer.raw(body.finish());
			return;
		}
		case "StructProperty": {
			writer.i32(value.structTypeIndex);
			writer.fString(value.packageName);
			writer.i32(value.packageNameIndex);
			const body = new UnrealWriter();
			writeStructFields(body, value.fields);
			writer.i32(structBodySize(value.fields, body.length));
			// A raw `FGuid` carries its own leading byte inside the body, so the
			// `hasGuid` slot is left empty rather than written a second time.
			if (value.fields.kind !== "guid") {
				writeGuidFlag(writer, value.guid, value.structType);
			}
			writer.raw(body.finish());
			return;
		}
		case "MapProperty": {
			writer.i32(value.keyTypeIndex);
			if (value.keyStruct) writeStructRef(writer, value.keyStruct);
			writer.fString(value.valueType);
			writer.i32(value.valueTypeIndex);
			if (value.valueStruct) {
				writeStructRef(writer, value.valueStruct);
			}
			const body = new UnrealWriter();
			body.i32(value.keysToRemove);
			body.i32(value.entries.length);
			for (const [index, entry] of value.entries.entries()) {
				writeMapElement(body, entry.key, `MapProperty key ${index}`);
				writeMapElement(body, entry.value, `MapProperty value ${index}`);
			}
			writer.i32(body.length);
			writeGuidFlag(writer, value.guid, "MapProperty");
			writer.raw(body.finish());
			return;
		}
		case "ArrayProperty": {
			writer.i32(value.itemTypeIndex);
			if (value.struct) writeStructRef(writer, value.struct);
			const elements = new UnrealWriter();
			for (const [index, item] of value.items.entries()) {
				writeArrayItem(elements, item, `ArrayProperty item ${index}`);
			}
			// The count is the number of *elements on the wire*, and a decoded
			// byte blob is many: the game wrote 215 for a 215-byte payload and
			// this document holds that payload as one decoded property list.
			const count =
				value.itemType === BYTE_ARRAY_ITEM_TYPE
					? elements.length
					: value.items.length;
			const body = new UnrealWriter();
			body.i32(count);
			body.raw(elements.finish());
			writer.i32(body.length);
			writeGuidFlag(writer, value.elementGuid, "ArrayProperty element");
			writer.raw(body.finish());
			return;
		}
		default:
			throw new Error("A property value kind this codec cannot write.");
	}
};

/**
 * The length a struct claims in its `bodySize` field.
 *
 * It is the length of the body for every kind except a raw `FGuid`, where the
 * engine writes one byte more than it claims: `MetaUpgrades` records `16` and
 * then writes seventeen. Sixteen is what the committed save says in all
 * thirty-odd of them, so sixteen is what is written — not because the shorter
 * number is known to be the correct one, but because it is the one observed, and
 * a value this codec has never seen the engine produce is not a value to
 * improve on.
 */
const structBodySize = (fields: StructFields, written: number): number =>
	fields.kind === "guid" ? written - 1 : written;

const writeStructFields = (
	writer: UnrealWriter,
	fields: StructFields,
): void => {
	switch (fields.kind) {
		case "ticks":
			writer.i64(BigInt(fields.ticks));
			return;
		case "guid":
			writer.u8(fields.prefix);
			writeGuid(writer, fields.guid, "Guid struct");
			return;
		case "properties":
			writePropertiesList(writer, fields.list);
			return;
		default:
			throw new Error("A struct body kind this codec cannot write.");
	}
};

/**
 * How many bytes a value spends on its `hasGuid` flag and the GUID behind it.
 *
 * The tag's `size` excludes them, which is why it has to be subtracted rather
 * than measured: it is the one length in the format that is not derivable from
 * a contiguous run of the value.
 */
const guidSpanOf = (value: PropertyValue): number => {
	switch (value.type) {
		case "IntProperty":
		case "Int64Property":
		case "FloatProperty":
		case "DoubleProperty":
		case "StrProperty":
		case "NameProperty":
			return value.guid === null ? 1 : 17;
		case "SoftObjectProperty":
		case "OpaqueProperty":
			return value.guid === null ? 1 : 17;
		default:
			return 0;
	}
};

const writeProperty = (writer: UnrealWriter, tag: PropertyTag): void => {
	writer.fString(tag.name);
	writer.fString(wireTypeOf(tag.value));
	writer.i32(tag.arrayIndex);
	// The value is serialised first because the `size` field precedes it and
	// both meanings of `size` are derived from its length.
	const body = new UnrealWriter();
	writeValueBody(body, tag.value);
	const inner = innerTypeOf(tag.value);
	const size =
		inner !== null
			? writeInnerType(inner).length
			: tag.value.type === "BoolProperty"
				? 0
				: body.length - guidSpanOf(tag.value);
	writer.i32(size);
	// The inner type name sits between the `size` field and the body, and its
	// length is what `size` counted. It is derived from the value rather than
	// stored, for the same reason the wire type is: two copies of one fact is
	// one copy too many.
	if (inner !== null) writer.raw(writeInnerType(inner));
	writer.raw(body.finish());
};

/* -------------------------------------------------------------------------- */
/* Lists                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Reads properties until the closing `"None"`, and the int32 that closes it.
 *
 * Nested lists use this and nothing more. Only a list that owns the rest of its
 * buffer — the container, and a decoded byte blob — may claim a `trailing` run,
 * because claiming it means consuming the reader to the end, and a struct body
 * is followed by the struct's next field.
 */
const readList = (reader: UnrealReader): readonly PropertyTag[] => {
	const properties: PropertyTag[] = [];
	for (;;) {
		const name = reader.fString("property name");
		if (name === "None" || name === "") return properties;
		const type = reader.fString("property type");
		const arrayIndex = reader.i32("property array index");
		const size = reader.i32("property size");
		properties.push({
			name,
			arrayIndex,
			value: readValueBody(reader, type, size),
		});
	}
};

/** A nested list: its properties, and nothing after its closing `"None"`. */
const readProperties = (reader: UnrealReader): PropertyList => ({
	properties: readList(reader),
	trailing: "",
});

/** A list that owns the rest of its buffer, trailing bytes and all. */
export const readTerminalList = (reader: UnrealReader): PropertyList => ({
	properties: readList(reader),
	trailing: toHex(reader.raw(reader.remaining, "trailing bytes")),
});

export const writePropertiesList = (
	writer: UnrealWriter,
	list: PropertyList,
): void => {
	for (const tag of list.properties) writeProperty(writer, tag);
	writer.fString("None");
	writer.raw(fromHex(list.trailing, "trailing bytes"));
};

const readBlob = (bytes: Uint8Array): PropertyBlob => {
	const reader = new UnrealReader(bytes);
	const version = reader.u8("blob version");
	const list = readTerminalList(reader);
	return { version, properties: list.properties, trailing: list.trailing };
};

const writeBlob = (blob: PropertyBlob): Uint8Array => {
	const writer = new UnrealWriter();
	writer.u8(blob.version);
	writePropertiesList(writer, {
		properties: blob.properties,
		trailing: blob.trailing,
	});
	return writer.finish();
};

/* -------------------------------------------------------------------------- */
/* Document ⇄ value                                                            */
/* -------------------------------------------------------------------------- */

const field = (value: JsonValue, key: string): JsonValue => {
	const found = isJsonObject(value) ? value[key] : undefined;
	if (found === undefined) {
		throw new Error(`A property value is missing "${key}".`);
	}
	return found;
};

const nullableStringField = (value: JsonValue, key: string): string | null => {
	const found = field(value, key);
	if (found === null) return null;
	if (typeof found !== "string") {
		throw new Error(`"${key}" must be a string or null.`);
	}
	return found;
};

const guidField = (value: JsonValue, key: string): Guid | null =>
	nullableStringField(value, key);

const softObjectOf = (value: JsonValue): SoftObject => ({
	path: requireStringAt(value, "path"),
	subPath: requireStringAt(value, "subPath"),
	instanceIndex: requireNumberAt(value, "instanceIndex"),
});

const structRefOf = (value: JsonValue): StructRef => ({
	structType: requireStringAt(value, "structType"),
	structTypeIndex: requireNumberAt(value, "structTypeIndex"),
	packageName: requireStringAt(value, "packageName"),
	packageNameIndex: requireNumberAt(value, "packageNameIndex"),
});

/** A `StructRef` slot, which is `null` when the type is not a struct. */
const nullableStructRefOf = (
	value: JsonValue,
	key: string,
): StructRef | null => {
	const found = field(value, key);
	return found === null ? null : structRefOf(found);
};

const structFieldsOf = (value: JsonValue): StructFields => {
	const kind = requireStringAt(value, "kind");
	if (kind === "ticks") {
		return { kind: "ticks", ticks: requireStringAt(value, "ticks") };
	}
	if (kind === "guid") {
		return {
			kind: "guid",
			prefix: requireNumberAt(value, "prefix"),
			guid: requireStringAt(value, "guid"),
		};
	}
	if (kind === "properties") {
		return { kind: "properties", list: propertyListOf(field(value, "list")) };
	}
	throw new Error(`"${kind}" is not a struct body kind this codec knows.`);
};

const mapElementOf = (value: JsonValue): MapElement => {
	const kind = requireStringAt(value, "kind");
	switch (kind) {
		case "string":
			return { kind: "string", value: requireStringAt(value, "value") };
		case "int":
			return { kind: "int", value: requireNumberAt(value, "value") };
		case "int64":
			return { kind: "int64", value: requireStringAt(value, "value") };
		case "float":
			return { kind: "float", value: requireNumberAt(value, "value") };
		case "softObject":
			return {
				kind: "softObject",
				target: softObjectOf(field(value, "target")),
			};
		case "struct":
			return { kind: "struct", list: propertyListOf(field(value, "list")) };
		default:
			throw new Error(`"${kind}" is not a map element kind this codec knows.`);
	}
};

const arrayItemOf = (value: JsonValue): ArrayItem => {
	const kind = requireStringAt(value, "kind");
	switch (kind) {
		case "byte":
			return { kind: "byte", value: requireNumberAt(value, "value") };
		case "int":
			return { kind: "int", value: requireNumberAt(value, "value") };
		case "string":
			return { kind: "string", value: requireStringAt(value, "value") };
		case "softObject":
			return {
				kind: "softObject",
				target: softObjectOf(field(value, "target")),
			};
		case "struct":
			return { kind: "struct", list: propertyListOf(field(value, "list")) };
		case "blob":
			return { kind: "blob", value: blobOf(field(value, "value")) };
		default:
			throw new Error(`"${kind}" is not an array item kind this codec knows.`);
	}
};

const propertyListOf = (value: JsonValue): PropertyList => ({
	properties: requireArrayAt(value, "properties").map(propertyTagOf),
	trailing: requireStringAt(value, "trailing"),
});

const blobOf = (value: JsonValue): PropertyBlob => ({
	version: requireNumberAt(value, "version"),
	properties: requireArrayAt(value, "properties").map(propertyTagOf),
	trailing: requireStringAt(value, "trailing"),
});

/**
 * Turns an edited document value back into a typed one.
 *
 * The workbench hands `encode` a `JsonValue` because the inspector edits leaves
 * in place, so every field has to be checked rather than assumed. This is the
 * check, and it is deliberately a *rebuild* of the value rather than a cast of
 * it: a hand-edited document that has lost a field is a document this codec
 * refuses, with a message naming the field, not a file it writes and the game
 * rejects.
 */
const propertyValueOf = (value: JsonValue): PropertyValue => {
	const type = requireStringAt(value, "type");
	switch (type) {
		case "BoolProperty":
		case "ByteProperty":
			return { type, value: requireNumberAt(value, "value") };
		case "IntProperty":
			return {
				type,
				value: requireNumberAt(value, "value"),
				guid: guidField(value, "guid"),
			};
		case "Int64Property":
			return {
				type,
				value: requireStringAt(value, "value"),
				guid: guidField(value, "guid"),
			};
		case "FloatProperty":
		case "DoubleProperty":
			return {
				type,
				value: requireNumberAt(value, "value"),
				guid: guidField(value, "guid"),
			};
		case "StrProperty":
		case "NameProperty":
			return {
				type,
				value: requireStringAt(value, "value"),
				guid: guidField(value, "guid"),
			};
		case "SoftObjectProperty":
			return {
				type,
				guid: guidField(value, "guid"),
				target: softObjectOf(field(value, "target")),
			};
		case "OpaqueProperty":
			return {
				type,
				declaredType: requireStringAt(value, "declaredType"),
				hex: requireStringAt(value, "hex"),
				guid: guidField(value, "guid"),
			};
		case "EnumProperty": {
			const name = nullableStringField(value, "name");
			return {
				type,
				enumType: requireStringAt(value, "enumType"),
				enumTypeIndex: requireNumberAt(value, "enumTypeIndex"),
				packageName: requireStringAt(value, "packageName"),
				packageNameIndex: requireNumberAt(value, "packageNameIndex"),
				underlyingType: requireStringAt(value, "underlyingType"),
				underlyingTypeIndex: requireNumberAt(value, "underlyingTypeIndex"),
				name,
				value: requireNumberAt(value, "value"),
				guid: guidField(value, "guid"),
			};
		}
		case "StructProperty":
			return {
				type,
				structType: requireStringAt(value, "structType"),
				structTypeIndex: requireNumberAt(value, "structTypeIndex"),
				packageName: requireStringAt(value, "packageName"),
				packageNameIndex: requireNumberAt(value, "packageNameIndex"),
				guid: guidField(value, "guid"),
				fields: structFieldsOf(field(value, "fields")),
			};
		case "MapProperty":
			return {
				type,
				keyType: requireStringAt(value, "keyType"),
				keyTypeIndex: requireNumberAt(value, "keyTypeIndex"),
				keyStruct: nullableStructRefOf(value, "keyStruct"),
				valueType: requireStringAt(value, "valueType"),
				valueTypeIndex: requireNumberAt(value, "valueTypeIndex"),
				valueStruct: nullableStructRefOf(value, "valueStruct"),
				guid: guidField(value, "guid"),
				keysToRemove: requireNumberAt(value, "keysToRemove"),
				entries: requireArrayAt(value, "entries").map((entry) => ({
					key: mapElementOf(field(entry, "key")),
					value: mapElementOf(field(entry, "value")),
				})),
			};
		case "ArrayProperty":
			return {
				type,
				itemType: requireStringAt(value, "itemType"),
				itemTypeIndex: requireNumberAt(value, "itemTypeIndex"),
				struct: nullableStructRefOf(value, "struct"),
				elementGuid: guidField(value, "elementGuid"),
				items: requireArrayAt(value, "items").map(arrayItemOf),
			};
		default:
			throw new Error(`"${type}" is not a property type this codec knows.`);
	}
};

export const propertyTagOf = (value: JsonValue): PropertyTag => ({
	name: requireStringAt(value, "name"),
	arrayIndex: requireNumberAt(value, "arrayIndex"),
	value: propertyValueOf(field(value, "value")),
});
