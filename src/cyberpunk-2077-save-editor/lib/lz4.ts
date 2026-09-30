/**
 * LZ4 block format — the compression the VASC container actually uses.
 *
 * ## Why this file exists rather than a `DecompressionStream`
 *
 * The reference implementation this codec was ported from calls
 * `lz4js.decompressBlock`, and `DecompressionStream` in every shipping browser
 * accepts exactly three formats: `deflate`, `deflate-raw` and `gzip`. There is
 * no LZ4. The `zlibInflate` helper in `src/shared/save/bytes.ts` would therefore
 * not merely compress differently — it would reject the chunks outright. So the
 * block codec is written here, in about two hundred lines, rather than pulled in
 * as a dependency the site would then have to carry.
 *
 * A *block* is the raw sequence format with no frame header, no checksum and no
 * size field: which is exactly what the container stores, because the size it
 * inflates to is already in the chunk descriptor. That is also why
 * `lz4DecompressBlock` is given `expectedSize` and treats a mismatch as an
 * error — there is nothing else in the block to check it against.
 *
 * ## The format, in full
 *
 * A block is a run of sequences. Each sequence is one token byte:
 *
 * - the high nibble is the literal length, the low nibble the match length minus
 *   four (the minimum match LZ4 encodes);
 * - a nibble of fifteen means the real value follows as a chain of 255 bytes:
 *   read one, add it, repeat while the byte was 255;
 * - the literals come next, then a two-byte little-endian offset, then — only if
 *   the match length overflowed its nibble — the extension bytes.
 *
 * Two constraints are the compressor's business and the decompressor's are not:
 * the last five bytes of a block are always literals, and no match may start
 * within the last twelve. They exist because the reference decoder needs the
 * slack; a decoder that does not care (this one) will happily read either.
 */

/** The smallest match LZ4 will encode, which is why the length is offset by 4. */
const MIN_MATCH = 4;

/** Below this length a byte loop beats a typed-array `set`, which allocates a view. */
const LITERAL_LOOP_LIMIT = 128;

/** A match copy costs one call at any length; under this a loop is cheaper. */
const MATCH_COPY_LIMIT = 24;

/**
 * Bytes a block of `size` uncompressed bytes can expand to.
 *
 * Every 255 literals costs one extra extension byte, and the token byte per
 * sequence can never make that worse, so this bound holds for any legal block.
 */
export const lz4CompressBound = (size: number): number =>
	size + Math.floor(size / 255) + 16;

/** A length read out of a nibble plus the chain that may follow it. */
type Extended = { readonly total: number; readonly cursor: number };

/**
 * Reads the 255-terminated length chain a nibble of fifteen introduces.
 *
 * `nibble` is the token's own contribution and the result is nibble plus every
 * extension byte, so a nibble of fifteen and an empty chain still yields fifteen.
 */
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

/**
 * Expands one LZ4 block that is known to hold exactly `expectedSize` bytes.
 *
 * The declared size comes from the chunk descriptor, which is part of the file
 * but is not covered by anything else — there is no checksum here — so every
 * read is bounds-checked against it and against the input rather than trusted.
 */
export const lz4DecompressBlock = (
	data: Uint8Array,
	expectedSize: number,
): Uint8Array => {
	if (!Number.isSafeInteger(expectedSize) || expectedSize < 0) {
		throw new Error("The LZ4 chunk declares an impossible size.");
	}
	// A length chain adds at most 255 bytes per byte, so a declared size beyond
	// that cannot come from this input. Checked before allocating, because the
	// number is attacker-adjacent: it came off someone's disk.
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

		// The last sequence of a block carries literals only. There is no offset.
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

/**
 * Copies `length` bytes from `offset` behind `at`, left to right.
 *
 * Overlapping matches are legal and common in LZ4 — a run of zeros compresses to
 * one literal followed by a match at offset 1 — so a `copyWithin` wide enough to
 * straddle the cursor would read bytes this match has not written yet. Copying
 * forward in short steps is the semantics the format means, and it is also what
 * the short-match case wants, since most matches move fewer bytes than the call
 * itself costs.
 */
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

/**
 * Compresses `data` into a single LZ4 block.
 *
 * A single-candidate match finder rather than a full hash chain: one 4-byte hash
 * table, one candidate per position, verified byte for byte before it is taken.
 * That costs a few per cent of ratio against the reference implementation and
 * roughly a third of the code, which is the right trade for a container that has
 * to be *correct* rather than small.
 *
 * The last five bytes are emitted as literals and no match is started within the
 * last twelve, which are the block-format rules rather than choices of this
 * implementation.
 */
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

	// `size - 12` leaves the block-format tail alone; `size >= 13` keeps a
	// 4-byte candidate readable.
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
		// Re-seed the positions the match skipped, or a repeated pattern would
		// not be found when it recurs past the table's window.
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
