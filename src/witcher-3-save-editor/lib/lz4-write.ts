/**
 * LZ4 block compression — the half the decoder does not need.
 *
 * The decoder next door only inflates. An editor has to deflate, because a save
 * is stored as LZ4 blocks and handing back a file of literal bytes would be a
 * file the game cannot read. So this is a compressor, written to the block
 * format rather than to any particular encoder's output.
 *
 * ## It will not reproduce the game's bytes, and that is correct
 *
 * LZ4 admits many valid encodings of the same input: a different match
 * selection produces different literals and different offsets and the same
 * result. The decoder's own note says its compressor "deliberately makes no
 * attempt to match any particular reference encoder byte for byte", and this
 * makes none either. Re-encoding an *unedited* save therefore does not
 * reproduce the original file, which is expected and harmless — what has to
 * hold is that the payload decodes back to exactly the same bytes, and that
 * only the bytes we chose to change differ. That is what the round-trip test
 * asserts, and it is the property the game actually cares about.
 *
 * A greedy single-slot hash matcher, which is what the format was designed
 * around: fast enough to run on a 5 MB payload in a browser tab, and the
 * compression ratio is within a few per cent of what it needs to be.
 */

/** A match must be at least this long to be worth a 2-byte offset. */
const MIN_MATCH = 4;
/** The final sequence must be literals only, and at least this long. */
const LAST_LITERALS = 5;
/** No match may begin within this many bytes of the end of the block. */
const MATCH_LIMIT = 12;
/** 2^16 slots, keyed on the low bits of a 4-byte sequence. */
const HASH_BITS = 16;
const HASH_SIZE = 1 << HASH_BITS;

/**
 * Emit a length in the format's variable-width form.
 *
 * A length under 15 lives entirely in the token nibble. At 15 or above the
 * nibble is saturated and the remainder follows as bytes of 255, so a run that
 * is an exact multiple of 255 needs a trailing zero — that case is why this
 * always writes at least one byte past the saturated value.
 */
const writeLength = (out: number[], length: number): void => {
	let left = length - 15;
	while (left >= 255) {
		out.push(255);
		left -= 255;
	}
	out.push(left);
};

/** Read a 4-byte sequence as a hash slot. */
const hashAt = (data: Uint8Array, at: number): number => {
	const value =
		((data[at] ?? 0) |
			((data[at + 1] ?? 0) << 8) |
			((data[at + 2] ?? 0) << 16) |
			((data[at + 3] ?? 0) << 24)) >>>
		0;
	return (value * 2654435761) >>> (32 - HASH_BITS);
};

/** How far a match at `at` against a candidate at `from` runs. */
const matchLength = (
	data: Uint8Array,
	from: number,
	at: number,
	limit: number,
): number => {
	let length = 0;
	while (at + length < limit && data[from + length] === data[at + length]) {
		length += 1;
	}
	return length;
};

/**
 * Compress one block.
 *
 * The block format has no header, no length prefix and no checksum — it is a
 * bare run of token/literal/match sequences, and the decompressed size comes
 * from the container's chunk table rather than from here.
 */
export const lz4CompressBlock = (src: Uint8Array): Uint8Array => {
	const n = src.length;
	const out: number[] = [];

	if (n < MIN_MATCH + LAST_LITERALS) {
		// Too short for a match to be legal: one literal run.
		if (n < 15) {
			out.push(n << 4);
		} else {
			out.push(15 << 4);
			writeLength(out, n);
		}
		for (const byte of src) out.push(byte);
		return Uint8Array.from(out);
	}

	// Slot → the position whose 4 bytes last hashed there. One slot per hash
	// rather than a chain: a chain compresses slightly better and costs a
	// second array and a walk, which is the wrong trade in a browser tab.
	const table = new Int32Array(HASH_SIZE).fill(-1);

	let anchor = 0;
	let at = 0;
	const limit = n - MATCH_LIMIT;

	while (at < limit) {
		const slot = hashAt(src, at);
		// `Int32Array.fill(-1)` is what marks a slot empty; the read is
		// `number | undefined` under `noUncheckedIndexedAccess`, and an unset
		// slot is exactly the case that must not be treated as a candidate.
		const candidate = table[slot] ?? -1;
		table[slot] = at;

		const offset = at - candidate;
		if (
			candidate < 0 ||
			offset <= 0 ||
			offset > 0xffff ||
			src[candidate] !== src[at] ||
			src[candidate + 1] !== src[at + 1] ||
			src[candidate + 2] !== src[at + 2] ||
			src[candidate + 3] !== src[at + 3]
		) {
			at += 1;
			continue;
		}

		const length = matchLength(src, candidate, at, limit);
		// A match shorter than MIN_MATCH costs a 2-byte offset to save nothing,
		// and encoding it is not merely wasteful: the token has no room for a
		// length below 4, so `length - MIN_MATCH` goes negative, wraps into the
		// nibble as 254, and the reader then treats the nibble as *saturated* and
		// consumes extension bytes that are not there. A two-byte match at the
		// very end of a block was enough to corrupt a whole chunk.
		if (length < MIN_MATCH) {
			at += 1;
			continue;
		}
		const literalLength = at - anchor;
		const matchCode = length - MIN_MATCH;

		if (literalLength < 15) {
			out.push((literalLength << 4) | (matchCode < 15 ? matchCode : 15));
		} else {
			out.push((15 << 4) | (matchCode < 15 ? matchCode : 15));
			writeLength(out, literalLength);
		}
		for (let i = 0; i < literalLength; i += 1) {
			out.push(src[anchor + i] ?? 0);
		}

		out.push(offset & 0xff, (offset >>> 8) & 0xff);
		// The extension encodes `length - MIN_MATCH - 15`, not `length - 15`:
		// the token nibble already carries the first 4 bytes of the match, and a
		// reader adds them back. Writing the unmatched length here makes every
		// long match decode four bytes too long, which runs it past the end of
		// the block rather than corrupting quietly.
		if (matchCode >= 15) writeLength(out, matchCode);

		// Index the interior of the match so a later sequence can find one, and
		// skip past it: overlapping matches are legal and this is what makes the
		// difference between a run of zeroes costing 3 bytes and costing its
		// whole length again.
		at += length;
		anchor = at;
		const resume = Math.max(at - 2, 0);
		for (let i = resume; i < at && i < n - 3; i += 1) {
			table[hashAt(src, i)] = i;
		}
	}

	// The tail: literals only, with no offset after them.
	const tail = n - anchor;
	if (tail < 15) {
		out.push(tail << 4);
	} else {
		out.push(15 << 4);
		writeLength(out, tail);
	}
	for (let i = anchor; i < n; i += 1) out.push(src[i] ?? 0);

	return Uint8Array.from(out);
};

/**
 * A block that encodes its input as pure literals.
 *
 * Conformant — a single token with no match after it is the format's ordinary
 * answer for incompressible data — so it needs no compressor at all. It is not
 * the default: on the reference save it costs 3.8× the file size, where
 * `lz4CompressBlock` costs slightly *less* than the original. It exists so that
 * the round-trip test can prove the container bookkeeping independently of the
 * compressor, which is the part that is genuinely easy to get wrong.
 */
export const lz4StoredBlock = (src: Uint8Array): Uint8Array => {
	const n = src.length;
	const out: number[] = [];
	if (n < 15) {
		out.push(n << 4);
	} else {
		out.push(15 << 4);
		writeLength(out, n);
	}
	for (const byte of src) out.push(byte);
	return Uint8Array.from(out);
};
