import {
	ByteReader,
	type Bytes,
	ByteWriter,
	base64Decode,
	base64Encode,
	utf16leBytes,
} from "../../shared";

export type TypeName = {
	readonly name: string;
	readonly params: readonly TypeName[];
};

export type StructValue = {
	readonly type: "StructProperty";
	readonly native: boolean;
	readonly hex: string;
	readonly properties: readonly PropertyTag[];
	readonly trailing: string;
};

export type ArrayItem =
	| {
			readonly kind: "struct";
			readonly properties: readonly PropertyTag[];
	  }
	| { readonly kind: "int"; readonly value: number }
	| { readonly kind: "int64"; readonly value: string }
	| { readonly kind: "float"; readonly value: number }
	| { readonly kind: "double"; readonly value: number }
	| { readonly kind: "bool"; readonly value: boolean }
	| { readonly kind: "byte"; readonly value: number }
	| { readonly kind: "string"; readonly value: string };

export type ArrayValue = {
	readonly type: "ArrayProperty";
	readonly items: readonly ArrayItem[];
	readonly trailing: string;
};

export type PropertyValue =
	| { readonly type: "BoolProperty"; readonly value: boolean }
	| { readonly type: "ByteProperty"; readonly value: number }
	| { readonly type: "IntProperty"; readonly value: number }
	| { readonly type: "Int64Property"; readonly value: string }
	| { readonly type: "FloatProperty"; readonly value: number }
	| { readonly type: "DoubleProperty"; readonly value: number }
	| { readonly type: "StrProperty"; readonly value: string }
	| { readonly type: "NameProperty"; readonly value: string }
	| { readonly type: "EnumProperty"; readonly value: string }
	| StructValue
	| ArrayValue
	| { readonly type: "MapProperty"; readonly hex: string }
	| {
			readonly type: "OpaqueProperty";
			readonly declaredType: string;
			readonly hex: string;
	  };

export type PropertyTag = {
	readonly name: string;
	readonly type: TypeName;
	readonly flags: number;
	readonly arrayIndex: number;
	readonly guid: string | null;
	readonly value: PropertyValue;
};

type EngineVersion = {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
	readonly changelist: number;
	readonly branch: string;
};

type CustomVersion = {
	readonly id: string;
	readonly version: number;
};

export type GvasSave = {
	readonly magic: string;
	readonly fileVersion: number;
	readonly saveGameVersion: number;
	readonly packageFileUE5Version: number;
	readonly engine: EngineVersion;
	readonly customVersionFormat: number;
	readonly customVersions: readonly CustomVersion[];
	readonly saveGameType: string;
	readonly containerTag: number;
	readonly list: {
		readonly properties: readonly PropertyTag[];
		readonly trailing: string;
	};
};

const decodeBase64 = (value: string): Uint8Array =>
	new Uint8Array(base64Decode(value));

const HAS_ARRAY_INDEX = 0x01;
const HAS_PROPERTY_GUID = 0x02;
const HAS_EXTENSIONS = 0x04;
const HAS_BINARY_OR_NATIVE = 0x08;
const BOOL_TRUE = 0x10;

const readString = (reader: ByteReader, what: string): string => {
	const length = reader.i32(`${what} length`);
	if (length === 0) return "";
	const utf16 = length < 0;
	const units = (utf16 ? -length : length) - 1;
	if (units < 0) return "";
	const width = utf16 ? 2 : 1;
	const bytes = reader.raw(units * width, what);
	const value = new TextDecoder(utf16 ? "utf-16le" : "utf-8").decode(bytes);
	reader.raw(width, `${what} terminator`);
	return value;
};

const writeString = (writer: ByteWriter, value: string): void => {
	if (value === "") {
		writer.i32(0);
		return;
	}
	if (/[^\x20-\x7e]/.test(value)) {
		writer.i32(-(value.length + 1));
		writer.raw(utf16leBytes(value));
		writer.u16(0);
		return;
	}
	writer.i32(value.length + 1);
	writer.raw(new TextEncoder().encode(value));
	writer.u8(0);
};

