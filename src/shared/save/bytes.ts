/**
 * Byte-level primitives shared by the save editors, in the browser.
 *
 * Everything here is deliberately dependency-free and platform-native: the
 * editors exist to prove that a save can be read and rebuilt on a device with
 * no toolchain and no server, and every one of these operations has a
 * Web API that does it better and smaller than a bundled library would.
 */

import { describeError } from "./errors";

/**
 * A byte array known to be backed by a plain `ArrayBuffer`.
 *
 * Every `Uint8Array` we construct is, but the compiler cannot see that: since
 * TypeScript 5.7 the element-less `Uint8Array` means `Uint8Array<ArrayBufferLike>`,
 * which admits `SharedArrayBuffer` and is therefore rejected by WebCrypto and by
 * `WritableStream<BufferSource>`. Spelled once here so the platforms that
 * insist on a concrete `ArrayBuffer` can be satisfied without a cast at each
 * call site — a cast here would be exactly the kind that "buys silence and owes
 * the next reader a lie".
 */
export type Bytes = Uint8Array<ArrayBuffer>;

/**
 * A little-endian reader, because every format these editors read is.
 *
 * This class once declared that "big-endian is the Unreal default, so the
 * reader and writer are BE" — a claim the constructor's own JSDoc below now
 * corrects. Because no codec could trust the shared reader's byte order, each
 * of them grew a little-endian reader of its own (`LeReader`, `Cursor`,
 * `BlobReader`), which is exactly the fork this file exists to close. The
 * order is little-endian here and a format that genuinely disagrees says so
 * through the constructor rather than by writing a fourth reader.
 */
export class ByteReader {
	private offset: number;

	/**
	 * @param littleEndian Defaults to little-endian.
	 *
	 * Every binary format these editors read is little-endian: Unreal's GVAS
	 * header is, CERIMAL's is, Cyberpunk's is. (An earlier version of this
	 * class claimed big-endian was "the Unreal default" and was simply wrong —
	 * it read `SaveGameFileVersion` off a real `.sav` as 50 331 648 instead of
	 * 3.) The parameter stays so a format that genuinely disagrees can say so
	 * rather than every codec reaching for its own `DataView`.
	 */
	private readonly littleEndian: boolean;

	constructor(
		private readonly bytes: Uint8Array,
		start = 0,
		littleEndian = true,
	) {
		this.offset = start;
		this.littleEndian = littleEndian;
	}

	/** Current read position, for error messages and for the hex view. */
	get position(): number {
		return this.offset;
	}

	get remaining(): number {
		return this.bytes.length - this.offset;
	}

	get done(): boolean {
		return this.offset >= this.bytes.length;
	}

	/**
	 * Jumps the cursor to `at`, used to honour a length a format declared.
	 *
	 * Bounds-checked on both sides for the same reason every read is: a length
	 * field read out of a file is attacker-adjacent data, and a jump past the
	 * end of the buffer is a truncation this should name rather than a later
	 * read returning `undefined`.
	 */
	seek(at: number, what = "seek"): void {
		if (at < 0 || at > this.bytes.length) {
			throw new Error(
				`Cannot ${what} to ${at} in a ${this.bytes.length}-byte buffer.`,
			);
		}
		this.offset = at;
	}

	/**
	 * Bounds-checked subarray. A truncated save is the common failure and the
	 * one worth naming precisely, so this reports the offset it wanted rather
	 * than letting a `DataView` throw something opaque about the buffer.
	 */
	private require(length: number, what: string): number {
		if (this.offset + length > this.bytes.length) {
			throw new Error(
				`Truncated save: wanted ${length} byte(s) for ${what} at offset ${this.offset}, but only ${this.remaining} remain.`,
			);
		}
		const at = this.offset;
		this.offset += length;
		return at;
	}

	u8(what = "u8"): number {
		return this.bytes[this.require(1, what)] ?? 0;
	}

	i8(what = "i8"): number {
		const at = this.require(1, what);
		return this.view().getInt8(at);
	}

