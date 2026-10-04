/**
 * The CERIMAL byte plumbing: the shared little-endian reader and writer with
 * the three accessors this format adds, and the GUID text both directions.
 *
 * Split out of `format.ts` unchanged.
 */
import { ByteReader, ByteWriter } from "../../shared";

// ---------------------------------------------------------------------------
// Little-endian byte plumbing
// ---------------------------------------------------------------------------

/**
 * The CERIMAL reader: the shared little-endian `ByteReader` plus the three
 * accessors that are this format's own — its variable-length integer, and the
 * two length-prefixed names built on it.
 *
 * Everything generic (bounds-checked reads, `seek`, the borrowed `borrow`) is
 * inherited, so this is a subclass rather than the standalone copy it once was.
 * The old class existed only because the shared reader's JSDoc wrongly claimed
 * big-endian; it is little-endian, which is what CERIMAL is, so the fork is no
 * longer needed.
 */
export class CerimalReader extends ByteReader {
	/**
	 * The format's variable-length integer: seven payload bits per byte, the
	 * high bit set on every byte but the last. Used for lengths, counts, array
	 * dimensions and node tags.
	 */
	sevenBit(what = "a 7-bit integer"): number {
		let value = 0;
		let shift = 0;
		for (;;) {
			const byte = this.u8(what);
			// `|=` rather than `+=`, because a shift past 31 contributes
			// nothing and would silently truncate a large count.
			value |= (byte & 0x7f) << shift;
			if ((byte & 0x80) === 0) return value;
			shift += 7;
			if (shift > 28) {
				throw new Error(`${what} is longer than this format allows.`);
			}
		}
	}

	/** A length byte then that many UTF-8 bytes: a member or variant name. */
	name(what = "a name"): string {
		return new TextDecoder().decode(
			this.borrow(this.u8(`${what} length`), what),
		);
	}

	/** A 7-bit length then that many UTF-8 bytes: a type name. */
	sevenBitName(what = "a name"): string {
		return new TextDecoder().decode(
			this.borrow(this.sevenBit(`${what} length`), what),
		);
	}
}

/**
 * The CERIMAL writer: the shared little-endian `ByteWriter` plus the same three
 * format-specific accessors. `patchU32`, `patchU64` and `writtenFrom` — needed
 * to back-fill the header's lengths and the checksum, which are known only once
 * the body is laid out — are in the shared class.
 */
export class CerimalWriter extends ByteWriter {
	sevenBit(value: number): this {
		let rest = value >>> 0;
		while (rest >= 0x80) {
			this.u8((rest & 0x7f) | 0x80);
			rest = rest >>> 7;
		}
		return this.u8(rest);
	}

	/** A length byte then the UTF-8 bytes, which is how the schema stores names. */
	name(value: string): this {
		const encoded = new TextEncoder().encode(value);
		if (encoded.length > 0xff) {
			throw new Error(
				`A CERIMAL member name is one length byte long; "${value}" is ${encoded.length} bytes.`,
			);
		}
		return this.u8(encoded.length).raw(encoded);
	}

	/** A 7-bit length then the UTF-8 bytes: how a type name is stored. */
	sevenBitName(value: string): this {
		const encoded = new TextEncoder().encode(value);
		return this.sevenBit(encoded.length).raw(encoded);
	}
}

/**
 * The 16 raw bytes of a GUID as the text .NET prints it.
 *
 * .NET's `Guid` is mixed-endian — the first three groups are little-endian — and
 * every tool that reads a game save has to reproduce that, or every identifier
 * in the inspector is subtly wrong.
 */
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

/** The inverse of `formatGuid`, for writing an identifier the user has edited. */
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
	// The first three groups are stored little-endian; the rest as they read.
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
