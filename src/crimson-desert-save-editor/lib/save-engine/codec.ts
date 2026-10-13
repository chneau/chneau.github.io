/**
 * ChaCha20 for the Crimson Desert container, ported byte-for-byte from the
 * original JavaScript implementation (including its conservative behaviour) so
 * existing saves decode identically. The raw LZ4 block codec is shared and
 * imported from `src/shared/save/lz4.ts`.
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

/*
 * The raw LZ4 block codec used to be a second copy here, beside the one the
 * other editors share (`src/shared/save/lz4.ts`). A differential run over 207
 * inputs — the empty block, incompressible noise, a repeating run and 200
 * pseudo-random buffers — showed the two compressors byte-identical and each
 * decompressor able to read the other's output, so the copy is gone: the
 * container imports the shared implementation, and ChaCha20 below is the only
 * thing unique to this format. Fixes to the LZ4 safety checks now land once.
 */
