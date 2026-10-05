/**
 * LZ4 *block* format, which is what the Witcher 3 container actually stores.
 *
 * The distinction matters: a block is a bare sequence of token/literal/match
 * runs with no frame header, no checksums and no length prefix. There is no
 * magic to sniff and no size field to read, so the caller must already know how
 * many bytes the block is meant to produce. That is why
 * `lz4DecompressBlock` takes `expectedSize` and treats a short or long result
 * as a corrupt block rather than as a stream that has simply ended — in a
 * framed LZ4 file a size mismatch is odd, in a bare block it is the only error
 * signal there is.
 *
 * A sequence is a token byte, then literals, then an optional match:
 *
 *   token      high nibble: literal length, 15 meaning "read more below"
 *              low nibble:  match length - 4,  15 meaning "read more below"
 *   [len ext]  255-chained extra literal length bytes, if the high nibble was 15
 *   literals   the literal bytes themselves
 *   [offset]   u16 little-endian, backwards distance into the output so far
 *   [len ext]  255-chained extra match length bytes, if the low nibble was 15
 *
 * The final sequence of a block carries literals and no match — the stream ends
 * after its literals, so a decoder that assumes another offset follows will run
 * off the end of the input.
 *
 * Only the decoder is here. The upstream repository also carried a greedy
 * single-slot compressor, but its only consumer was its own round-trip test:
 * nothing in a save *editor* has written a `.sav` yet, and a second
 * implementation that can be subtly wrong buys nothing until it does.
 */

/** Shortest match LZ4 can encode; the low nibble is the length above this. */
const MIN_MATCH = 4;
/** A token nibble of 15 means "at least this much, read the extension bytes". */
const NIBBLE_RUN = 15;

/**
 * Decode one raw LZ4 block that is known to expand to `expectedSize` bytes.
 *
 * Two invariants, both of which a decoder that is merely "close enough" breaks
 * in ways that surface much later as a plausible-looking save:
 *
 *  - No read may pass the end of `src`. A truncated block must throw here, not
 *    read whatever follows it in the enclosing file.
 *  - The output must be exactly `expectedSize`. Overrunning the output is
 *    refused while it happens; coming up short is refused at the end.
 */
export const lz4DecompressBlock = (
	src: Uint8Array,
	expectedSize: number,
): Uint8Array => {
	if (expectedSize < 0) {
		throw new Error(`lz4: negative expected size ${expectedSize}`);
	}
	const dst = new Uint8Array(expectedSize);
	const srcLength = src.length;
	let ip = 0;
	let op = 0;

	/** Claim `length` input bytes, or throw. */
	const need = (length: number, what: string): number => {
		if (length < 0 || ip + length > srcLength) {
			throw new Error(
				`lz4: truncated block — ${what} wants ${length} byte(s) at input offset ${ip} of ${srcLength}`,
			);
		}
		const start = ip;
		ip += length;
		return start;
	};

	/** Room for `length` output bytes, or throw. */
	const room = (length: number, what: string): void => {
		if (op + length > expectedSize) {
			throw new Error(
				`lz4: ${what} of ${length} byte(s) overruns the declared output size of ${expectedSize}`,
			);
		}
	};

	const readLength = (what: string): number => {
		let length = 0;
		for (;;) {
			const extra = src[need(1, `${what} length`)] ?? 0;
			length += extra;
			if (extra !== 255) return length;
			if (length > expectedSize) {
				throw new Error(
					`lz4: ${what} length is already ${length} bytes, past the declared output size of ${expectedSize}`,
				);
			}
		}
	};

	while (ip < srcLength) {
		const token = src[need(1, "token")] ?? 0;
		let literalLength = token >> 4;
		if (literalLength === NIBBLE_RUN) literalLength += readLength("literal");

		room(literalLength, "a literal run");
		const literalStart = need(literalLength, "a literal run");
		for (let i = 0; i < literalLength; i += 1) {
			dst[op + i] = src[literalStart + i] ?? 0;
		}
		op += literalLength;

		// The last sequence of a block is literals only, and the input ends
		// there. Reading an offset past the end is the classic LZ4 block bug.
		if (ip >= srcLength) break;

		const offset =
			(src[need(1, "match offset")] ?? 0) |
			((src[need(1, "match offset")] ?? 0) << 8);
		if (offset === 0 || offset > op) {
			throw new Error(
				`lz4: match offset ${offset} at input offset ${
					ip - 2
				} reaches outside the ${op} byte(s) decoded so far`,
			);
		}

		let matchLength = token & 0x0f;
		if (matchLength === NIBBLE_RUN) matchLength += readLength("match");
		matchLength += MIN_MATCH;

		room(matchLength, "a match");
		// Copied a byte at a time, not in runs: an overlapping match (offset
		// shorter than the length) is legal and is the whole reason a
		// "repeating pattern" block compresses at all, so each source byte may
		// be one this loop has just written.
		const from = op - offset;
		for (let i = 0; i < matchLength; i += 1) {
			dst[op + i] = dst[from + i] ?? 0;
		}
		op += matchLength;
	}

	if (op !== expectedSize) {
		throw new Error(
			`lz4: block decoded to ${op} byte(s) but the chunk table declares ${expectedSize}`,
		);
	}
	return dst;
};