	u16(what = "u16"): number {
		return this.view().getUint16(this.require(2, what), this.littleEndian);
	}

	i16(what = "i16"): number {
		return this.view().getInt16(this.require(2, what), this.littleEndian);
	}

	u32(what = "u32"): number {
		return this.view().getUint32(this.require(4, what), this.littleEndian);
	}

	i32(what = "i32"): number {
		return this.view().getInt32(this.require(4, what), this.littleEndian);
	}

	u64(what = "u64"): bigint {
		return this.view().getBigUint64(this.require(8, what), this.littleEndian);
	}

	i64(what = "i64"): bigint {
		return this.view().getBigInt64(this.require(8, what), this.littleEndian);
	}

	f32(what = "f32"): number {
		return this.view().getFloat32(this.require(4, what), this.littleEndian);
	}

	f64(what = "f64"): number {
		return this.view().getFloat64(this.require(8, what), this.littleEndian);
	}

	/**
	 * `length` raw bytes, copied out so the caller cannot alias the save.
	 *
	 * Both bounds are given deliberately. `slice(at)` with one argument runs to
	 * the end of the buffer, which turned a 3-byte read into the whole rest of
	 * a 350 kB save — silent, and enormous.
	 */
	raw(length: number, what = "bytes"): Uint8Array {
		const at = this.require(length, what);
		return this.bytes.slice(at, at + length);
	}

	/**
	 * `length` raw bytes as a *borrowed* view — a `subarray`, not a copy.
	 *
	 * The counterpart to `raw`, for the one caller that must not copy: a
	 * schema's unmodelled tail is handed out so that patching it writes into
	 * the save's own buffer rather than into a temporary that is then
	 * discarded. Everything else wants `raw`, because a view outlives the
	 * reader. Named `borrow` rather than `view` because the private `view()`
	 * below builds the `DataView` the scalar reads go through.
	 */
	borrow(length: number, what = "bytes"): Uint8Array {
		const at = this.require(length, what);
		return this.bytes.subarray(at, at + length);
	}

	/** `length` bytes as Latin-1, which is how FName tables are stored. */
	latin1(length: number, what = "string"): string {
		const at = this.require(length, what);
		return new TextDecoder("latin1").decode(
			this.bytes.subarray(at, at + length),
		);
	}

	/**
	 * A UE FString: an int32 length whose sign marks UTF-16, counting a null
	 * terminator that the stored text itself does not include.
	 *
	 * The magnitude is recovered by negating when the field is negative, NOT by
	 * masking with `0x7fffffff`. JavaScript's bitwise operators work on signed
	 * 32-bit integers, so `-6 & 0x7fffffff` is 2 147 483 642, not 6 — the mask
	 * turns a six-character string into a request for two billion bytes.
	 */
	fString(what = "FString"): string {
		const field = this.i32(`${what} length`);
		const utf16 = field < 0;
		const units = (utf16 ? -field : field) - 1;
		if (units < 0) return "";
		const width = utf16 ? 2 : 1;
		const at = this.require(units * width, what);
		return new TextDecoder(utf16 ? "utf-16le" : "utf-8").decode(
			this.bytes.subarray(at, at + units * width),
		);
	}

	private view(): DataView {
		return new DataView(
			this.bytes.buffer,
			this.bytes.byteOffset,
			this.bytes.byteLength,
		);
	}
}

/**
 * The mirror of `ByteReader`, growing as it writes and defaulting to the
 * same little-endian order so a codec cannot read one way and write another.
 */
export class ByteWriter {
	private buffer: Uint8Array;
	private view: DataView;
	private offset = 0;

	private readonly littleEndian: boolean;

	constructor(capacity = 1024, littleEndian = true) {
		this.buffer = new Uint8Array(capacity);
		this.view = new DataView(this.buffer.buffer);
		this.littleEndian = littleEndian;
	}

	get length(): number {
		return this.offset;
	}

