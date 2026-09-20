/**
 * Little-endian binary helpers shared by the TypeScript save engine.
 *
 * Port of the `struct` usage from the original Python engine. All integer
 * reads return plain `number`s except the 64-bit variants, which use `bigint`
 * so sentinel values such as `0xFFFFFFFFFFFFFFFF` stay exact.
 */

const textDecoder = new TextDecoder("utf-8");

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

export const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
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

export const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => {
	if (a.length !== b.length) return false;
	for (let index = 0; index < a.length; index++) {
		if (a[index] !== b[index]) return false;
	}
	return true;
};

/**
 * Python's `bytes.find(needle, start)`. Returns -1 when absent.
 *
 * A save is scanned for the 8-byte sentinel that precedes every inline
 * pointer, once per block per edit, so this search sits on the hot path of
 * every edit. Comparing the whole needle at each position is
 * `O(haystack x needle)`; testing the needle's last byte first rejects a
 * position that cannot match without reading the rest of the needle, and the
 * remaining bytes are compared from the outside in so a mismatch found near
 * an end costs as little as possible.
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

export const fromHex = (hex: string): Uint8Array => {
	const output = new Uint8Array(hex.length / 2);
	for (let index = 0; index < output.length; index++) {
		output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	}
	return output;
};

export const utf8DecodeBytes = (data: Uint8Array): string => {
	return textDecoder.decode(data);
};
