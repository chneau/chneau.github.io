import { readU32 } from "./inner";

type TokenTag =
	| "AVAL"
	| "BLCK"
	| "PORP"
	| "OP"
	| "VL"
	| "BS"
	| "SS"
	| "SXAP"
	| "MANU";

type TokenValue = {
	readonly type: string;
	readonly text: string;
	readonly bytes: Uint8Array;
};

export type Token = {
	readonly offset: number;
	readonly size: number;
	readonly tag: TokenTag;
	readonly name: string;
	readonly detail?: string;
	readonly childSize?: number;
	readonly value?: TokenValue;
};

type TokenScan = {
	readonly tokens: readonly Token[];
	readonly coveredBytes: number;
	readonly skippedBytes: number;
	readonly tagCounts: ReadonlyMap<string, number>;
	readonly unhandledTypes: ReadonlyMap<string, number>;
};

const u8 = (data: Uint8Array, o: number): number => data[o] ?? 0;
const u16 = (data: Uint8Array, o: number): number =>
	u8(data, o) | (u8(data, o + 1) << 8);
const i16 = (data: Uint8Array, o: number): number => {
	const v = u16(data, o);
	return v > 0x7fff ? v - 0x10000 : v;
};
const u32 = (data: Uint8Array, o: number): number => readU32(data, o) ?? 0;
const i32 = (data: Uint8Array, o: number): number => {
	const v = u32(data, o);
	return v > 0x7fffffff ? v - 0x1_0000_0000 : v;
};

const hasMagic = (data: Uint8Array, o: number, magic: string): boolean => {
	for (let i = 0; i < magic.length; i += 1) {
		if (data[o + i] !== magic.charCodeAt(i)) return false;
	}
	return true;
};

const ENUM_TYPES = new Set([
	"eGwintFaction",
	"EJournalStatus",
	"EZoneName",
	"EDifficultyMode",
	"EAIAttitude",
	"CPlayerInput",
	"EBehaviorGraph",
	"ESignType",
	"EVehicleSlot",
]);

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
	["EulerAngles", 27],
	["Vector", 35],
	["W3EnvironmentManager", 19],
	["SQuestThreadSuspensionData", 29],
]);

const ARRAY_PREFIX = "array:2,0,";

type GameTimeRead = {
	readonly width: number;
	readonly seconds: number;
};

const FRAMED_INT32_MEMBER = 8;

const GAME_TIME_EMPTY = 3;
const GAME_TIME_SIZED = 15;
const GAME_TIME_INLINE = 11;

const runsTo = (data: Uint8Array, o: number, width: number): boolean =>
	u16(data, o + width - 2) === 0;

const readGameTime = (
	data: Uint8Array,
	o: number,
	framed?: boolean,
): GameTimeRead | undefined => {
	if (u8(data, o) !== 0) return undefined;
	if (u16(data, o + 1) === 0) return { width: GAME_TIME_EMPTY, seconds: 0 };

	if (framed === true) {
		return runsTo(data, o, GAME_TIME_SIZED) &&
			u32(data, o + 5) === FRAMED_INT32_MEMBER
			? { width: GAME_TIME_SIZED, seconds: i32(data, o + 9) }
			: undefined;
	}
	if (framed === false) {
		return runsTo(data, o, GAME_TIME_INLINE)
			? { width: GAME_TIME_INLINE, seconds: i32(data, o + 5) }
			: undefined;
	}

	if (
		u32(data, o + 5) === FRAMED_INT32_MEMBER &&
		runsTo(data, o, GAME_TIME_SIZED)
	) {
		return { width: GAME_TIME_SIZED, seconds: i32(data, o + 9) };
	}
	if (runsTo(data, o, GAME_TIME_INLINE)) {
		return { width: GAME_TIME_INLINE, seconds: i32(data, o + 5) };
	}
	return undefined;
};

