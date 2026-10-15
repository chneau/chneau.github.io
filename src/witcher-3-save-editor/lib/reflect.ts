import { ENUM_TYPES } from "./enums";

const NATIVE_ENUMS: readonly string[] = [
	"EBaseCharacterStats",
	"ECharacterDefenseStats",
	"CPlayerInput",
	"eGwintFaction",
	"EJournalStatus",
	"EDifficultyMode",
	"EAIAttitude",
	"EVehicleSlot",
	"EFocusModeVisibility",
	"EDoorState",
];

const ENUMS: ReadonlySet<string> = new Set([...ENUM_TYPES, ...NATIVE_ENUMS]);

const FIXED_WIDTHS: ReadonlyMap<string, number> = new Map([
	["Bool", 1],
	["Uint8", 1],
	["Int8", 1],
	["Uint16", 2],
	["Int16", 2],
	["CName", 2],
	["Uint32", 4],
	["Int32", 4],
	["Float", 4],
	["EngineTime", 4],
	["Uint64", 8],
	["Int64", 8],
	["Double", 8],
	["CGUID", 16],
	["IdTag", 17],
	["Vector2", 19],
	["Vector3", 12],
	["EulerAngles", 27],
	["Vector", 35],
	["W3EnvironmentManager", 19],
	["SQuestThreadSuspensionData", 29],
]);

type ReflectedField = {
	readonly name: string;
	readonly value: ReflectedValue;
	readonly offset: number;
};

type ReflectedKind =
	| "null"
	| "scalar"
	| "string"
	| "array"
	| "object"
	| "struct"
	| "raw";

export type ReflectedValue = {
	readonly kind: ReflectedKind;
	readonly type: string;
	readonly width: number;
	readonly text: string;
	readonly fields?: readonly ReflectedField[];
	readonly items?: readonly ReflectedValue[];
	readonly count?: number;
	readonly classIndex?: number;
	readonly version?: number;
};

type Names = readonly string[];

const ARRAY_PREFIX = "array:2,0,";

const u8 = (data: Uint8Array, at: number): number => data[at] ?? 0;
const u16 = (data: Uint8Array, at: number): number =>
	u8(data, at) | (u8(data, at + 1) << 8);
const u32 = (data: Uint8Array, at: number): number =>
	(u8(data, at) |
		(u8(data, at + 1) << 8) |
		(u8(data, at + 2) << 16) |
		(u8(data, at + 3) << 24)) >>>
	0;
const i8 = (data: Uint8Array, at: number): number => {
	const v = u8(data, at);
	return v > 0x7f ? v - 0x100 : v;
};
const i16 = (data: Uint8Array, at: number): number => {
	const v = u16(data, at);
	return v > 0x7fff ? v - 0x10000 : v;
};
const i32 = (data: Uint8Array, at: number): number => {
	const v = u32(data, at);
	return v > 0x7fffffff ? v - 0x1_0000_0000 : v;
};
const f32 = (data: Uint8Array, at: number): number =>
	at >= 0 && at + 4 <= data.length
		? new DataView(data.buffer, data.byteOffset + at, 4).getFloat32(0, true)
		: Number.NaN;
const f64 = (data: Uint8Array, at: number): number =>
	at >= 0 && at + 8 <= data.length
		? new DataView(data.buffer, data.byteOffset + at, 8).getFloat64(0, true)
		: Number.NaN;

