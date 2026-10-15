import { readU32 } from "./bytes";

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