const readGuid = (reader: ByteReader, what: string): string => {
	const words = [0, 1, 2, 3].map((word) =>
		reader.u32(`${what} word ${word}`).toString(16).padStart(8, "0"),
	);
	const hex = words.join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
		12,
		16,
	)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const writeGuid = (writer: ByteWriter, guid: string, what: string): void => {
	const hex = guid.replace(/-/g, "");
	if (hex.length !== 32 || !/^[0-9a-fA-F]+$/.test(hex)) {
		throw new Error(`${what} "${guid}" is not 32 hex digits.`);
	}
	for (let word = 0; word < 4; word += 1) {
		writer.u32(Number.parseInt(hex.slice(word * 8, word * 8 + 8), 16));
	}
};

const readTypeName = (reader: ByteReader, what: string): TypeName => {
	const name = readString(reader, `${what} name`);
	const count = reader.i32(`${what} parameter count`);
	if (count < 0 || count > 32) {
		throw new Error(
			`${what} claims ${count} type parameters, which cannot be right.`,
		);
	}
	const params: TypeName[] = [];
	for (let index = 0; index < count; index += 1) {
		params.push(readTypeName(reader, `${what} parameter ${index}`));
	}
	return { name, params };
};

const writeTypeName = (writer: ByteWriter, type: TypeName): void => {
	writeString(writer, type.name);
	writer.i32(type.params.length);
	for (const param of type.params) writeTypeName(writer, param);
};

const readTags = (reader: ByteReader, what: string): PropertyTag[] => {
	const properties: PropertyTag[] = [];
	for (;;) {
		const name = readString(reader, `${what} property name`);
		if (name === "None") return properties;
		if (name === "") {
			throw new Error(
				`${what} contains an empty property name at offset ${reader.position}.`,
			);
		}
		const type = readTypeName(reader, `${what} ${name} type`);
		const size = reader.i32(`${what} ${name} size`);
		if (size < 0) {
			throw new Error(`${what} ${name} declares a negative body size.`);
		}
		const flags = reader.u8(`${what} ${name} flags`);
		if ((flags & HAS_EXTENSIONS) !== 0) {
			throw new Error(
				`${what} ${name} carries property extensions, which this editor does not model.`,
			);
		}
		const arrayIndex =
			(flags & HAS_ARRAY_INDEX) !== 0
				? reader.i32(`${what} ${name} array index`)
				: 0;
		const guid =
			(flags & HAS_PROPERTY_GUID) !== 0
				? readGuid(reader, `${what} ${name} guid`)
				: null;
		const start = reader.position;
		const value = readValue(reader, type, size, flags, `${what} ${name}`);
		const consumed = reader.position - start;
		if (consumed !== size) {
			throw new Error(
				`${what} ${name} declares ${size} body byte(s) but ${consumed} were read.`,
			);
		}
		properties.push({ name, type, flags, arrayIndex, guid, value });
	}
};

const opaqueValue = (
	reader: ByteReader,
	type: string,
	size: number,
): PropertyValue => ({
	type: "OpaqueProperty",
	declaredType: type,
	hex: base64Encode(reader.raw(size, `${type} body`)),
});

const readArrayItems = (
	reader: ByteReader,
	inner: string,
	count: number,
	what: string,
): readonly ArrayItem[] => {
	const items: ArrayItem[] = [];
	for (let index = 0; index < count; index += 1) {
		const label = `${what} item ${index}`;
		switch (inner) {
			case "StructProperty":
				items.push({
					kind: "struct",
					properties: readTags(reader, label),
				});
				break;
			case "IntProperty":
				items.push({ kind: "int", value: reader.i32(label) });
				break;
			case "Int64Property":
				items.push({ kind: "int64", value: reader.i64(label).toString() });
				break;
			case "FloatProperty":
				items.push({ kind: "float", value: reader.f32(label) });
				break;
			case "DoubleProperty":
				items.push({ kind: "double", value: reader.f64(label) });
				break;
			case "BoolProperty":
				items.push({ kind: "bool", value: reader.u8(label) !== 0 });
				break;
			case "ByteProperty":
				items.push({ kind: "byte", value: reader.u8(label) });
				break;
			case "StrProperty":
			case "NameProperty":
			case "EnumProperty":
				items.push({ kind: "string", value: readString(reader, label) });
				break;
			default:
				throw new Error(
					`${what} holds ${inner}, which this editor does not model as an array element.`,
				);
		}
	}
	return items;
};

