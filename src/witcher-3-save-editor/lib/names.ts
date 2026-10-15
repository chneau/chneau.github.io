import { readAscii, readU32 } from "./inner";

const MANU_MAGIC = "MANU";

const ENOD_MAGIC = "ENOD";

const NAME_TABLE_HEADER_BYTES = 12;

type NameTable = {
	readonly offset: number;
	readonly endOffset: number;
	readonly declaredCount: number;
	readonly names: readonly string[];
	readonly count: number;
	readonly truncated: boolean;
};

const indexOfMagic = (data: Uint8Array, magic: string, from = 0): number => {
	const needle = [...magic].map((c) => c.charCodeAt(0));
	const limit = data.length - needle.length;
	for (let at = Math.max(0, from); at <= limit; at += 1) {
		if (needle.every((byte, i) => data[at + i] === byte)) return at;
	}
	return -1;
};

const walkNameTable = (
	data: Uint8Array,
	offset: number,
	declaredCount: number,
): number => {
	let at = offset + NAME_TABLE_HEADER_BYTES;
	for (let i = 0; i < declaredCount; i += 1) {
		const length = data[at] ?? 0;
		if (length === 0) return -1;
		const start = at + 1;
		if (start + length > data.length) return -1;
		at = start + length;
	}
	return at;
};

export const readNameTable = (data: Uint8Array): NameTable => {
	const offset = indexOfMagic(data, MANU_MAGIC);
	if (offset < 0) {
		throw new Error(
			`no ${JSON.stringify(MANU_MAGIC)} name table in ${data.length} bytes`,
		);
	}
	const declaredCount = readU32(data, offset + 4) ?? 0;
	const walked = walkNameTable(data, offset, declaredCount);
	let endOffset = indexOfMagic(
		data,
		ENOD_MAGIC,
		walked >= 0 ? walked : offset + 4,
	);
	if (endOffset < 0) endOffset = indexOfMagic(data, ENOD_MAGIC, offset + 4);
	if (endOffset < 0) {
		throw new Error(
			`${JSON.stringify(MANU_MAGIC)} at ${offset} is not closed by ${JSON.stringify(
				ENOD_MAGIC,
			)}`,
		);
	}

	const names: string[] = [];
	let at = offset + NAME_TABLE_HEADER_BYTES;
	for (let i = 0; i < declaredCount && at < endOffset; i += 1) {
		const length = data[at] ?? 0;
		if (length === 0) break;
		const start = at + 1;
		if (start + length > endOffset) break;
		names.push(readAscii(data, start, length));
		at = start + length;
	}

	return {
		offset,
		endOffset,
		declaredCount,
		names,
		count: names.length,
		truncated: names.length !== declaredCount,
	};
};