	private ensure(extra: number): void {
		if (this.offset + extra <= this.buffer.length) return;
		// The floor is the requested size, not zero. This used to double
		// `length * 2` in a `while (size < needed)` loop, which for an empty
		// writer means `size` starts at 0 and `0 * 2` is still 0 — so
		// `new ByteWriter(0)` hung the tab on its first write rather than
		// throwing. No codec passes 0 today, which is the only reason it was
		// latent rather than shipped.
		const size = Math.max(this.buffer.length * 2, this.offset + extra);
		const grown = new Uint8Array(size);
		grown.set(this.buffer);
		this.buffer = grown;
		this.view = new DataView(grown.buffer);
	}

	u8(value: number): this {
		this.ensure(1);
		this.view.setUint8(this.offset, value);
		this.offset += 1;
		return this;
	}

	i8(value: number): this {
		this.ensure(1);
		this.view.setInt8(this.offset, value);
		this.offset += 1;
		return this;
	}

	u16(value: number): this {
		this.ensure(2);
		this.view.setUint16(this.offset, value, this.littleEndian);
		this.offset += 2;
		return this;
	}

	i16(value: number): this {
		this.ensure(2);
		this.view.setInt16(this.offset, value, this.littleEndian);
		this.offset += 2;
		return this;
	}

	u32(value: number): this {
		this.ensure(4);
		this.view.setUint32(this.offset, value, this.littleEndian);
		this.offset += 4;
		return this;
	}

	i32(value: number): this {
		this.ensure(4);
		this.view.setInt32(this.offset, value, this.littleEndian);
		this.offset += 4;
		return this;
	}

	i64(value: bigint): this {
		this.ensure(8);
		this.view.setBigInt64(this.offset, value, this.littleEndian);
		this.offset += 8;
		return this;
	}

	u64(value: bigint): this {
		this.ensure(8);
		this.view.setBigUint64(this.offset, value, this.littleEndian);
		this.offset += 8;
		return this;
	}

	f32(value: number): this {
		this.ensure(4);
		this.view.setFloat32(this.offset, value, this.littleEndian);
		this.offset += 4;
		return this;
	}

	f64(value: number): this {
		this.ensure(8);
		this.view.setFloat64(this.offset, value, this.littleEndian);
		this.offset += 8;
		return this;
	}

	raw(value: Uint8Array): this {
		this.ensure(value.length);
		this.buffer.set(value, this.offset);
		this.offset += value.length;
		return this;
	}

	latin1(value: string): this {
		return this.raw(new TextEncoder().encode(value));
	}

	/**
	 * Writes a UE FString, choosing UTF-16 only when the text needs it.
	 *
	 * `TextEncoder` is UTF-8 only, so the UTF-16 branch encodes the code units
	 * by hand. Writing UTF-8 bytes behind a length flag that claims UTF-16 is
	 * the kind of bug that decodes to plausible-looking garbage rather than
	 * failing, which is exactly the failure a rebuilt save must not have.
	 */
	fString(value: string): this {
		if (/[^\x20-\x7e]/.test(value)) {
			this.i32(-((value.length + 1) | 0));
			return this.raw(utf16leBytes(value));
		}
		this.i32(value.length + 1);
		return this.raw(new TextEncoder().encode(value));
	}

	/**
	 * Rewrites a `u32` already written at absolute offset `at`.
	 *
	 * The header's lengths and a block's checksum are known only once the block
	 * they describe has been laid out, so the field is written as a placeholder
	 * and patched afterwards. `at` is absolute, not relative to the cursor.
	 */
	patchU32(at: number, value: number): void {
		this.view.setUint32(at, value, this.littleEndian);
	}

	/** Rewrites a `u64` already written, for a checksum computed in place. */
	patchU64(at: number, value: bigint): void {
		this.view.setBigUint64(at, value, this.littleEndian);
	}

