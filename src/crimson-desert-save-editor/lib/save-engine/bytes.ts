/**
 * Little-endian binary helpers shared by the TypeScript save engine.
 *
 * Port of the `struct` usage from the original Python engine. All integer
 * reads return plain `number`s except the 64-bit variants, which use `bigint`
 * so sentinel values such as `0xFFFFFFFFFFFFFFFF` stay exact.
 *
 * The accessors here are deliberately unchecked: Python's `struct.unpack_from`
 * raises on a short buffer, but the port replaced that with `?? 0` so the read
 * helpers stay branch-free on the hot parse path. That makes an out-of-bounds
 * read *silent*, so every parser must establish that its range is in bounds
 * first — `requireBytes` below is the boundary check to use. Corruption that
 * slips past it is caught as a parse error rather than as a bogus value.
 */

const textDecoder = new TextDecoder("utf-8");

/**
 * Whether `[offset, offset + size)` lies fully inside `data`.
 *
 * Parsers call this before a run of reads so a truncated or hostile payload
 * fails loudly instead of being silently misread as zeros.
 */
export const hasBytes = (
	data: Uint8Array,
	offset: number,
	size: number,
): boolean =>
	Number.isInteger(offset) &&
	Number.isInteger(size) &&
	offset >= 0 &&
	size >= 0 &&
	offset + size <= data.length;

/**
 * Throws a `RangeError` when `[offset, offset + size)` is not fully inside
 * `data`. `context` names the field, so the message a user sees points at what
 * was being read when the payload ran out.
 */
export const requireBytes = (
	data: Uint8Array,
	offset: number,
	size: number,
	context: string,
): void => {
	if (!hasBytes(data, offset, size)) {
		throw new RangeError(
			`${context} at 0x${Math.max(0, offset)
				.toString(16)
				.toUpperCase()} needs ${size} bytes but only ${Math.max(
				0,
				data.length - offset,
			)} remain`,
		);
	}
};

export const readU8 = (data: Uint8Array, offset: number): number => {
	return data[offset] ?? 0;
};

export const readU16 = (data: Uint8Array, offset: number): number => {
	return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8);
};

export const readI16 = (data: Uint8Array, offset: number): number => {
	const value = readU16(data, offset);
	return value >= 0x8000 ? value - 0x10000 : value;
};

export const readU32 = (data: Uint8Array, offset: number): number => {
	return (
		((data[offset] ?? 0) |
			((data[offset + 1] ?? 0) << 8) |
			((data[offset + 2] ?? 0) << 16) |
			((data[offset + 3] ?? 0) << 24)) >>>
		0
	);
};

export const readI32 = (data: Uint8Array, offset: number): number => {
	return readU32(data, offset) | 0;
};

export const readU64 = (data: Uint8Array, offset: number): bigint => {
	let value = 0n;
	for (let index = 7; index >= 0; index--) {
		value = (value << 8n) | BigInt(data[offset + index] ?? 0);
	}
	return value;
};

export const readI64 = (data: Uint8Array, offset: number): bigint => {
	const value = readU64(data, offset);
	return value >= 0x8000000000000000n ? value - 0x10000000000000000n : value;
};

export const readF32 = (data: Uint8Array, offset: number): number => {
	return new DataView(data.buffer, data.byteOffset + offset, 4).getFloat32(
		0,
		true,
	);
};

export const readF64 = (data: Uint8Array, offset: number): number => {
	return new DataView(data.buffer, data.byteOffset + offset, 8).getFloat64(
		0,
		true,
	);
};

export const writeU8 = (
	data: Uint8Array,
	offset: number,
	value: number,
): void => {
	data[offset] = value & 0xff;
};

export const writeU16 = (
	data: Uint8Array,
	offset: number,
	value: number,
): void => {
	data[offset] = value & 0xff;
	data[offset + 1] = (value >>> 8) & 0xff;
};

export const writeU32 = (
	data: Uint8Array,
	offset: number,
	value: number,
): void => {
	data[offset] = value & 0xff;
	data[offset + 1] = (value >>> 8) & 0xff;
	data[offset + 2] = (value >>> 16) & 0xff;
	data[offset + 3] = (value >>> 24) & 0xff;
};

export const writeU64 = (
	data: Uint8Array,
	offset: number,
	value: bigint,
): void => {
	let remaining = BigInt.asUintN(64, value);
	for (let index = 0; index < 8; index++) {
		data[offset + index] = Number(remaining & 0xffn);
		remaining >>= 8n;
	}
};

export const writeI64 = (
	data: Uint8Array,
	offset: number,
	value: bigint,
): void => {
	writeU64(data, offset, value);
};

/** Packs an integer into the 8-byte little-endian form the save uses. */
export const packU64 = (value: number | bigint): Uint8Array => {
	const buffer = new Uint8Array(8);
	writeU64(buffer, 0, BigInt(value));
	return buffer;
};

/**
 * The generic byte helpers now come from `shared/save/bytes.ts`, so this engine
 * keeps one implementation rather than its own copy. They are re-exported here
 * because every consumer in this app imports them from './bytes' alongside the
 * offset-based readers below, and splitting that import for no behavioural
 * reason would be churn. `fromHex` is the validating one: an odd-length or
 * non-hex string throws instead of silently producing `NaN` bytes.
 */
export {
	bytesEqual,
	concatBytes,
	fromHex,
	indexOfBytes,
} from "../../../shared/save/bytes";

export const utf8DecodeBytes = (data: Uint8Array): string => {
	return textDecoder.decode(data);
};
