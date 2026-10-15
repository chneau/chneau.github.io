export const readU32 = (data: Uint8Array, at: number): number | undefined => {
	if (!Number.isInteger(at) || at < 0 || at + 4 > data.length) return undefined;
	const b0 = data[at] ?? 0;
	const b1 = data[at + 1] ?? 0;
	const b2 = data[at + 2] ?? 0;
	const b3 = data[at + 3] ?? 0;
	return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
};

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

const HEADER_MAGIC = "SAV3";

export const readSaveVersion = (data: Uint8Array): string => {
	if (data.length < 16 || readAscii(data, 0, 4) !== HEADER_MAGIC) {
		return "unknown";
	}
	const codes = [readU32(data, 4), readU32(data, 8), readU32(data, 12)];
	const numbers = codes.filter((code): code is number => code !== undefined);
	return numbers.length === 3 ? numbers.join("/") : "unknown";
};

const FOOTER_MAGIC = "SE";

type SaveFooter = {
	readonly magic: string;
	readonly variableTableOffset: number;
	readonly trailing: Uint8Array;
};

export const readFooter = (data: Uint8Array): SaveFooter => {
	for (let at = data.length - 2; at >= 0; at -= 1) {
		if (data[at] !== 0x53 || data[at + 1] !== 0x45) continue;
		return {
			magic: FOOTER_MAGIC,
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
