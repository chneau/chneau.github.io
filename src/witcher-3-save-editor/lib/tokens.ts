/**
 * The token grammar — the layer under the string scan and the property
 * assignment walk.
 *
 * ## Why this is the whole grammar
 *
 * An earlier pass of this decoder knew only two record shapes, `AVAL` and
 * `BLCK`, and covered about a third of the decompressed stream. The stream
 * actually uses nine tags, and the one that dominates is `VL` (`AVAL` is rare
 * outside the quest region):
 *
 * ```
 *   BS   | i16 nameIdx                                       (4 bytes)
 *   VL   | i16 nameIdx | i16 typeIdx | value[type]
 *   AVAL | i16 nameIdx | i16 typeIdx | u32 valueLen | value[valueLen]
 *   PORP | i16 nameIdx | i16 typeIdx | u32 valueLen | value[valueLen]
 *   OP   | i16 nameIdx | i16 typeIdx | value[type]
 *   BLCK | i16 nameIdx | u16 a | u16 b                       (10 bytes)
 *   SS   | u32 sizeInner | sizeInner bytes
 *   SXAP | u32 a | u32 b | u32 c                              (16 bytes)
 *   MANU | i32 count | i32 unknown | count×(u8 len, bytes) | u32 pad | "ENOD"
 * ```
 *
 * `nameIdx` and `typeIdx` are **1-based indices into the save's own MANU
 * table** (`name = MANU[nameIdx - 1]`), and the type name — `"Uint32"`,
 * `"Bool"`, `"String"`, `"CGUID"`, … — gives the value width. The stream is
 * therefore self-describing: no external schema is needed to find the value of
 * a named property.
 *
 * The 1-based indexing is measured, not assumed: a record at 1,834,633 with
 * index 710 reads as `GUID` of type `CGUID` only under 1-based indexing
 * (`inputNamesCount` under 0-based). The source decoder once used
 * `names[nameIndex]`, so every name it reported was off by one — a defect that
 * typechecks and lints and produces a plausible wrong answer.
 *
 * On the reference save every one of the 121,473 `BLCK` records is immediately
 * followed by an `AVAL`, so the pair reads as one property assignment: `BLCK`
 * names the property and `AVAL` supplies its value. That adjacency is what makes
 * the two shapes legible as a pair, and it is why `BLCK` is a fixed 10 bytes.
 *
 * ## Validation
 *
 * The grammar was confirmed against `Atvaark/W3SavegameEditor` and against the
 * tags in `witcher3.exe` (4.0.4), which compares the same literal 4-byte
 * constants. Measured coverage on the tracked saves is 79–90% of the
 * decompressed stream, up from ~34% for the two-shape `AVAL`/`BLCK` grammar
 * this file replaced. The source repository's `docs/tokens.md` records the
 * measurements and the parts still unsolved (the `(size, offset)` index tables
 * at the end of the stream, and a handful of variable-width values).
 *
 * ## What is measured, and what is not
 *
 * The walk starts at the **first `AVAL` in the stream** (offset 1,680,951 in
 * the reference save); the bytes before that are a different structure carrying
 * pointers, which is most of why a "two record shapes" grammar only ever reached
 * a third of the stream. Three fields remain **undecoded**, and no code here
 * claims otherwise: the second name index of an `AVAL`/`PORP`/`VL`/`OP` record
 * resolves to a valid `MANU` entry in 100% of cases but its meaning is unknown;
 * the trailing two `u16` of a `BLCK` take many values with no established
 * interpretation (`tokens.ts` keeps them as `detail`, not as a reading); and the
 * `(size, offset)` index tables at the end of the stream are recorded above as
 * unsolved.
 *
 * The `coveredBytes`/`skippedBytes` split is the honest accounting for this, and
 * it is deliberate: the walk always runs to the end of the buffer, stepping over
 * anything it does not recognise, so `end` is the buffer length for every real
 * save and reporting it as coverage would claim a complete decode every time.
 * Coverage is bytes *decoded*, not bytes *reached*.
 */

import { readU32 } from "./inner";

/** The nine tags the grammar recognises. */
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

/** A decoded value: its MANU type name, a rendering, and the exact bytes. */
type TokenValue = {
	/** The MANU type name the value was read as. */
	readonly type: string;
	/** Human-readable rendering, already grouped for numbers. */
	readonly text: string;
	/** Raw value bytes, exactly the span the type covers. */
	readonly bytes: Uint8Array;
};

export type Token = {
	/** absolute offset in the decompressed stream */
	readonly offset: number;
	/** bytes this token occupies, including its tag */
	readonly size: number;
	readonly tag: TokenTag;
	/** resolved MANU name, or `<idx>` when the index is out of range */
	readonly name: string;
	/** `BLCK`/`SS` frame indices that are not names are kept as raw text here */
	readonly detail?: string;
	/**
	 * For `BLCK`/`SS`, the byte size of the nested variables that follow the
	 * header. `BLCK` stores it as a `u16`, `SS` as a `u32`. A container's own
	 * `size` is only its header (`BLCK` 10, `SS` 6); the children follow and
	 * together occupy exactly `childSize` bytes.
	 */
	readonly childSize?: number;
	readonly value?: TokenValue;
};

