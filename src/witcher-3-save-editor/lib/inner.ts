/**
 * The inner `SAV3` stream: everything that lives inside the *concatenated,
 * decompressed* payload, before the token grammar is understood.
 *
 * Input to this layer is one `Uint8Array` — the LZ4 blocks of a `.sav` run
 * together (15,490,509 bytes for the reference sample). Chunks are a storage
 * boundary and not a semantic one — strings straddle chunk edges — so the
 * container layer must concatenate before anything here is called.
 *
 * Offsets in this module are **absolute offsets into that decompressed stream**,
 * never offsets into the file on disk.
 *
 * The layout below is measured against the reference save and asserted by the
 * source repository's test suite, not taken from published tooling:
 *
 * ```
 *   0..3    "SAV3"
 *   4..7    u32 typecode1 = 64
 *   8..11   u32 typecode2 = 27
 *  12..15   u32 typecode3 = 163
 *  16..     token stream begins: BS c1 01 VL c9 01 11 00 ...
 *  27..45  "game\witcher3.red"
 *
 *  len-6   u32 variableTableOffset = 13887471
 *  len-2   "SE"
 * ```
 *
 * The three typecodes are version-dependent — published tooling carries
 * (54, 10, 162) and has disabled its own assertion over them. **Nothing asserts
 * on them**, and nothing should: a hard check would reject a valid newer save.
 * Nothing reads them here either, because no consumer of this module wants them;
 * the layout is recorded so that a future header reader need not re-derive it,
 * and so that the constant 16 is not mistaken for a field the file states. It is
 * not — 4 + 3 * 4 = 16 for every save in this format, which is why `tokens.ts`
 * starts its walk there rather than reading the offset from anywhere.
 *
 * The reads here are deliberately *not* the shared `ByteReader`. The inner
 * stream is a different byte space from the file on disk (it is the
 * decompressed payload), and a cursor throws on absence whereas every call in
 * this layer — a `u32` probed at a candidate magic — treats "past the end" as an
 * ordinary answer that a caller decides what to do with. A truncated or hostile
 * save must not take the process down.
 */

/** Little-endian u32, or `undefined` when `at..at+4` is not inside `data`. */
export const readU32 = (data: Uint8Array, at: number): number | undefined => {
	if (!Number.isInteger(at) || at < 0 || at + 4 > data.length) return undefined;
	// Assembled by hand rather than via DataView so that a `Uint8Array` which is
	// a *view* onto a larger buffer (byteOffset != 0) still reads correctly.
	const b0 = data[at] ?? 0;
	const b1 = data[at + 1] ?? 0;
	const b2 = data[at + 2] ?? 0;
	const b3 = data[at + 3] ?? 0;
	return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
};

/* The signed counterpart of `readU32` used to live here, for the variable
 * table's `(i32 offset, i32 size)` pairs. That reader is gone, and with it the
 * only caller: a private function nothing reads is not an abstraction, it is a
 * `noUnusedLocals` error. Reinstating it is four lines when a signed field
 * needs reading again. */

/**
 * Decode `length` bytes at `at` as latin-1.
 *
 * `Uint8Array.prototype.toString()` is *not* used anywhere in this layer. It
 * ignores its argument entirely and returns a comma-joined list of decimal byte
 * values, which is how an earlier draft of this work concluded that a Witcher 3
 * save "contains CSV text". The bytes here are latin-1 by construction: the
 * engine stores 7-bit ASCII, and latin-1 is the one encoding that maps every
 * byte value to a character without loss and without throwing.
 *
 * Chunked rather than spread into a single `String.fromCharCode(...bytes)`,
 * because this helper is also used on long runs and a spread past the argument
 * limit is a `RangeError` at runtime that no typechecker warns about.
 */
export const readAscii = (
	data: Uint8Array,
	at: number,
	length: number,
): string => {
	let out = "";
	const end = Math.min(at + length, data.length);
	for (let i = at; i < end; i += 32) {
		out += String.fromCharCode(...data.subarray(i, Math.min(i + 32, end)));
	}
	return out;
};

/** Magic at the very end of the decompressed stream. */
const FOOTER_MAGIC = "SE";

type SaveFooter = {
	readonly magic: string;
	readonly variableTableOffset: number;
	/** any bytes after "SE" (normally none) */
	readonly trailing: Uint8Array;
};

/**
 * Read the footer.
 *
 * The magic is located by walking *backwards from the end of the buffer*, never
 * forwards. `"SE"` occurs 888 times in the 15 MB reference stream and `0x53`
 * occurs 6,365 times as the leading byte of an `RB` token, so a forward scan
 * finds a "footer" at offset 141,643 and every offset read from it is then
 * meaningless. The backwards walk is anchored on EOF and finds the real magic at
 * `len - 2`; the source suite asserts both halves of that claim.
 *
 * The backwards scan (rather than a bare "read the last two bytes") is what
 * gives `trailing` meaning: a save with alignment padding after the magic is
 * still read correctly and the padding is handed back, rather than being assumed
 * away on the grounds that the reference sample happens to have none.
 */
export const readFooter = (data: Uint8Array): SaveFooter => {
	for (let at = data.length - 2; at >= 0; at -= 1) {
		if (data[at] !== 0x53 || data[at + 1] !== 0x45) continue;
		return {
			magic: FOOTER_MAGIC,
			// The variable-table offset is the u32 immediately before the magic.
			variableTableOffset: readU32(data, at - 4) ?? -1,
			trailing: data.subarray(at + 2),
		};
	}
	throw new Error(
		`no ${JSON.stringify(
			FOOTER_MAGIC,
		)} footer in ${data.length} bytes: the last two bytes are ${JSON.stringify(
			readAscii(data, Math.max(data.length - 2, 0), 2),
		)}`,
	);
};