const valueWidth = (
	data: Uint8Array,
	type: string,
	o: number,
	depth = 0,
	framed?: boolean,
): number | undefined => {
	if (depth > 8) return undefined;
	if (ENUM_TYPES.has(type)) return 2;
	const fixed = FIXED_WIDTHS.get(type);
	if (fixed !== undefined) return fixed;
	if (type === "GameTime") return readGameTime(data, o, framed)?.width;
	if (type === "StringAnsi") return 1 + u8(data, o);
	if (type === "String" || type === "CEntityTemplate") {
		const header = u8(data, o);
		if ((header & 0x80) === 0) return undefined;
		let at = o + 1;
		if (u8(data, at) === 0x01) at += 1;
		return at - o + (header & 0x7f);
	}
	if (type === "EntityHandle") return u8(data, o) > 0 ? 18 : 1;
	if (type === "SActionPointId") return 3 + (u16(data, o + 1) > 0 ? 40 : 0);
	if (type === "TagList") return 1 + 2 * (u8(data, o) & 0x7f);
	if (type.startsWith(ARRAY_PREFIX)) {
		const elem = type.slice(ARRAY_PREFIX.length);
		const count = u32(data, o);
		if (count > 1_000_000) return undefined;
		let at = o + 4;
		for (let i = 0; i < count; i += 1) {
			const w = valueWidth(data, elem, at, depth + 1, framed);
			if (w === undefined) return undefined;
			at += w;
		}
		return at - o;
	}
	if (type.startsWith("handle:") || type.startsWith("soft:")) {
		return valueWidth(
			data,
			type.slice(type.indexOf(":") + 1),
			o,
			depth + 1,
			framed,
		);
	}
	return undefined;
};