const readValue = (
	reader: ByteReader,
	type: TypeName,
	size: number,
	flags: number,
	what: string,
): PropertyValue => {
	switch (type.name) {
		case "BoolProperty":
			return { type: "BoolProperty", value: (flags & BOOL_TRUE) !== 0 };
		case "IntProperty":
			return { type: "IntProperty", value: reader.i32(what) };
		case "Int64Property":
			return { type: "Int64Property", value: reader.i64(what).toString() };
		case "FloatProperty":
			return { type: "FloatProperty", value: reader.f32(what) };
		case "DoubleProperty":
			return { type: "DoubleProperty", value: reader.f64(what) };
		case "StrProperty":
			return { type: "StrProperty", value: readString(reader, what) };
		case "NameProperty":
			return { type: "NameProperty", value: readString(reader, what) };
		case "EnumProperty":
			return { type: "EnumProperty", value: readString(reader, what) };
		case "ByteProperty":
			if (size !== 1) return opaqueValue(reader, type.name, size);
			return { type: "ByteProperty", value: reader.u8(what) };
		case "StructProperty": {
			if ((flags & HAS_BINARY_OR_NATIVE) !== 0) {
				return {
					type: "StructProperty",
					native: true,
					hex: base64Encode(reader.raw(size, what)),
					properties: [],
					trailing: "",
				};
			}
			const end = reader.position + size;
			const properties = readTags(reader, what);
			if (reader.position > end) {
				throw new Error(`${what} read past its ${size}-byte body.`);
			}
			const trailing = base64Encode(reader.raw(end - reader.position, what));
			return {
				type: "StructProperty",
				native: false,
				hex: "",
				properties,
				trailing,
			};
		}
		case "ArrayProperty": {
			const inner = type.params[0]?.name;
			if (inner === undefined) return opaqueValue(reader, type.name, size);
			const supported = [
				"StructProperty",
				"IntProperty",
				"Int64Property",
				"FloatProperty",
				"DoubleProperty",
				"BoolProperty",
				"ByteProperty",
				"StrProperty",
				"NameProperty",
				"EnumProperty",
			];
			if (!supported.includes(inner)) {
				return opaqueValue(reader, type.name, size);
			}
			const start = reader.position;
			try {
				const end = reader.position + size;
				const count = reader.i32(`${what} count`);
				if (count < 0) throw new Error(`${what} declares a negative count.`);
				const items = readArrayItems(reader, inner, count, what);
				if (reader.position > end) {
					throw new Error(`${what} read past its ${size}-byte body.`);
				}
				const trailing = base64Encode(reader.raw(end - reader.position, what));
				return { type: "ArrayProperty", items, trailing };
			} catch {
				reader.seek(start, `${what} array fallback`);
				return opaqueValue(reader, type.name, size);
			}
		}
		case "MapProperty":
			return { type: "MapProperty", hex: base64Encode(reader.raw(size, what)) };
		default:
			return opaqueValue(reader, type.name, size);
	}
};

const writeArrayItem = (writer: ByteWriter, item: ArrayItem): void => {
	switch (item.kind) {
		case "struct":
			for (const tag of item.properties) writeTag(writer, tag);
			writeString(writer, "None");
			return;
		case "int":
			writer.i32(item.value);
			return;
		case "int64":
			writer.i64(BigInt(item.value));
			return;
		case "float":
			writer.f32(item.value);
			return;
		case "double":
			writer.f64(item.value);
			return;
		case "bool":
			writer.u8(item.value ? 1 : 0);
			return;
		case "byte":
			writer.u8(item.value);
			return;
		case "string":
			writeString(writer, item.value);
			return;
		default:
			throw new Error("An array item kind cannot be written.");
	}
};

const writeValue = (writer: ByteWriter, value: PropertyValue): void => {
	switch (value.type) {
		case "BoolProperty":
			return;
		case "ByteProperty":
			writer.u8(value.value);
			return;
		case "IntProperty":
			writer.i32(value.value);
			return;
		case "Int64Property":
			writer.i64(BigInt(value.value));
			return;
		case "FloatProperty":
			writer.f32(value.value);
			return;
		case "DoubleProperty":
			writer.f64(value.value);
			return;
		case "StrProperty":
		case "NameProperty":
		case "EnumProperty":
			writeString(writer, value.value);
			return;
		case "StructProperty":
			if (value.native) {
				writer.raw(decodeBase64(value.hex));
				return;
			}
			for (const tag of value.properties) writeTag(writer, tag);
			writeString(writer, "None");
			writer.raw(decodeBase64(value.trailing));
			return;
		case "ArrayProperty":
			writer.i32(value.items.length);
			for (const item of value.items) writeArrayItem(writer, item);
			writer.raw(decodeBase64(value.trailing));
			return;
		case "MapProperty":
			writer.raw(decodeBase64(value.hex));
			return;
		case "OpaqueProperty":
			writer.raw(decodeBase64(value.hex));
			return;
		default:
			throw new Error("A property value kind cannot be written.");
	}
};

