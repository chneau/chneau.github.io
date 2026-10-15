type Word = {
	readonly high: number;
	readonly low: number;
};

const P1: Word = { high: 0x9e3779b1, low: 0x85ebca87 };
const P2: Word = { high: 0xc2b2ae3d, low: 0x27d4eb4f };
const P3: Word = { high: 0x165667b1, low: 0x9e3779f9 };
const P4: Word = { high: 0x85ebca77, low: 0xc2b2ae63 };
const P5: Word = { high: 0x27d4eb2f, low: 0x165667c5 };
const ZERO: Word = { high: 0, low: 0 };

const mul64 = (a: Word, b: Word): Word => {
	const a0 = a.low & 0xffff;
	const a1 = a.low >>> 16;
	const a2 = a.high & 0xffff;
	const a3 = a.high >>> 16;
	const b0 = b.low & 0xffff;
	const b1 = b.low >>> 16;
	const b2 = b.high & 0xffff;
	const b3 = b.high >>> 16;
	const p0 = a0 * b0;
	const p1 = (p0 >>> 16) + a1 * b0 + a0 * b1;
	const p2 = a2 * b0 + a1 * b1 + a0 * b2 + Math.floor(p1 / 0x10000);
	const p3 = a3 * b0 + a2 * b1 + a1 * b2 + a0 * b3 + Math.floor(p2 / 0x10000);
	return {
		low: ((p0 & 0xffff) | ((p1 & 0xffff) << 16)) >>> 0,
		high: (p3 * 0x10000 + (p2 & 0xffff)) >>> 0,
	};
};

const add64 = (a: Word, b: Word): Word => {
	const low = (a.low >>> 0) + (b.low >>> 0);
	return {
		low: low >>> 0,
		high: (a.high + b.high + (low >= 0x100000000 ? 1 : 0)) >>> 0,
	};
};

const xor64 = (a: Word, b: Word): Word => ({
	high: (a.high ^ b.high) >>> 0,
	low: (a.low ^ b.low) >>> 0,
});

const rotl64 = (v: Word, bits: number): Word => {
	if (bits === 32) return { high: v.low, low: v.high };
	const back = 32 - bits;
	return {
		low: ((v.low << bits) | (v.high >>> back)) >>> 0,
		high: ((v.high << bits) | (v.low >>> back)) >>> 0,
	};
};

const shr64 = (v: Word, bits: number): Word =>
	bits >= 32
		? { high: 0, low: v.high >>> (bits - 32) }
		: {
				high: v.high >>> bits,
				low: ((v.low >>> bits) | (v.high << (32 - bits))) >>> 0,
			};

const round = (accumulator: Word, lane: Word): Word =>
	mul64(rotl64(add64(accumulator, mul64(lane, P2)), 31), P1);

const mergeRound = (accumulator: Word, lane: Word): Word =>
	add64(mul64(xor64(accumulator, round(ZERO, lane)), P1), P4);

const avalanche = (value: Word): Word => {
	const first = mul64(xor64(value, shr64(value, 33)), P2);
	const second = mul64(xor64(first, shr64(first, 29)), P3);
	return xor64(second, shr64(second, 32));
};

const sub64 = (a: Word, b: Word): Word => {
	const low = (a.low >>> 0) - (b.low >>> 0);
	return {
		low: low >>> 0,
		high: (a.high - b.high - (low < 0 ? 1 : 0)) >>> 0,
	};
};

const split = (value: bigint): Word => ({
	high: Number((value >> 32n) & 0xffffffffn),
	low: Number(value & 0xffffffffn),
});

export const xxHash64 = (bytes: Uint8Array, seed = 0n): bigint => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const laneAt = (at: number): Word => ({
		low: view.getUint32(at, true),
		high: view.getUint32(at + 4, true),
	});
	const seedWord = split(seed);
	let accumulator: Word;
	let at = 0;
	if (bytes.length >= 32) {
		let first = add64(add64(seedWord, P1), P2);
		let second = add64(seedWord, P2);
		let third = seedWord;
		let fourth = sub64(seedWord, P1);
		while (at + 32 <= bytes.length) {
			first = round(first, laneAt(at));
			second = round(second, laneAt(at + 8));
			third = round(third, laneAt(at + 16));
			fourth = round(fourth, laneAt(at + 24));
			at += 32;
		}
		const lanes = add64(
			add64(rotl64(first, 1), rotl64(second, 7)),
			add64(rotl64(third, 12), rotl64(fourth, 18)),
		);
		accumulator = mergeRound(
			mergeRound(mergeRound(lanes, first), second),
			third,
		);
		accumulator = mergeRound(accumulator, fourth);
	} else {
		accumulator = add64(seedWord, P5);
	}
	accumulator = add64(accumulator, {
		low: bytes.length >>> 0,
		high: Math.floor(bytes.length / 0x100000000) >>> 0,
	});
	while (at + 8 <= bytes.length) {
		accumulator = xor64(accumulator, round(ZERO, laneAt(at)));
		accumulator = add64(mul64(rotl64(accumulator, 27), P1), P4);
		at += 8;
	}
	if (at + 4 <= bytes.length) {
		accumulator = xor64(
			accumulator,
			mul64({ high: 0, low: view.getUint32(at, true) }, P1),
		);
		accumulator = add64(mul64(rotl64(accumulator, 23), P2), P3);
		at += 4;
	}
	while (at < bytes.length) {
		accumulator = xor64(
			accumulator,
			mul64({ high: 0, low: bytes[at] ?? 0 }, P5),
		);
		accumulator = mul64(rotl64(accumulator, 11), P1);
		at += 1;
	}
	const final = avalanche(accumulator);
	return (BigInt(final.high) << 32n) | BigInt(final.low);
};

export const hex64 = (value: bigint): string =>
	value.toString(16).padStart(16, "0");
