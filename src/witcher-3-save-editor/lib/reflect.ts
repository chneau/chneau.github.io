/**
 * The class-reflection value grammar.
 *
 * ## Where this sits
 *
 * `./tokens` reads the flat token stream: a `PORP`/`AVAL`/`VL`/`OP` record
 * carries a property name, a type *name* (from the save's own `MANU` table) and
 * a value. For a scalar type (`Int32`, `Float`, `CName`, …) the type name gives
 * the width and the value is decoded directly. For a **composite** type the
 * value is not an opaque blob — it is another property stream, and this module
 * decodes it:
 *
 * ```
 *   array:2,0,T  | u32 count | count × value(T)
 *   handle:X     | 0x01                                            (null)
 *                | 00 01 | u32 classVersion | u16 classIndex
 *                  | <struct body of X>
 *   struct/class | u8 presence=0
 *                  | (u16 nameIdx | u16 typeIdx | u32 size | value[size-4])*
 *                  | u16 0                                        (terminator)
 * ```
 *
 * `size` is the property's **value length plus four** — the four bytes of the
 * `nameIdx`/`typeIdx` pair the writer counts with it. Properties whose value is
 * the field's default are omitted, which is why the terminator, not a count,
 * marks the end of a struct.
 *
 * A `class` value is written *inline* with the `00 01 | version | classIndex`
 * header, exactly like the body of a `handle:`; a `struct` value has no header.
 * The save does not record which is which, so an unrecognised type is tried in
 * the shape its leading bytes suggest (a `00 01` header means a class) and the
 * other shape is the fallback.
 *
 * ## Validation
 *
 * The grammar is not inferred from a hunch: it consumes whole real payloads to
 * the byte. On the reference `66/29` save the player's `W3LevelManager`
 * (2,675 bytes), `W3AbilityManager` (54,925 and 27,527 bytes), an
 * `W3EffectManager`, `CEncounterDataManager` and `W3Reputation` all decode with
 * **zero leftover bytes**, and the field names line up with the declarations in
 * the installed game's own `.ws` sources
 * (`game/gameplay/leveling/levelManager.ws`,
 * `game/gameplay/ability/abilityManager.ws`, …) — `SLevelDefinition` is
 * `{number, requiredTotalExp, addedSkillPoints, requiredExp}`, `SAbilityAttributeValue`
 * is `{valueAdditive, valueMultiplicative, valueBase}`, and so on.
 *
 * ## Enum vs struct
 *
 * An `enum` is a two-byte integer; a struct/class is the presence-framed record
 * stream above. The distinction is *not* in the save, so the enum names are
 * harvested from the game's script sources into `./enums`; a handful of
 * engine-native enums that the scripts never declare are listed here.
 */

import { ENUM_TYPES } from "./enums";

/**
 * Engine-native enums: they are used throughout the scripts but never declared
 * there (the reflection lives in `witcher3.exe`). `EnumGetMax` is called on
 * `EBaseCharacterStats`/`ECharacterDefenseStats` in `gameParams.ws`, and the
 * rest are the enums the token layer already needed. Any type in this set is a
 * two-byte integer.
 */
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

/** Primitive type widths, in bytes. */
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

/** One named member of a struct/class value. */
type ReflectedField = {
	readonly name: string;
	readonly value: ReflectedValue;
	/**
	 * Absolute offset of the field's value in the decompressed stream.
	 *
	 * `value.width` says how wide the field is; without its address a caller
	 * that wants to *write* the field has nothing to write into, and the only
	 * way back is to re-walk the struct guessing at its grammar. The reader
	 * computed `valueOffset` anyway to seek the value, so keeping it costs
	 * nothing and is what makes level, skill points and skill levels editable
	 * at all rather than merely readable.
	 */
	readonly offset: number;
};

/** What a decoded composite value turned out to be. */
type ReflectedKind =
	| "null"
	| "scalar"
	| "string"
	| "array"
	| "object"
	| "struct"
	| "raw";

/**
 * A decoded composite value.
 *
 * `text` is a short human-readable rendering, `fields`/`items` the structured
 * children. `width` is the exact byte length of the value, which is what proves
 * a parse: a caller compares it with the length the parent declared.
 */
export type ReflectedValue = {
	readonly kind: ReflectedKind;
	readonly type: string;
	readonly width: number;
	readonly text: string;
	/** members of a `struct`/`object` */
	readonly fields?: readonly ReflectedField[];
	/** members of an `array` */
	readonly items?: readonly ReflectedValue[];
	/** element count, for `array` */
	readonly count?: number;
	/** `MANU` index of the concrete class, for `object` */
	readonly classIndex?: number;
	/** class schema version, for `object` */
	readonly version?: number;
};

/** The save's own MANU table, which every property index resolves against. */
type Names = readonly string[];