const writeTag = (writer: ByteWriter, tag: PropertyTag): void => {
	writeString(writer, tag.name);
	writeTypeName(writer, tag.type);
	const body = new ByteWriter();
	writeValue(body, tag.value);
	const bodyBytes = body.finish();
	writer.i32(bodyBytes.length);
	let flags = tag.flags;
	if (tag.value.type === "BoolProperty") {
		flags = tag.value.value ? flags | BOOL_TRUE : flags & ~BOOL_TRUE;
	}
	writer.u8(flags);
	if ((flags & HAS_ARRAY_INDEX) !== 0) writer.i32(tag.arrayIndex);
	if ((flags & HAS_PROPERTY_GUID) !== 0) {
		if (tag.guid === null) {
			throw new Error(`${tag.name} is flagged with a GUID but has none.`);
		}
		writeGuid(writer, tag.guid, `${tag.name} guid`);
	}
	writer.raw(bodyBytes);
};

export const readGvas = (bytes: Bytes): GvasSave => {
	const reader = new ByteReader(bytes);
	const magic = reader.latin1(4, "magic");
	if (magic !== "GVAS") {
		throw new Error(
			`This is not an Unreal save: it opens with "${magic.replace(
				/[^\x20-\x7e]/g,
				".",
			)}" rather than "GVAS".`,
		);
	}
	const fileVersion = reader.i32("SaveGameFileVersion");
	const saveGameVersion = reader.i32("SaveGameVersion");
	const packageFileUE5Version = reader.i32("PackageFileUE5Version");
	const engine: EngineVersion = {
		major: reader.u16("engine major"),
		minor: reader.u16("engine minor"),
		patch: reader.u16("engine patch"),
		changelist: reader.u32("engine changelist"),
		branch: readString(reader, "engine branch"),
	};
	const customVersionFormat = reader.i32("custom version format");
	const customVersionCount = reader.i32("custom version count");
	if (customVersionCount < 0 || customVersionCount > 512) {
		throw new Error(
			`The header claims ${customVersionCount} custom versions, which cannot be right.`,
		);
	}
	const customVersions: CustomVersion[] = [];
	for (let index = 0; index < customVersionCount; index += 1) {
		customVersions.push({
			id: readGuid(reader, `custom version ${index}`),
			version: reader.i32(`custom version ${index} value`),
		});
	}
	const saveGameType = readString(reader, "save class name");
	const containerTag = reader.u8("container tag");
	const properties = readTags(reader, "save");
	const trailing = base64Encode(reader.raw(reader.remaining, "save trailer"));
	return {
		magic,
		fileVersion,
		saveGameVersion,
		packageFileUE5Version,
		engine,
		customVersionFormat,
		customVersions,
		saveGameType,
		containerTag,
		list: { properties, trailing },
	};
};

export const writeGvas = (save: GvasSave): Bytes => {
	const writer = new ByteWriter();
	writer.latin1("GVAS");
	writer.i32(save.fileVersion);
	writer.i32(save.saveGameVersion);
	writer.i32(save.packageFileUE5Version);
	writer.u16(save.engine.major);
	writer.u16(save.engine.minor);
	writer.u16(save.engine.patch);
	writer.u32(save.engine.changelist);
	writeString(writer, save.engine.branch);
	writer.i32(save.customVersionFormat);
	writer.i32(save.customVersions.length);
	for (const [index, custom] of save.customVersions.entries()) {
		writeGuid(writer, custom.id, `custom version ${index}`);
		writer.i32(custom.version);
	}
	writeString(writer, save.saveGameType);
	writer.u8(save.containerTag);
	for (const tag of save.list.properties) writeTag(writer, tag);
	writeString(writer, "None");
	writer.raw(decodeBase64(save.list.trailing));
	return new Uint8Array(writer.finish());
};
