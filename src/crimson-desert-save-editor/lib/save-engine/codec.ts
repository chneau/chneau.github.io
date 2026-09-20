/**
 * TypeScript port of `public/save-codec.mjs`: ChaCha20 and raw LZ4.
 *
 * The byte-level behaviour (including the conservative safety checks) matches
 * the original JavaScript implementation so existing saves decode identically.
 * SPDX-License-Identifier: MPL-2.0
 */

import { readU32 } from "./bytes";

/**
 * One 64-byte ChaCha20 block, written into `state` as finished keystream words
 * (the rounds plus the original words), so callers only have to XOR them in.
 * `initial` is left untouched, except that the caller advances its counter.
 *
 * All 16 working words live in locals for the whole double round. Driving this
 * through a `Uint32Array` instead costs ~1280 indexed reads and writes per block
 * — 160 quarter rounds times 8 accesses — which dominated the cipher; with the
 * words in locals a block runs about twice as fast. The rotations are inlined
 * for the same reason. Each group below is the canonical quarter round
 * `a += b; d = rotl(d ^ a, 16); c += d; b = rotl(b ^ c, 12); a += b;
 * d = rotl(d ^ a, 8); c += d; b = rotl(b ^ c, 7);` on the named words.
 */
const chachaBlock = (state: Uint32Array, initial: Uint32Array): void => {
	let x0 = initial[0] ?? 0;
	let x1 = initial[1] ?? 0;
	let x2 = initial[2] ?? 0;
	let x3 = initial[3] ?? 0;
	let x4 = initial[4] ?? 0;
	let x5 = initial[5] ?? 0;
	let x6 = initial[6] ?? 0;
	let x7 = initial[7] ?? 0;
	let x8 = initial[8] ?? 0;
	let x9 = initial[9] ?? 0;
	let x10 = initial[10] ?? 0;
	let x11 = initial[11] ?? 0;
	let x12 = initial[12] ?? 0;
	let x13 = initial[13] ?? 0;
	let x14 = initial[14] ?? 0;
	let x15 = initial[15] ?? 0;
	for (let round = 0; round < 10; round++) {
		// Column rounds: (0,4,8,12) (1,5,9,13) (2,6,10,14) (3,7,11,15).
		x0 = (x0 + x4) >>> 0;
		x12 = x12 ^ x0;
		x12 = (x12 << 16) | (x12 >>> 16);
		x8 = (x8 + x12) >>> 0;
		x4 = x4 ^ x8;
		x4 = (x4 << 12) | (x4 >>> 20);
		x0 = (x0 + x4) >>> 0;
		x12 = x12 ^ x0;
		x12 = (x12 << 8) | (x12 >>> 24);
		x8 = (x8 + x12) >>> 0;
		x4 = x4 ^ x8;
		x4 = (x4 << 7) | (x4 >>> 25);

		x1 = (x1 + x5) >>> 0;
		x13 = x13 ^ x1;
		x13 = (x13 << 16) | (x13 >>> 16);
		x9 = (x9 + x13) >>> 0;
		x5 = x5 ^ x9;
		x5 = (x5 << 12) | (x5 >>> 20);
		x1 = (x1 + x5) >>> 0;
		x13 = x13 ^ x1;
		x13 = (x13 << 8) | (x13 >>> 24);
		x9 = (x9 + x13) >>> 0;
		x5 = x5 ^ x9;
		x5 = (x5 << 7) | (x5 >>> 25);

		x2 = (x2 + x6) >>> 0;
		x14 = x14 ^ x2;
		x14 = (x14 << 16) | (x14 >>> 16);
		x10 = (x10 + x14) >>> 0;
		x6 = x6 ^ x10;
		x6 = (x6 << 12) | (x6 >>> 20);
		x2 = (x2 + x6) >>> 0;
		x14 = x14 ^ x2;
		x14 = (x14 << 8) | (x14 >>> 24);
		x10 = (x10 + x14) >>> 0;
		x6 = x6 ^ x10;
		x6 = (x6 << 7) | (x6 >>> 25);

		x3 = (x3 + x7) >>> 0;
		x15 = x15 ^ x3;
		x15 = (x15 << 16) | (x15 >>> 16);
		x11 = (x11 + x15) >>> 0;
		x7 = x7 ^ x11;
		x7 = (x7 << 12) | (x7 >>> 20);
		x3 = (x3 + x7) >>> 0;
		x15 = x15 ^ x3;
		x15 = (x15 << 8) | (x15 >>> 24);
		x11 = (x11 + x15) >>> 0;
		x7 = x7 ^ x11;
		x7 = (x7 << 7) | (x7 >>> 25);

		// Diagonal rounds: (0,5,10,15) (1,6,11,12) (2,7,8,13) (3,4,9,14).
		x0 = (x0 + x5) >>> 0;
		x15 = x15 ^ x0;
		x15 = (x15 << 16) | (x15 >>> 16);
		x10 = (x10 + x15) >>> 0;
		x5 = x5 ^ x10;
		x5 = (x5 << 12) | (x5 >>> 20);
		x0 = (x0 + x5) >>> 0;
		x15 = x15 ^ x0;
		x15 = (x15 << 8) | (x15 >>> 24);
		x10 = (x10 + x15) >>> 0;
		x5 = x5 ^ x10;
		x5 = (x5 << 7) | (x5 >>> 25);

		x1 = (x1 + x6) >>> 0;
		x12 = x12 ^ x1;
		x12 = (x12 << 16) | (x12 >>> 16);
		x11 = (x11 + x12) >>> 0;
		x6 = x6 ^ x11;
		x6 = (x6 << 12) | (x6 >>> 20);
		x1 = (x1 + x6) >>> 0;
		x12 = x12 ^ x1;
		x12 = (x12 << 8) | (x12 >>> 24);
		x11 = (x11 + x12) >>> 0;
		x6 = x6 ^ x11;
		x6 = (x6 << 7) | (x6 >>> 25);

		x2 = (x2 + x7) >>> 0;
		x13 = x13 ^ x2;
		x13 = (x13 << 16) | (x13 >>> 16);
		x8 = (x8 + x13) >>> 0;
		x7 = x7 ^ x8;
		x7 = (x7 << 12) | (x7 >>> 20);
		x2 = (x2 + x7) >>> 0;
		x13 = x13 ^ x2;
		x13 = (x13 << 8) | (x13 >>> 24);
		x8 = (x8 + x13) >>> 0;
		x7 = x7 ^ x8;
		x7 = (x7 << 7) | (x7 >>> 25);

		x3 = (x3 + x4) >>> 0;
		x14 = x14 ^ x3;
		x14 = (x14 << 16) | (x14 >>> 16);
		x9 = (x9 + x14) >>> 0;
		x4 = x4 ^ x9;
		x4 = (x4 << 12) | (x4 >>> 20);
		x3 = (x3 + x4) >>> 0;
		x14 = x14 ^ x3;
		x14 = (x14 << 8) | (x14 >>> 24);
		x9 = (x9 + x14) >>> 0;
		x4 = x4 ^ x9;
		x4 = (x4 << 7) | (x4 >>> 25);
	}
	state[0] = (x0 + (initial[0] ?? 0)) >>> 0;
	state[1] = (x1 + (initial[1] ?? 0)) >>> 0;
	state[2] = (x2 + (initial[2] ?? 0)) >>> 0;
	state[3] = (x3 + (initial[3] ?? 0)) >>> 0;
	state[4] = (x4 + (initial[4] ?? 0)) >>> 0;
	state[5] = (x5 + (initial[5] ?? 0)) >>> 0;
	state[6] = (x6 + (initial[6] ?? 0)) >>> 0;
	state[7] = (x7 + (initial[7] ?? 0)) >>> 0;
	state[8] = (x8 + (initial[8] ?? 0)) >>> 0;
	state[9] = (x9 + (initial[9] ?? 0)) >>> 0;
	state[10] = (x10 + (initial[10] ?? 0)) >>> 0;
	state[11] = (x11 + (initial[11] ?? 0)) >>> 0;
	state[12] = (x12 + (initial[12] ?? 0)) >>> 0;
	state[13] = (x13 + (initial[13] ?? 0)) >>> 0;
	state[14] = (x14 + (initial[14] ?? 0)) >>> 0;
	state[15] = (x15 + (initial[15] ?? 0)) >>> 0;
};