const renderValue = (
	data: Uint8Array,
	type: string,
	o: number,
	width: number,
	framed?: boolean,
): TokenValue => {
	const bytes = data.slice(o, o + width);
	const hex = (n: number): string =>
		`0x${n
			.toString(16)
			.toUpperCase()
			.padStart(width * 2, "0")}`;
	let text: string;
	switch (type) {
		case "Bool":
			text = bytes[0] === 0 ? "false" : "true";
			break;
		case "Uint8":
		case "Uint16":
		case "Uint32":
		case "EngineTime":
			text = String(
				bytes.reduce((acc, byte, i) => acc + byte * 2 ** (8 * i), 0),
			);
			break;
		case "GameTime": {
			const read = readGameTime(data, o, framed);
			text = read === undefined ? hex(0) : String(read.seconds);
			break;
		}
		case "Int8": {
			const v = bytes[0] ?? 0;
			text = String(v > 0x7f ? v - 0x100 : v);
			break;
		}
		case "Int16": {
			const v = bytes.reduce((acc, byte, i) => acc + byte * 2 ** (8 * i), 0);
			text = String(v > 0x7fff ? v - 0x10000 : v);
			break;
		}
		case "Int32": {
			const v = bytes.reduce((acc, byte, i) => acc + byte * 2 ** (8 * i), 0);
			text = String(v > 0x7fffffff ? v - 0x1_0000_0000 : v);
			break;
		}
		case "Float": {
			const view = new DataView(
				bytes.buffer,
				bytes.byteOffset,
				bytes.byteLength,
			);
			text = width === 4 ? String(view.getFloat32(0, true)) : hex(0);
			break;
		}
		case "Double": {
			const view = new DataView(
				bytes.buffer,
				bytes.byteOffset,
				bytes.byteLength,
			);
			text = String(view.getFloat64(0, true));
			break;
		}
		case "String":
		case "StringAnsi":
			text = new TextDecoder("latin1")
				.decode(bytes.slice(1))
				.replace(/\0+$/, "");
			break;
		case "CGUID":
			text = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
			break;
		default:
			text =
				type.startsWith(ARRAY_PREFIX) || ENUM_TYPES.has(type)
					? `${width} byte(s)`
					: [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
			break;
	}
	return { type, text, bytes };
};

const readToken = (
	data: Uint8Array,
	names: readonly string[],
	o: number,
	unhandled: Map<string, number>,
): Token | undefined => {
	const name = (idx: number): string => names[idx - 1] ?? `<${idx}>`;

	if (hasMagic(data, o, "AVAL") || hasMagic(data, o, "PORP")) {
		const tag: TokenTag = hasMagic(data, o, "AVAL") ? "AVAL" : "PORP";
		const nameIdx = i16(data, o + 4);
		const typeIdx = i16(data, o + 6);
		const len = u32(data, o + 8);
		if (len > data.length - o) return undefined;
		const type = name(typeIdx);
		const typeWidth = valueWidth(data, type, o + 12, 0, true);
		const w = typeWidth !== undefined && typeWidth <= len ? typeWidth : len;
		return {
			offset: o,
			tag,
			size: 12 + len,
			name: name(nameIdx),
			detail: `len=${len}`,
			value: renderValue(data, type, o + 12, w, true),
		};
	}
	if (hasMagic(data, o, "BLCK")) {
		return {
			offset: o,
			tag: "BLCK",
			size: 10,
			name: name(i16(data, o + 4)),
			detail: `a=${u16(data, o + 6)} b=${u16(data, o + 8)}`,
			childSize: u16(data, o + 6),
		};
	}
	if (hasMagic(data, o, "SXAP")) {
		return {
			offset: o,
			tag: "SXAP",
			size: 16,
			name: "",
			detail: `${u32(data, o + 4)} ${u32(data, o + 8)} ${u32(data, o + 12)}`,
		};
	}
	if (hasMagic(data, o, "SS")) {
		const inner = u32(data, o + 2);
		return {
			offset: o,
			tag: "SS",
			size: 6,
			name: "",
			detail: `inner=${inner}`,
			childSize: inner,
		};
	}
	if (hasMagic(data, o, "VL") || hasMagic(data, o, "OP")) {
		const tag: TokenTag = hasMagic(data, o, "VL") ? "VL" : "OP";
		const nameIdx = i16(data, o + 2);
		const typeIdx = i16(data, o + 4);
		const type = name(typeIdx);
		const w = valueWidth(data, type, o + 6, 0, false);
		if (w === undefined) {
			unhandled.set(type, (unhandled.get(type) ?? 0) + 1);
			return undefined;
		}
		return {
			offset: o,
			tag,
			size: 6 + w,
			name: name(nameIdx),
			value: renderValue(data, type, o + 6, w, false),
		};
	}
	if (hasMagic(data, o, "BS")) {
		return { offset: o, tag: "BS", size: 4, name: name(i16(data, o + 2)) };
	}
	if (hasMagic(data, o, "MANU")) {
		const count = u32(data, o + 4);
		if (count > 2_000_000) return undefined;
		let at = o + 12;
		for (let i = 0; i < count && at < data.length; i += 1) {
			const len = u8(data, at);
			if (len === 0) break;
			at += 1 + len;
		}
		if (hasMagic(data, at + 4, "ENOD")) {
			return {
				offset: o,
				tag: "MANU",
				size: at + 8 - o,
				name: "",
				detail: `${count} names`,
			};
		}
	}
	return undefined;
};

export const readTokenAt = (
	data: Uint8Array,
	names: readonly string[],
	offset: number,
): Token | undefined => readToken(data, names, offset, new Map());

type TokenScanOptions = {
	readonly from?: number;
	readonly limit?: number;
};

export const parseTokens = (
	data: Uint8Array,
	names: readonly string[],
	options: TokenScanOptions = {},
): TokenScan => {
	const from = options.from ?? 16;
	const limit = options.limit ?? Number.POSITIVE_INFINITY;
	const tokens: Token[] = [];
	const tagCounts = new Map<string, number>();
	const unhandledTypes = new Map<string, number>();
	let coveredBytes = 0;
	let skippedBytes = 0;
	let at = Math.max(0, from);
	while (at + 4 <= data.length && tokens.length < limit) {
		const token = readToken(data, names, at, unhandledTypes);
		if (
			token === undefined ||
			token.size <= 0 ||
			at + token.size > data.length
		) {
			skippedBytes += 1;
			at += 1;
			continue;
		}
		tokens.push(token);
		tagCounts.set(token.tag, (tagCounts.get(token.tag) ?? 0) + 1);
		coveredBytes += token.size;
		at += token.size;
	}
	return { tokens, coveredBytes, skippedBytes, tagCounts, unhandledTypes };
};