/** The prefix that marks a WitcherScript array type and its element type. */
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
/*
 * `f32`/`f64` are bounded to the **view**, not to `data.buffer`.
 *
 * A `DataView` over the parent buffer reads outside the slice a caller handed in
 * — on a `subarray` that is bytes the caller never offered — and throws
 * `RangeError` when the range runs past the parent, which is a throw the contract
 * says must not happen. `NaN` rather than a throw for the short case: the callers
 * reject the value on its width immediately afterwards, so it is never rendered,
 * and a throw here would be reachable from a corrupt save.
 */
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

/** Number of set bits in a byte. */
const popcount = (value: number): number => {
	let count = 0;
	for (let bit = value; bit !== 0; bit >>= 1) count += bit & 1;
	return count;
};

/**
 * The four floats packed into a `Vector` value: `00 | u32 tag | f32 | …`.
 *
 * A **fixed four-tuple**, not `number[]`. The source decoder returned an array
 * and then read its first three entries with `x?.toFixed(2)`, which typeschecks
 * and quietly renders `(undefined, 691, 44)` if the tuple ever comes up short.
 * Naming the width here means the three reads downstream are three `number`s.
 */
const decodeVector = (
	data: Uint8Array,
	at: number,
): [number, number, number, number] => {
	const out: number[] = [];
	for (let i = 0; i < 4; i += 1) {
		out.push(f32(data, at + 1 + i * 8 + 4));
	}
	const [x, y, z, w] = out;
	// The reads above always push four values; the fallback is what makes the
	// compiler agree rather than what makes it safe.
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
		// The reference's documented hack: a stray 0x01 is sometimes present.
		if (u8(data, cursor) === 0x01) cursor += 1;
		length = header & 0x7f;
	}
	const bytes = data.subarray(cursor, cursor + length);
	return {
		width: cursor - at + length,
		text: new TextDecoder("latin1").decode(bytes),
	};
};

/** Decode a fixed-width scalar, or a variable one whose width is self-describing. */
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
		// A byte of component flags (position, rotation, scale, …), then three
		// `f32` per set bit: `01` -> 13 bytes, `03` -> 25. Measured over every
		// `EngineTransform` in the reference save.
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

/** Shorten a preview so a deep structure cannot flood a line of output. */
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

/**
 * Decode the value of `type` occupying exactly `length` bytes at `offset`.
 *
 * Returns `undefined` when the bytes do not form a value of that type and
 * length — a caller must not treat a partial read as success. The `names` table
 * resolves the property type indices inside a struct/class body.
 */
export const reflectValue = (
	data: Uint8Array,
	names: Names,
	type: string,
	offset: number,
	length: number,
	depth = 0,
): ReflectedValue | undefined => {
	// `length < 0` is a real input, not a typo: the array branch below hands each
	// element `offset + length - cursor`, which goes negative once the cursor has
	// passed the declared end, and a negative length made the `offset + length`
	// bound *smaller* than the offset — passing a guard whose whole job is to
	// reject the read.
	if (
		depth > MAX_DEPTH ||
		offset < 0 ||
		length < 0 ||
		offset + length > data.length
	) {
		return undefined;
	}

	// A `handle:`/`soft:` reference. A null handle is the single byte `01`; a
	// present object starts `00 01`; a repeated reference is a small `00 00 …`
	// pointer we do not resolve. `soft:` references are often a bare string.
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
			// A `00 00 …` back-reference is opaque but has a known length.
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
		// Some referents are fixed-width native values (`W3EnvironmentManager`),
		// not script objects — fall back to the scalar table for the target type.
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
		// `length` is a bound here, not an exact span: an array nested inside an
		// array is handed the whole remaining length and must stop when its own
		// count is exhausted. The caller that *owns* an exact length — a struct
		// property — checks `width` against it.
		return {
			kind: "array",
			type,
			width: cursor - offset,
			count,
			items,
			text: arrayText(count, items),
		};
	}

	// `EntityHandle` is width-variable: a null is one byte, a resolved reference
	// eighteen. A record also states the length, and a scalar field can be a
	// one-byte reference (`creatorHandle = 03`), so a declared length of one is
	// authoritative; otherwise the first byte decides, which is what an array
	// element — handed only the remaining length — needs.
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

	// A scalar whose fixed width does not fit the declared `length` is not a value
	// of this type and length, and the doc above says so. Returning it anyway was
	// worse than a wrong number: `f32`/`f64` build their `DataView` over
	// `data.buffer`, so a one-byte `length` still produced a four- or eight-byte
	// read — and on a `subarray` view that read lands in the *parent* buffer,
	// outside the slice the caller handed in. Enforcing `width <= length` here is
	// what makes the width the caller is promised the width actually read.
	const scalar = readScalar(data, type, offset);
	if (scalar !== undefined && scalar.width <= length) return scalar;

	// An unrecognised type is a struct or a class written inline. A `struct`
	// value is a presence byte then properties; a `class` value adds the
	// `00 01 | version | classIndex` header in front. The two are told apart by
	// that second byte: try the shape the header suggests first, then the other,
	// so a class whose body merely looks struct-like cannot silently win.
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

/** `u8 presence=0`, properties, `u16 0`. `length` bounds the whole body. */
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

/** `00 01 | u32 version | u16 classIndex | <struct body>`. */
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