export const chacha20 = (
	data: Uint8Array,
	nonce: Uint8Array,
	key: Uint8Array,
): Uint8Array => {
	if (key.length !== 32 || nonce.length !== 16) {
		throw new Error("ChaCha20 requires a 32-byte key and 16-byte nonce");
	}
	const initial = new Uint32Array(16);
	initial.set([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]);
	for (let index = 0; index < 8; index++) {
		initial[4 + index] = readU32(key, index * 4);
	}
	for (let index = 0; index < 4; index++) {
		initial[12 + index] = readU32(nonce, index * 4);
	}
	const state = new Uint32Array(16);
	const output = new Uint8Array(data.length);
	// XOR the keystream four bytes at a time rather than one shift-and-mask per
	// byte. XOR is bitwise per byte, so reading both buffers as 32-bit words with
	// the same (host) byte order reproduces the byte-by-byte result exactly. A
	// typed-array view needs its offset to be a multiple of 4: `output` is freshly
	// allocated so it always is, and the payload subarray starts at the 0x80-byte
	// header, but a caller could still hand us a misaligned view — in which case
	// no full blocks are taken and the byte loop below handles the whole buffer.
	const fullBlocks = data.byteOffset % 4 === 0 ? data.length >>> 6 : 0;
	let start = fullBlocks * 64;
	if (fullBlocks > 0) {
		const source = new Uint32Array(
			data.buffer,
			data.byteOffset,
			fullBlocks * 16,
		);
		const target = new Uint32Array(output.buffer, 0, fullBlocks * 16);
		for (let block = 0; block < fullBlocks; block++) {
			chachaBlock(state, initial);
			const base = block * 16;
			for (let word = 0; word < 16; word++) {
				target[base + word] = (source[base + word] ?? 0) ^ (state[word] ?? 0);
			}
			initial[12] = ((initial[12] ?? 0) + 1) >>> 0;
		}
	}
	// The trailing partial block keeps the original byte-at-a-time writes: at
	// most 63 bytes, and it is the only place a partial word can occur.
	for (; start < data.length; start += 64) {
		chachaBlock(state, initial);
		for (let index = 0; index < 16; index++) {
			const stream = state[index] ?? 0;
			for (let byte = 0; byte < 4; byte++) {
				const position = start + index * 4 + byte;
				if (position >= data.length) break;
				output[position] = (data[position] ?? 0) ^ (stream >>> (byte * 8));
			}
		}
		initial[12] = ((initial[12] ?? 0) + 1) >>> 0;
	}
	return output;
};

