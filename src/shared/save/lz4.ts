const MIN_MATCH = 4;

const LITERAL_LOOP_LIMIT = 128;

const MATCH_COPY_LIMIT = 24;

export const lz4CompressBound = (size: number): number =>
	size + Math.floor(size / 255) + 16;

type Extended = { readonly total: number; readonly cursor: number };

const readExtended = (
	data: Uint8Array,
	at: number,
	nibble: number,
): Extended => {
	let cursor = at;
	let total = nibble;
	for (;;) {
		if (cursor >= data.length) throw new Error("Truncated LZ4 length chain.");
		const byte = data[cursor] ?? 0;
		cursor += 1;
		total += byte;
		if (byte !== 255) return { total, cursor };
	}
};

export const lz4DecompressBlock = (
	data: Uint8Array,
	expectedSize: number,
): Uint8Array => {
	if (!Number.isSafeInteger(expectedSize) || expectedSize < 0) {
		throw new Error("The LZ4 chunk declares an impossible size.");
	}
	if (expectedSize > data.length * 255) {
		throw new Error("The LZ4 chunk declares more output than it can hold.");
	}
	const output = new Uint8Array(expectedSize);
	let cursor = 0;
	let end = 0;

	while (cursor < data.length) {
		const token = data[cursor] ?? 0;
		cursor += 1;

		let literals = token >>> 4;
		if (literals === 15) {
			const extended = readExtended(data, cursor, literals);
			literals = extended.total;
			cursor = extended.cursor;
		}
		if (cursor + literals > data.length) {
			throw new Error("An LZ4 literal run runs past the end of the chunk.");
		}
		if (end + literals > expectedSize) {
			throw new Error("An LZ4 chunk inflates past the size it declared.");
		}
		if (literals < LITERAL_LOOP_LIMIT) {
			for (let index = 0; index < literals; index += 1) {
				output[end + index] = data[cursor + index] ?? 0;
			}
		} else {
			output.set(data.subarray(cursor, cursor + literals), end);
		}
		cursor += literals;
		end += literals;

		if (cursor === data.length) break;

		if (cursor + 2 > data.length) {
			throw new Error("An LZ4 match offset is truncated.");
		}
		const offset = (data[cursor] ?? 0) | ((data[cursor + 1] ?? 0) << 8);
		cursor += 2;
		if (offset === 0 || offset > end) {
			throw new Error("An LZ4 match points outside the output written so far.");
		}

		let match = (token & 15) + MIN_MATCH;
		if ((token & 15) === 15) {
			const extended = readExtended(data, cursor, match);
			match = extended.total;
			cursor = extended.cursor;
		}
		if (end + match > expectedSize) {
			throw new Error("An LZ4 chunk inflates past the size it declared.");
		}

		copyMatch(output, end, offset, match);
		end += match;
	}

	if (end !== expectedSize) {
		throw new Error(
			`This LZ4 chunk inflated to ${end} bytes, but its descriptor declares ${expectedSize}.`,
		);
	}
	return output;
};

const copyMatch = (
	output: Uint8Array,
	at: number,
	offset: number,
	length: number,
): void => {
	if (length < MATCH_COPY_LIMIT || offset < MATCH_COPY_LIMIT) {
		for (let index = 0; index < length; index += 1) {
			output[at + index] = output[at - offset + index] ?? 0;
		}
		return;
	}
	let copied = 0;
	while (copied < length) {
		const step = Math.min(offset, length - copied);
		output.copyWithin(
			at + copied,
			at - offset + copied,
			at - offset + copied + step,
		);
		copied += step;
	}
};

export const lz4CompressBlock = (data: Uint8Array): Uint8Array => {
	const size = data.length;
	const output = new Uint8Array(lz4CompressBound(size));
	let end = 0;
	let anchor = 0;
	let cursor = 0;

	const HASH_BITS = 18;
	const table = new Int32Array(1 << HASH_BITS).fill(-1);
	const slotOf = (sequence: number): number =>
		Math.imul(sequence, 0x9e3779b1) >>> (32 - HASH_BITS);
	const wordAt = (at: number): number =>
		(data[at] ?? 0) |
		((data[at + 1] ?? 0) << 8) |
		((data[at + 2] ?? 0) << 16) |
		((data[at + 3] ?? 0) << 24);
	const appendLength = (value: number): void => {
		let remaining = value;
		while (remaining >= 255) {
			output[end] = 255;
			end += 1;
			remaining -= 255;
		}
		output[end] = remaining;
		end += 1;
	};
	const appendLiterals = (length: number): void => {
		if (length < LITERAL_LOOP_LIMIT) {
			for (let index = 0; index < length; index += 1) {
				output[end + index] = data[anchor + index] ?? 0;
			}
			end += length;
			return;
		}
		output.set(data.subarray(anchor, anchor + length), end);
		end += length;
	};

	while (size >= 13 && cursor <= size - 12) {
		const sequence = wordAt(cursor);
		const slot = slotOf(sequence);
		const candidate = table[slot] ?? -1;
		table[slot] = cursor;
		if (
			candidate < 0 ||
			cursor - candidate > 0xffff ||
			wordAt(candidate) !== sequence
		) {
			cursor += 1;
			continue;
		}

		let matchEnd = cursor + MIN_MATCH;
		let candidateEnd = candidate + MIN_MATCH;
		while (matchEnd < size - 5 && data[matchEnd] === data[candidateEnd]) {
			matchEnd += 1;
			candidateEnd += 1;
		}

		const literals = cursor - anchor;
		const match = matchEnd - cursor;
		output[end] =
			(Math.min(literals, 15) << 4) | Math.min(match - MIN_MATCH, 15);
		end += 1;
		if (literals >= 15) appendLength(literals - 15);
		appendLiterals(literals);
		const offset = cursor - candidate;
		output[end] = offset & 0xff;
		output[end + 1] = (offset >>> 8) & 0xff;
		end += 2;
		if (match - MIN_MATCH >= 15) appendLength(match - MIN_MATCH - 15);

		cursor = matchEnd;
		anchor = cursor;
		for (let index = Math.max(0, cursor - 3); index < cursor; index += 1) {
			table[slotOf(wordAt(index))] = index;
		}
	}

	const literals = size - anchor;
	output[end] = Math.min(literals, 15) << 4;
	end += 1;
	if (literals >= 15) appendLength(literals - 15);
	appendLiterals(literals);
	return output.slice(0, end);
};

export const lz4StoredBlock = (data: Uint8Array): Uint8Array => {
	const output = new Uint8Array(lz4CompressBound(data.length));
	let end = 0;
	const appendLength = (value: number): void => {
		let remaining = value;
		while (remaining >= 255) {
			output[end] = 255;
			end += 1;
			remaining -= 255;
		}
		output[end] = remaining;
		end += 1;
	};
	output[end] = Math.min(data.length, 15) << 4;
	end += 1;
	if (data.length >= 15) appendLength(data.length - 15);
	output.set(data, end);
	end += data.length;
	return output.slice(0, end);
};
