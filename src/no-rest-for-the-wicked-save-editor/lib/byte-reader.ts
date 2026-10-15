import { ByteReader, ByteWriter } from "../../shared";

export class CerimalReader extends ByteReader {
	sevenBit(what = "a 7-bit integer"): number {
		let value = 0;
		let shift = 0;
		for (;;) {
			const byte = this.u8(what);
			value |= (byte & 0x7f) << shift;
			if ((byte & 0x80) === 0) return value;
			shift += 7;
			if (shift > 28) {
				throw new Error(`${what} is longer than this format allows.`);
			}
		}
	}

	name(what = "a name"): string {
		return new TextDecoder().decode(
			this.borrow(this.u8(`${what} length`), what),
		);
	}

	sevenBitName(what = "a name"): string {
		return new TextDecoder().decode(
			this.borrow(this.sevenBit(`${what} length`), what),
		);
	}
}

export class CerimalWriter extends ByteWriter {
	sevenBit(value: number): this {
		let rest = value >>> 0;
		while (rest >= 0x80) {
			this.u8((rest & 0x7f) | 0x80);
			rest = rest >>> 7;
		}
		return this.u8(rest);
	}

	name(value: string): this {
		const encoded = new TextEncoder().encode(value);
		if (encoded.length > 0xff) {
			throw new Error(
				`A CERIMAL member name is one length byte long; "${value}" is ${encoded.length} bytes.`,
			);
		}
		return this.u8(encoded.length).raw(encoded);
	}

	sevenBitName(value: string): this {
		const encoded = new TextEncoder().encode(value);
		return this.sevenBit(encoded.length).raw(encoded);
	}
}

export const formatGuid = (bytes: Uint8Array): string => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const hex = (value: number, width: number): string =>
		value.toString(16).padStart(width, "0");
	const tail = Array.from(bytes.subarray(8, 16))
		.map((byte) => hex(byte, 2))
		.join("");
	return [
		hex(view.getUint32(0, true), 8),
		hex(view.getUint16(4, true), 4),
		hex(view.getUint16(6, true), 4),
		tail.slice(0, 4),
		tail.slice(4),
	].join("-");
};

export const parseGuid = (text: string): Uint8Array => {
	const groups = text.split("-");
	if (groups.length !== 5) {
		throw new Error(`"${text}" is not a GUID.`);
	}
	const [first, second, third, fourth, fifth] = groups;
	if (
		first === undefined ||
		second === undefined ||
		third === undefined ||
		fourth === undefined ||
		fifth === undefined
	) {
		throw new Error(`"${text}" is not a GUID.`);
	}
	if (
		!/^[0-9a-fA-F]{8}$/.test(first) ||
		!/^[0-9a-fA-F]{4}$/.test(second) ||
		!/^[0-9a-fA-F]{4}$/.test(third) ||
		!/^[0-9a-fA-F]{4}$/.test(fourth) ||
		!/^[0-9a-fA-F]{12}$/.test(fifth)
	) {
		throw new Error(`"${text}" is not a GUID.`);
	}
	const bytes = new Uint8Array(16);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, Number.parseInt(first, 16), true);
	view.setUint16(4, Number.parseInt(second, 16), true);
	view.setUint16(6, Number.parseInt(third, 16), true);
	const rest = `${fourth}${fifth}`;
	for (let index = 0; index < 8; index += 1) {
		bytes[8 + index] = Number.parseInt(
			rest.slice(index * 2, index * 2 + 2),
			16,
		);
	}
	return bytes;
};