/** Below this many bytes a literal copy is cheaper as a loop than as a view
 * plus `set`; measured crossover on real save data is ~100-128 bytes. */
const LITERAL_LOOP_LIMIT = 128;

/** Below this many bytes a match copy is cheaper as a loop than as one
 * `copyWithin` call — `copyWithin` takes indices and allocates nothing, so its
 * crossover (~24 bytes) is far lower than the literal copy's. */
const MATCH_COPY_LIMIT = 24;

/**
 * Copies `length` bytes of literals from `source[start]` into `target[at]`.
 *
 * `target.set(source.subarray(...))` allocates a typed-array view per call, and
 * LZ4 literal runs are overwhelmingly tiny: in a real save 39% of the runs are
 * zero bytes and 49% are a single byte. At those lengths the view costs far
 * more than the copy. Measured crossover is around 128 bytes — a byte loop is
 * 39x faster at one byte and still ahead at 64, while a native memcpy wins
 * above ~100 — so the loop is used below the crossover and `set` above it.
 */
const copyLiterals = (
	source: Uint8Array,
	start: number,
	length: number,
	target: Uint8Array,
	at: number,
): void => {
	if (length <= 0) return;
	if (length < LITERAL_LOOP_LIMIT) {
		for (let index = 0; index < length; index++) {
			target[at + index] = source[start + index] ?? 0;
		}
		return;
	}
	target.set(source.subarray(start, start + length), at);
};

