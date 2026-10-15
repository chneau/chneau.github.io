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

const needsUtf16 = (value: string): boolean => {
	for (let index = 0; index < value.length; index += 1) {
		if (value.charCodeAt(index) > 0x7f) return true;
	}
	return false;
};

export class UnrealReader extends ByteReader {
	override fString(what = "FString"): string {
		const field = this.i32(`${what} length`);
		if (field === 0) return "";
		const utf16 = field < 0;
		const chars = (utf16 ? -field : field) - 1;
		if (chars < 0) return "";
		const stored = utf16 ? (chars + 1) * 2 : chars + 1;
		const bytes = this.raw(stored, what);
		return new TextDecoder(utf16 ? "utf-16le" : "utf-8").decode(
			bytes.subarray(0, utf16 ? chars * 2 : chars),
		);
	}
}

export class UnrealWriter extends ByteWriter {
	override i64(value: bigint): this {
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
	readonly name: string | null;
	readonly value: number;
	readonly guid: Guid | null;
};

type StructFields =
	| { readonly kind: "ticks"; readonly ticks: string }
	| {
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

type MapElement =
	| { readonly kind: "string"; readonly value: string }
	| { readonly kind: "int"; readonly value: number }
	| { readonly kind: "int64"; readonly value: string }
	| { readonly kind: "float"; readonly value: number }
	| { readonly kind: "softObject"; readonly target: SoftObject }
	| { readonly kind: "struct"; readonly list: PropertyList };

type MapEntry = { readonly key: MapElement; readonly value: MapElement };

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

type ArrayItem =
	| { readonly kind: "byte"; readonly value: number }
	| { readonly kind: "int"; readonly value: number }
	| { readonly kind: "string"; readonly value: string }
	| { readonly kind: "softObject"; readonly target: SoftObject }
	| { readonly kind: "struct"; readonly list: PropertyList }
	| { readonly kind: "blob"; readonly value: PropertyBlob };

type PropertyBlob = {
	readonly version: number;
	readonly properties: readonly PropertyTag[];
	readonly trailing: string;
};

type ArrayValue = {
	readonly type: "ArrayProperty";
	readonly itemType: string;
	readonly itemTypeIndex: number;
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

type PropertyTag = {
	readonly name: string;
	readonly arrayIndex: number;
	readonly value: PropertyValue;
};

export type PropertyList = {
	readonly properties: readonly PropertyTag[];
	readonly trailing: string;
};

const BYTE_ARRAY_ITEM_TYPE = "ByteProperty";

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
	reader.i32("StructProperty body size");
	let guid: Guid | null = null;
	let fields: StructFields;
	if (structType === "DateTime") {
		guid = readGuidFlag(reader, "StructProperty");
		fields = { kind: "ticks", ticks: reader.i64("DateTime ticks").toString() };
	} else if (structType === "Guid") {
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

const wireTypeOf = (value: PropertyValue): string =>
	value.type === "OpaqueProperty" ? value.declaredType : value.type;

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
	if (inner !== null) writer.raw(writeInnerType(inner));
	writer.raw(body.finish());
};

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

const readProperties = (reader: UnrealReader): PropertyList => ({
	properties: readList(reader),
	trailing: "",
});

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