const hexBytes = (data: Uint8Array, at: number, length: number): string =>
	Array.from(data.subarray(at, at + length), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");

const popcount = (value: number): number => {
	let count = 0;
	for (let bit = value; bit !== 0; bit >>= 1) count += bit & 1;
	return count;
};

const decodeVector = (
	data: Uint8Array,
	at: number,
): [number, number, number, number] => {
	const out: number[] = [];
	for (let i = 0; i < 4; i += 1) {
		out.push(f32(data, at + 1 + i * 8 + 4));
	}
	const [x, y, z, w] = out;
	return [x ?? 0, y ?? 0, z ?? 0, w ?? 0];
};

const stringWidth = (
	data: Uint8Array,
	at: number,
): { width: number; text: string } | undefined => {
	const header = u8(data, at);
	let cursor = at + 1;
	let length: number;
	if ((header & 0x80) === 0) {
		length = u8(data, cursor);
		cursor += 1;
	} else {
		if (u8(data, cursor) === 0x01) cursor += 1;
		length = header & 0x7f;
	}
	const bytes = data.subarray(cursor, cursor + length);
	return {
		width: cursor - at + length,
		text: new TextDecoder("latin1").decode(bytes),
	};
};

const readScalar = (
	data: Uint8Array,
	type: string,
	at: number,
): ReflectedValue | undefined => {
	if (ENUMS.has(type)) {
		return { kind: "scalar", type, width: 2, text: String(u16(data, at)) };
	}
	const fixed = FIXED_WIDTHS.get(type);
	if (fixed !== undefined) {
		let text: string;
		switch (type) {
			case "Bool":
				text = u8(data, at) === 0 ? "false" : "true";
				break;
			case "Float":
				text = String(f32(data, at));
				break;
			case "Double":
				text = String(f64(data, at));
				break;
			case "Int8":
				text = String(i8(data, at));
				break;
			case "Int16":
				text = String(i16(data, at));
				break;
			case "Int32":
				text = String(i32(data, at));
				break;
			case "CName":
				text = `CName(${u16(data, at)})`;
				break;
			case "Vector": {
				const [x, y, z] = decodeVector(data, at);
				text = `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`;
				break;
			}
			case "CGUID":
				text = hexBytes(data, at, 16);
				break;
			case "IdTag":
				text = hexBytes(data, at, 17);
				break;
			case "Uint8":
			case "Uint16":
			case "Uint32":
				text = String(
					Array.from(data.subarray(at, at + fixed)).reduce(
						(acc, byte, i) => acc + byte * 2 ** (8 * i),
						0,
					),
				);
				break;
			default:
				text = hexBytes(data, at, fixed);
				break;
		}
		return { kind: "scalar", type, width: fixed, text };
	}
	if (
		type === "String" ||
		type === "StringAnsi" ||
		type === "CEntityTemplate"
	) {
		const read = stringWidth(data, at);
		if (!read) return undefined;
		return { kind: "string", type, width: read.width, text: read.text };
	}
	if (type === "EntityHandle") {
		const width = u8(data, at) > 0 ? 18 : 1;
		return { kind: "scalar", type, width, text: hexBytes(data, at, width) };
	}
	if (type === "TagList") {
		const width = 1 + 2 * (u8(data, at) & 0x7f);
		return { kind: "scalar", type, width, text: hexBytes(data, at, width) };
	}
	if (type === "SActionPointId") {
		const width = 3 + (u16(data, at + 1) > 0 ? 40 : 0);
		return { kind: "scalar", type, width, text: hexBytes(data, at, width) };
	}
	if (type === "EngineTransform") {
		const flags = u8(data, at);
		const components = popcount(flags);
		const width = 1 + 12 * components;
		if (at + width > data.length) return undefined;
		const floats: string[] = [];
		for (let i = 0; i < components * 3; i += 1) {
			floats.push(f32(data, at + 1 + i * 4).toFixed(2));
		}
		return {
			kind: "scalar",
			type,
			width,
			text: `[${floats.join(", ")}]`,
		};
	}
	return undefined;
};

const preview = (text: string, limit = 96): string =>
	text.length > limit ? `${text.slice(0, limit - 1)}…` : text;

const fieldsText = (fields: readonly ReflectedField[]): string =>
	`{${fields.map((f) => `${f.name}=${f.value.text}`).join(", ")}}`;

const arrayText = (count: number, items: readonly ReflectedValue[]): string => {
	const shown = items.slice(0, 8).map((item) => item.text);
	const ellipsis = count > shown.length ? ", …" : "";
	return `[${count}] {${shown.join(", ")}${ellipsis}}`;
};

const MAX_ARRAY = 1_000_000;
const MAX_DEPTH = 24;

export const reflectValue = (
	data: Uint8Array,
	names: Names,
	type: string,
	offset: number,
	length: number,
	depth = 0,
): ReflectedValue | undefined => {
	if (
		depth > MAX_DEPTH ||
		offset < 0 ||
		length < 0 ||
		offset + length > data.length
	) {
		return undefined;
	}

	if (type.startsWith("handle:") || type.startsWith("soft:")) {
		const target = type.slice(type.indexOf(":") + 1);
		const soft = type.startsWith("soft:");
		const first = u8(data, offset);
		if (soft) {
			const read = stringWidth(data, offset);
			if (read && read.width === length) {
				return { kind: "string", type, width: length, text: read.text };
			}
			if (first === 1) return { kind: "null", type, width: 1, text: "null" };
		} else {
			if (first === 1) return { kind: "null", type, width: 1, text: "null" };
			if (first === 0 && u8(data, offset + 1) === 0) {
				return {
					kind: "raw",
					type,
					width: length,
					text: hexBytes(data, offset, Math.min(length, 24)),
				};
			}
		}
		if (first !== 0 || u8(data, offset + 1) !== 1) return undefined;
		if (length === 2) {
			return { kind: "object", type, width: 2, text: "{}" };
		}
		const object = readObject(data, names, type, offset, length, depth);
		if (object) return object;
		const scalar = readScalar(data, target, offset);
		if (scalar && scalar.width === length) return scalar;
		return undefined;
	}

	if (type.startsWith(ARRAY_PREFIX)) {
		const element = type.slice(ARRAY_PREFIX.length);
		const count = u32(data, offset);
		if (count > MAX_ARRAY) return undefined;
		const items: ReflectedValue[] = [];
		let cursor = offset + 4;
		for (let i = 0; i < count; i += 1) {
			const item = reflectValue(
				data,
				names,
				element,
				cursor,
				offset + length - cursor,
				depth + 1,
			);
			if (!item || item.width <= 0) return undefined;
			items.push(item);
			cursor += item.width;
			if (cursor > offset + length) return undefined;
		}
		return {
			kind: "array",
			type,
			width: cursor - offset,
			count,
			items,
			text: arrayText(count, items),
		};
	}

	if (type === "EntityHandle") {
		const width = length === 1 ? 1 : u8(data, offset) === 0 ? 1 : 18;
		if (width > length) return undefined;
		return {
			kind: "scalar",
			type,
			width,
			text: hexBytes(data, offset, width),
		};
	}

	const scalar = readScalar(data, type, offset);
	if (scalar !== undefined && scalar.width <= length) return scalar;

	const classIndex = u16(data, offset + 6);
	const looksInline =
		length >= 8 &&
		u8(data, offset) === 0 &&
		u8(data, offset + 1) === 1 &&
		names[classIndex - 1] !== undefined;
	const first = looksInline
		? readObject(data, names, type, offset, length, depth)
		: readStruct(data, names, type, offset, length, depth);
	if (first) return first;
	const second = looksInline
		? readStruct(data, names, type, offset, length, depth)
		: readObject(data, names, type, offset, length, depth);
	if (second) return second;
	return undefined;
};

const readStruct = (
	data: Uint8Array,
	names: Names,
	type: string,
	offset: number,
	length: number,
	depth: number,
): ReflectedValue | undefined => {
	if (u8(data, offset) !== 0) return undefined;
	const end = offset + length;
	const fields: ReflectedField[] = [];
	let cursor = offset + 1;
	while (cursor + 2 <= end) {
		const nameIndex = u16(data, cursor);
		if (nameIndex === 0) {
			const width = cursor + 2 - offset;
			return {
				kind: "struct",
				type,
				width,
				fields,
				text: preview(fieldsText(fields)),
			};
		}
		const name = names[nameIndex - 1];
		const typeIndex = u16(data, cursor + 2);
		const fieldType = names[typeIndex - 1];
		const size = u32(data, cursor + 4);
		if (name === undefined || fieldType === undefined || size < 4) {
			return undefined;
		}
		const valueLength = size - 4;
		const valueOffset = cursor + 8;
		if (valueOffset + valueLength > end) return undefined;
		const value = reflectValue(
			data,
			names,
			fieldType,
			valueOffset,
			valueLength,
			depth + 1,
		);
		if (!value || value.width !== valueLength) return undefined;
		fields.push({ name, value, offset: valueOffset });
		cursor = valueOffset + valueLength;
	}
	return undefined;
};

const readObject = (
	data: Uint8Array,
	names: Names,
	type: string,
	offset: number,
	length: number,
	depth: number,
): ReflectedValue | undefined => {
	if (length < 8 || u8(data, offset) !== 0 || u8(data, offset + 1) !== 1) {
		return undefined;
	}
	const version = u32(data, offset + 2);
	const classIndex = u16(data, offset + 6);
	const className = names[classIndex - 1] ?? type.slice(type.indexOf(":") + 1);
	const body = readStruct(
		data,
		names,
		className,
		offset + 8,
		length - 8,
		depth,
	);
	if (!body) return undefined;
	return {
		kind: "object",
		type,
		width: 8 + body.width,
		classIndex,
		version,
		fields: body.fields,
		text: `${className}(v${version}) ${body.text}`,
	};
};