export const lz4Decompress = (
	data: Uint8Array,
	expectedSize: number,
): Uint8Array => {
	if (!Number.isSafeInteger(expectedSize) || expectedSize < 0) {
		throw new Error("Invalid LZ4 output size");
	}
	// Each length-extension byte adds at most 255 bytes. Reject impossible
	// declared sizes before allocating from the unauthenticated header field.
	if (expectedSize > data.length * 255) {
		throw new Error("LZ4 declared size exceeds possible output");
	}
	const output = new Uint8Array(expectedSize);
	let cursor = 0;
	let end = 0;
	// The token loop is inlined (no per-token closure call): this runs once per
	// sequence across multi-megabyte payloads.
	while (cursor < data.length) {
		const token = data[cursor++] ?? 0;
		let literals = token >>> 4;
		if (literals === 15) {
			let extra: number;
			do {
				if (cursor >= data.length) throw new Error("Truncated LZ4 length");
				extra = data[cursor++] ?? 0;
				literals += extra;
			} while (extra === 255);
		}
		if (cursor + literals > data.length) {
			throw new Error("LZ4 literal sequence exceeds input");
		}
		if (end + literals > expectedSize) {
			throw new Error("LZ4 output exceeds declared size");
		}
		copyLiterals(data, cursor, literals, output, end);
		cursor += literals;
		end += literals;
		if (cursor === data.length) break;
		if (cursor + 2 > data.length) {
			throw new Error("Truncated LZ4 match offset");
		}
		const offset = (data[cursor] ?? 0) | ((data[cursor + 1] ?? 0) << 8);
		cursor += 2;
		if (!offset || offset > end) {
			throw new Error("Invalid LZ4 match offset");
		}
		let match = (token & 15) + 4;
		if ((token & 15) === 15) {
			let extra: number;
			do {
				if (cursor >= data.length) throw new Error("Truncated LZ4 length");
				extra = data[cursor++] ?? 0;
				match += extra;
			} while (extra === 255);
		}
		if (end + match > expectedSize) {
			throw new Error("LZ4 output exceeds declared size");
		}
		// Short matches dominate — 94% of sequences copy 4-32 bytes — and at those
		// lengths the copyWithin call itself costs more than the bytes it moves
		// (measured crossover ~24 bytes). A forward byte loop is cheaper there and
		// is exactly the semantics LZ4 requires for overlapping matches, because
		// it runs left to right. Longer non-overlapping matches are one memmove.
		// Longer overlapping ones replicate the pattern by copying at most
		// `offset` bytes per call, always from `offset` bytes behind the cursor:
		// that source is either pre-existing or was written by an earlier chunk
		// of this match, so the phase can never drift (a larger, "doubling"
		// chunk would read unwritten bytes — attempted and reverted).
		if (match < MATCH_COPY_LIMIT) {
			for (let index = 0; index < match; index++) {
				output[end + index] = output[end - offset + index] ?? 0;
			}
		} else if (match <= offset) {
			output.copyWithin(end, end - offset, end - offset + match);
		} else {
			let copied = 0;
			while (copied < match) {
				const chunk = Math.min(offset, match - copied);
				output.copyWithin(
					end + copied,
					end - offset + copied,
					end - offset + copied + chunk,
				);
				copied += chunk;
			}
		}
		end += match;
	}
	if (end !== expectedSize) {
		throw new Error(`LZ4 decoded ${end} bytes; expected ${expectedSize}`);
	}
	return output;
};

export const lz4Compress = (data: Uint8Array): Uint8Array => {
	const size = data.length;
	const output = new Uint8Array(size + Math.floor(size / 255) + 16);
	let end = 0;
	let anchor = 0;
	let cursor = 0;
	// A flat hash table (Fibonacci hashing over the 4-byte sequence) instead of
	// a `Map<number, number>`: same single-candidate match search, but typed-
	// array reads are an order of magnitude faster for multi-megabyte inputs.
	// Collisions are harmless: the 4-byte match is verified before extending.
	const HASH_BITS = 18;
	const table = new Int32Array(1 << HASH_BITS).fill(-1);
	const hashOf = (sequence: number): number =>
		Math.imul(sequence, 0x9e3779b1) >>> (32 - HASH_BITS);
	const appendLength = (value: number): void => {
		let remaining = value;
		while (remaining >= 255) {
			output[end++] = 255;
			remaining -= 255;
		}
		output[end++] = remaining;
	};
	while (size >= 13 && cursor <= size - 12) {
		const sequence = readU32(data, cursor);
		const slot = hashOf(sequence);
		const reference = table[slot] ?? -1;
		table[slot] = cursor;
		if (
			reference < 0 ||
			cursor - reference > 65535 ||
			readU32(data, reference) !== sequence
		) {
			cursor++;
			continue;
		}
		let matchEnd = cursor + 4;
		let referenceEnd = reference + 4;
		while (matchEnd < size - 5 && data[matchEnd] === data[referenceEnd]) {
			matchEnd++;
			referenceEnd++;
		}
		const literals = cursor - anchor;
		const match = matchEnd - cursor;
		output[end++] = (Math.min(literals, 15) << 4) | Math.min(match - 4, 15);
		if (literals >= 15) appendLength(literals - 15);
		copyLiterals(data, anchor, literals, output, end);
		end += literals;
		const offset = cursor - reference;
		output[end++] = offset & 255;
		output[end++] = offset >>> 8;
		if (match - 4 >= 15) appendLength(match - 4 - 15);
		cursor = matchEnd;
		anchor = cursor;
		for (let index = Math.max(0, cursor - 3); index < cursor; index++) {
			if (index + 4 <= size) table[hashOf(readU32(data, index))] = index;
		}
	}
	const literals = size - anchor;
	output[end++] = Math.min(literals, 15) << 4;
	if (literals >= 15) appendLength(literals - 15);
	copyLiterals(data, anchor, literals, output, end);
	end += literals;
	return output.slice(0, end);
};