	/**
	 * A borrowed view of everything written from `at` onwards.
	 *
	 * Borrowed rather than copied so a checksum can be computed over exactly
	 * the bytes just laid out without duplicating them — the caller hashes it
	 * and does not keep it.
	 */
	writtenFrom(at: number): Uint8Array {
		return this.buffer.subarray(at, this.offset);
	}

	/** A copy of the written bytes, truncated to the length actually used. */
	finish(): Uint8Array {
		return this.buffer.slice(0, this.offset);
	}
}

/** One row of the hex view: offset, hex pairs, and the ASCII gutter. */
export type HexRow = {
	readonly offset: number;
	readonly hex: readonly string[];
	readonly ascii: string;
};

const asciiOf = (byte: number): string =>
	byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : ".";

/**
 * Lays `bytes` out as fixed-width rows for the hex view.
 *
 * `limit` is not a nicety: a save is often megabytes of mostly zeroes, and
 * rendering all of it would lock the main thread for a view nobody scrolls
 * through. The editors pass a window and say so in the UI.
 */
export const toHexRows = (
	bytes: Uint8Array,
	bytesPerRow = 16,
	limit = 4096,
): readonly HexRow[] => {
	// A `bytesPerRow` of 0 makes the loop below advance by nothing and never
	// terminate — measured, it hangs rather than throwing. The one caller passes a
	// literal 16, so this is not reachable from the UI today; it is guarded because
	// the function is exported from the shared framework and a future caller
	// computing the width from a container can plausibly reach zero.
	const stride = Math.max(1, Math.floor(bytesPerRow));
	const rows: HexRow[] = [];
	const end = Math.min(bytes.length, limit);
	for (let at = 0; at < end; at += stride) {
		const slice = bytes.subarray(at, Math.min(at + stride, end));
		rows.push({
			offset: at,
			hex: [...slice].map((byte) => byte.toString(16).padStart(2, "0")),
			ascii: [...slice].map(asciiOf).join(""),
		});
	}
	return rows;
};

/** Constant-time-ish comparison for checksums, so a length check cannot leak. */
export const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (const [index, byte] of a.entries()) diff |= byte ^ (b[index] ?? 0);
	return diff === 0;
};

/**
 * The first index of `needle` in `haystack` at or after `from`, or −1.
 *
 * Python's `bytes.find(needle, start)`. A save is scanned for the 8-byte
 * sentinel that precedes every inline pointer, once per block per edit, so this
 * search sits on the hot path of every edit. Comparing the whole needle at each
 * position is `O(haystack x needle)`; testing the needle's first and last bytes
 * first rejects a position that cannot match without reading the rest, and the
 * remaining bytes are compared from the outside in so a mismatch found near an
 * end costs as little as possible. The result is the same as the naive scan —
 * this is a constant factor, not a different answer.
 */
export const indexOfBytes = (
	haystack: Uint8Array,
	needle: Uint8Array,
	from = 0,
): number => {
	if (needle.length === 0) return from <= haystack.length ? from : -1;
	const first = needle[0] ?? 0;
	const last = needle.length - 1;
	const lastByte = needle[last] ?? 0;
	outer: for (
		let start = Math.max(0, from);
		start <= haystack.length - needle.length;
		start++
	) {
		if (haystack[start] !== first) continue;
		if (haystack[start + last] !== lastByte) continue;
		for (let index = last - 1; index >= 1; index--) {
			if (haystack[start + index] !== needle[index]) continue outer;
		}
		return start;
	}
	return -1;
};

/** Lower-case hex, the form GUIDs, opaque payloads and trailing bytes use. */
export const toHex = (bytes: Uint8Array): string => {
	let out = "";
	for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
	return out;
};

/**
 * The inverse of `toHex`.
 *
 * Validated rather than lenient: a string that is not an even run of hex digits
 * is a bug in the caller or a corrupted document, and silently truncating it to
 * `NaN` bytes would write a save that no longer matches its own length fields.
 * `what` names the field so the message points at it.
 */