type TokenScan = {
	readonly tokens: readonly Token[];
	/** bytes consumed by a decoded token */
	readonly coveredBytes: number;
	/** bytes stepped over because no token shape matched */
	readonly skippedBytes: number;
	/** number of tokens by tag */
	readonly tagCounts: ReadonlyMap<string, number>;
	/** type names the walk could not size, with hit counts */
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

/** Enum types the reference reads as two bytes. */
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

/**
 * Fixed widths for primitive type names, in bytes.
 *
 * A type absent from this table is not an error: `valueWidth` measures the ones
 * that are variable (`String`, `EntityHandle`, an array, a class-reflection
 * struct) from the bytes in front of it. `GameTime` used to sit here at 11, which
 * is the width of one of its three shapes and none of the other two — see
 * {@link readGameTime}.
 */
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

/** The prefix that marks a WitcherScript array type and its element type. */
const ARRAY_PREFIX = "array:2,0,";

/** A decoded `GameTime`: the second count, and the bytes it was read from. */
type GameTimeRead = {
	readonly width: number;
	readonly seconds: number;
};

/**
 * Bytes a framed `Int32` member occupies inside a struct: the four bytes of the
 * `nameIdx`/`typeIdx` pair the writer counts with the value, plus the value.
 *
 * `GameTime` is declared `{ m_seconds : Int32 }`, so this is the *only* size its
 * single member can carry — which is what makes the frame's shape decidable
 * rather than a guess: a `u32` of exactly this in the size field is a size, and
 * anything else is the member's value with no size field at all.
 */
const FRAMED_INT32_MEMBER = 8;

/** Bytes a `GameTime` frame is in each of its three shapes. See {@link readGameTime}. */
const GAME_TIME_EMPTY = 3;
const GAME_TIME_SIZED = 15;
const GAME_TIME_INLINE = 11;

/**
 * Does a frame of `width` bytes starting at `o` close on the `u16 0` terminator
 * the struct grammar ends with?
 *
 * A struct's members are written until a zero-length member marks the end, so a
 * candidate reading that does not land on one is not a reading. This is a
 * *necessary* condition and deliberately not a sufficient one — the stream is
 * full of zero bytes — which is why the caller also checks the known member
 * type.
 */
const runsTo = (data: Uint8Array, o: number, width: number): boolean =>
	u16(data, o + width - 2) === 0;

/**
 * Read the `GameTime` struct value at `o`: its width, and its `m_seconds`.
 *
 * `GameTime` is a class-reflection struct, not a primitive, so its width depends
 * on what the writer put in it. Measured on both fixtures — 380 populated frames
 * over the two saves — the writer emits **three** shapes, and no two of them
 * agree:
 *
 * ```
 *   empty   | 00 | 00 00                                     3 bytes
 *   sized   | 00 | u16 name | u16 type | u32 8 | i32 secs | 00 00    15 bytes
 *   inline  | 00 | u16 name | u16 type | i32 secs     | 00 00           11 bytes
 * ```
 *
 * The member header is the same in both populated shapes and both resolve to
 * `m_seconds`/`Int32` in each save's own `MANU` table (286/69 on `52586`,
 * 114/64 on `8559a`). What differs is whether the member's `u32 size` field is
 * present, and that tracks the record shape without a single exception: of the
 * 372 sized frames every one is in an `AVAL` or a `PORP`, and of the 8 inline
 * frames every one is in a `VL` or an `OP`. An `AVAL`/`PORP` declares its
 * value's length and the struct inside it is written sized; a `VL`/`OP` carries
 * no length and gets the member's value written where the size would be. The
 * inline frames are the clock values — `timeRemaining`, `time` and
 * `recentDialogOrCutsceneEndGameTime`.
 *
 * The tag **is** the discriminator, and `framed` is how it arrives. No rule over
 * the bytes alone can be: an *inline* frame holding exactly `m_seconds === 8`
 * satisfies the sized test too, because that 8 lands where the size field would
 * be and the two bytes after the member are zero. Measured — choosing sized there
 * reports the frame as 15 bytes wide and reads four bytes past it, so the
 * following token disappears and every token after it shifts. That is the silent
 * desynchronisation this walker must never do, and it is not hypothetical: it was
 * reproduced by constructing the frame.
 *
 * `framed` is `true` for an `AVAL`/`PORP` value, `false` for a `VL`/`OP` value,
 * and `undefined` when neither is known (a value nested inside an array or a
 * handle, which is unobserved for `GameTime`). The tag is known at every direct
 * call site, so the ambiguous case is decided by the frame rather than guessed:
 *
 *   - `true`  → the empty form, else the sized form
 *   - `false` → the empty form, else the inline form
 *   - `undefined` → the byte-level rule, as a last resort
 *
 * The byte-level rule requires the size field to be exactly
 * {@link FRAMED_INT32_MEMBER}, since the member's type is known to be `Int32`;
 * a terminator test alone is not exclusive because the stream is full of zero
 * bytes, and an inline frame whose seconds read as a size finds a `00 00` at 354
 * bytes out twice on the large fixture.
 *
 * The 11-byte inline shape is what the reference decoder's own dump of
 * `timeManger.time` shows (`docs/re-engineering/12-player-world.md`), and the
 * `m_seconds` it reads there — 2,635,781 — is the one this reads on the same
 * build, which is the cross-check that the inline shape is a clock rather than a
 * mis-parse.
 */
const readGameTime = (
	data: Uint8Array,
	o: number,
	framed?: boolean,
): GameTimeRead | undefined => {
	// A presence byte, not the value: a struct records whether it is there.
	if (u8(data, o) !== 0) return undefined;
	// Terminator straight after the presence byte: every member is at its
	// default, and an `Int32` default is zero. True of every shape, so it needs
	// no framing.
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

	// No frame to go on — only reachable for a value nested inside an array or a
	// handle. Fall back to the byte rule, sized first, and accept that an inline
	// `m_seconds === 8` is indistinguishable here.
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

/**
 * Width in bytes of a value of `type` starting at `o`, or `undefined` when the
 * type cannot be sized without the enclosing frame. Recurses through arrays and
 * handles with a depth cap so a hostile type string cannot loop.
 */
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
	// Measured, not tabulated: a struct's width is a function of its members.
	// `framed` is the enclosing record's tag, which is what decides between the
	// sized and inline `GameTime` shapes; see `readGameTime`.
	if (type === "GameTime") return readGameTime(data, o, framed)?.width;
	if (type === "StringAnsi") return 1 + u8(data, o);
	if (type === "String" || type === "CEntityTemplate") {
		const header = u8(data, o);
		if ((header & 0x80) === 0) return undefined;
		let at = o + 1;
		// The reference's documented HACK: a stray 0x01 is sometimes present.
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

/** Render a value of `type` at `o` for display. Assumes `valueWidth` succeeded. */
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
			// A struct holding one `Int32`, so the number it is worth is a
			// second count and not the bytes of the frame. `valueWidth` measured
			// those bytes to reach here, so the same reader reads the member —
			// with the same `framed`, or the two could disagree about which shape
			// they were looking at.
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
			// A byte-array value (Vector, EngineTransform, …) must render its
			// own bytes. Rendering a placeholder made every such value compare
			// equal, which silently hid it from any change/diff analysis.
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
		// `AVAL`/`PORP` declares its value's length, so a struct inside it is
		// written sized — `framed: true` is that fact, not a guess.
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
		// `SS` is a frame whose payload is further variables; the reference
		// recurses into it and the flat walk reaches them by continuing at
		// `o + 6`. Treating it as one opaque block hides the `AVAL`/`BLCK`/`PORP`
		// records inside, which is most of the stream.
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
		// `VL`/`OP` carries no length, so a struct inside it is written inline —
		// `framed: false`. This is the case a byte-level rule got wrong whenever
		// the clock happened to read 8, which desynchronised the walk.
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

/**
 * Read the single token at `offset`, or `undefined`. A thin exported wrapper
 * over the internal reader, for `objects.ts`'s span resolver: it looks each span
 * index entry up at a computed offset rather than walking, so it needs to decode
 * one token at an arbitrary position instead of scanning from the stream start.
 *
 * That resolver is why `childSize` is trusted rather than re-derived. The claim
 * it rests on was verified on the data — a `BLCK` with `a=74` is followed by
 * exactly four `AVAL`s totalling 74 bytes — by counting, over a whole save, how
 * often a frame's children summed to exactly its declared size against how often
 * they did not. The declared size is authoritative inside a container, and the
 * count of non-matches is what established that; a flat token walk cannot see
 * the question at all, which is why it was asked separately.
 */
export const readTokenAt = (
	data: Uint8Array,
	names: readonly string[],
	offset: number,
): Token | undefined => readToken(data, names, offset, new Map());

/** Where a walk may start, and how many tokens it may yield. */
type TokenScanOptions = {
	readonly from?: number;
	readonly limit?: number;
};

/**
 * Walk the token stream greedily from `from` (default 16, the end of the SAV3
 * header). Non-overlapping and left to right: a decoded token advances past its
 * own bytes, and a byte that starts no known token is skipped one at a time and
 * counted in `skippedBytes`.
 */
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
