import { describeError } from "./errors";

export type Bytes = Uint8Array<ArrayBuffer>;

export class ByteReader {
	private offset: number;

	private readonly littleEndian: boolean;

	constructor(
		private readonly bytes: Uint8Array,
		start = 0,
		littleEndian = true,
	) {
		this.offset = start;
		this.littleEndian = littleEndian;
	}

	get position(): number {
		return this.offset;
	}

	get remaining(): number {
		return this.bytes.length - this.offset;
	}

	get done(): boolean {
		return this.offset >= this.bytes.length;
	}

	seek(at: number, what = "seek"): void {
		if (at < 0 || at > this.bytes.length) {
			throw new Error(
				`Cannot ${what} to ${at} in a ${this.bytes.length}-byte buffer.`,
			);
		}
		this.offset = at;
	}

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

	raw(length: number, what = "bytes"): Uint8Array {
		const at = this.require(length, what);
		return this.bytes.slice(at, at + length);
	}

	borrow(length: number, what = "bytes"): Uint8Array {
		const at = this.require(length, what);
		return this.bytes.subarray(at, at + length);
	}

	latin1(length: number, what = "string"): string {
		const at = this.require(length, what);
		return new TextDecoder("latin1").decode(
			this.bytes.subarray(at, at + length),
		);
	}

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

	fString(value: string): this {
		if (/[^\x20-\x7e]/.test(value)) {
			this.i32(-((value.length + 1) | 0));
			return this.raw(utf16leBytes(value));
		}
		this.i32(value.length + 1);
		return this.raw(new TextEncoder().encode(value));
	}

	patchU32(at: number, value: number): void {
		this.view.setUint32(at, value, this.littleEndian);
	}

	patchU64(at: number, value: bigint): void {
		this.view.setBigUint64(at, value, this.littleEndian);
	}

	writtenFrom(at: number): Uint8Array {
		return this.buffer.subarray(at, this.offset);
	}

	finish(): Uint8Array {
		return this.buffer.slice(0, this.offset);
	}
}

export type HexRow = {
	readonly offset: number;
	readonly hex: readonly string[];
	readonly ascii: string;
};

const asciiOf = (byte: number): string =>
	byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : ".";

export const toHexRows = (
	bytes: Uint8Array,
	bytesPerRow = 16,
	limit = 4096,
): readonly HexRow[] => {
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

export const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (const [index, byte] of a.entries()) diff |= byte ^ (b[index] ?? 0);
	return diff === 0;
};

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

export const toHex = (bytes: Uint8Array): string => {
	let out = "";
	for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
	return out;
};

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

export const utf16leBytes = (value: string): Uint8Array => {
	const out = new Uint8Array(value.length * 2);
	for (let index = 0; index < value.length; index += 1) {
		const unit = value.charCodeAt(index);
		out[index * 2] = unit & 0xff;
		out[index * 2 + 1] = unit >> 8;
	}
	return out;
};

type ByteTransform = {
	readonly readable: ReadableStream<Uint8Array>;
	readonly writable: WritableStream<BufferSource>;
};

const streamOf = async (
	bytes: Bytes,
	make: () => ByteTransform,
): Promise<Uint8Array> => {
	const transform = make();
	const writer = transform.writable.getWriter();
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

export const zlibDeflate = (bytes: Bytes): Promise<Uint8Array> =>
	streamOf(bytes, () => new CompressionStream("deflate"));

export const zlibInflate = (bytes: Bytes): Promise<Uint8Array> =>
	streamOf(bytes, () => new DecompressionStream("deflate"));