export const fromHex = (hex: string, what = "hex payload"): Uint8Array => {
	if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
		throw new Error(`${what} is not an even-length run of hex digits.`);
	}
	const out = new Uint8Array(hex.length / 2);
	for (let index = 0; index < out.length; index += 1) {
		out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	}
	return out;
};

/** Joins byte runs in order into one fresh array. */
export const concatBytes = (...parts: Uint8Array[]): Bytes => {
	let length = 0;
	for (const part of parts) length += part.length;
	const output = new Uint8Array(length);
	let offset = 0;
	for (const part of parts) {
		output.set(part, offset);
		offset += part.length;
	}
	return output;
};

/** First differing byte, for turning a failed round-trip into a usable message. */
export const firstDifference = (
	a: Uint8Array,
	b: Uint8Array,
): number | undefined => {
	const shared = Math.min(a.length, b.length);
	for (let index = 0; index < shared; index += 1) {
		if (a[index] !== b[index]) return index;
	}
	return a.length === b.length ? undefined : shared;
};

/**
 * UTF-16LE bytes for a string, by hand.
 *
 * `TextEncoder` is UTF-8 by specification and has no UTF-16 mode, so the UE
 * FString writer needs this. It walks code units rather than code points, which
 * is what the format stores: an astral character is two UTF-16 units and must
 * occupy two `charCodeAt` reads, and this gets that right without needing a
 * surrogate special case.
 */
export const utf16leBytes = (value: string): Uint8Array => {
	const out = new Uint8Array(value.length * 2);
	for (let index = 0; index < value.length; index += 1) {
		const unit = value.charCodeAt(index);
		out[index * 2] = unit & 0xff;
		out[index * 2 + 1] = unit >> 8;
	}
	return out;
};

/**
 * The read/write halves of a `CompressionStream` or `DecompressionStream`.
 *
 * `writable` is contravariant in its element type, so it is spelled
 * `WritableStream<BufferSource>` — the actual signature — rather than the
 * `Uint8Array` a first reading suggests. Narrowing it to `Uint8Array` is not
 * assignable, because the browser genuinely accepts any buffer source.
 */
type ByteTransform = {
	readonly readable: ReadableStream<Uint8Array>;
	readonly writable: WritableStream<BufferSource>;
};

const streamOf = async (
	bytes: Bytes,
	make: () => ByteTransform,
): Promise<Uint8Array> => {
	// A fresh transform per call: a `CompressionStream` is single-use, and
	// these helpers run again every time the user stages an edit.
	const transform = make();
	const writer = transform.writable.getWriter();
	// Feeding and draining run concurrently. Awaiting the write before reading
	// deadlocks once the input outgrows the internal queue, and save files
	// routinely do.
	const fed = (async () => {
		await writer.write(bytes);
		await writer.close();
	})();
	const reader = transform.readable.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) {
				chunks.push(value);
				total += value.length;
			}
		}
		await fed;
	} catch (cause) {
		// Inflating data that is not deflate rejects here. Reshaping it means
		// the workbench has a single error path rather than one per codec.
		throw new Error(
			`Not in the expected compressed format: ${describeError(cause)}`,
		);
	}
	const out = new Uint8Array(total);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
};

/**
 * zlib-wrapped deflate, equivalent to Node's `zlib.deflateSync`.
 *
 * The distinction is why this is a named helper rather than one `deflate`:
 * Node also offers `deflateRawSync`, the same codec *without* the 2-byte zlib
 * header and 4-byte Adler-32 trailer. A container expecting one and handed the
 * other still inflates under a permissive reader and fails inside the game.
 */
export const zlibDeflate = (bytes: Bytes): Promise<Uint8Array> =>
	streamOf(bytes, () => new CompressionStream("deflate"));

/** Inflate a zlib-wrapped stream, equivalent to `zlib.inflateSync`. */
export const zlibInflate = (bytes: Bytes): Promise<Uint8Array> =>
	streamOf(bytes, () => new DecompressionStream("deflate"));
