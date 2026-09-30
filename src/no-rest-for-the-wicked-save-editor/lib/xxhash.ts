/**
 * xxHash64, the checksum CERIMAL stores in every document header.
 *
 * Written here rather than pulled in as a dependency for two reasons. The
 * editors on this site exist to prove a save can be read and rebuilt on a
 * device with no toolchain, and a 200-line hash is a smaller thing to trust
 * than a bundled package. And the hash is load-bearing in a way a library
 * would hide: a rebuilt save whose checksum is computed over the wrong range
 * loads as garbage, so the arithmetic is spelled out and pinned by
 * `tests/format.test.ts` against the published vectors *and* against the
 * checksums inside real game saves.
 *
 * ## Why 32-bit halves rather than `bigint`
 *
 * `bigint` would be a direct transcription of the specification and about
 * twenty lines shorter. A realm save is 1.7 MB of content to hash, and the
 * `bigint` version needs a heap-allocated pair per 8-byte lane: roughly eight
 * seconds of work across the fixtures, on the main thread, in a tool whose
 * whole premise is that it does not block. The `{ high, low }` pair below
 * computes the same value with `Math.imul` and stays under 30 ms.
 *
 * The two hazards in the arithmetic, both of which produced wrong answers
 * during development and are therefore commented where they appear:
 * `>>>` converts its operand to *unsigned 32-bit* before shifting, so a
 * 64-bit carry has to be divided rather than shifted; and the low word of a
 * 64-bit value lives in `low`, so a shift right by 32 or more leaves the
 * result in `low` with a zero high word, not the other way round.
 */

/** A 64-bit value as two unsigned 32-bit halves, `high` first. */
type Word = {
	readonly high: number;
	readonly low: number;
};

/** The five 64-bit primes, split into halves. */
const P1: Word = { high: 0x9e3779b1, low: 0x85ebca87 };
const P2: Word = { high: 0xc2b2ae3d, low: 0x27d4eb4f };
const P3: Word = { high: 0x165667b1, low: 0x9e3779f9 };
const P4: Word = { high: 0x85ebca77, low: 0xc2b2ae63 };
const P5: Word = { high: 0x27d4eb2f, low: 0x165667c5 };
const ZERO: Word = { high: 0, low: 0 };

/**
 * 64-bit multiply as four 16-bit limbs.
 *
 * The carries between limbs can exceed 32 bits (`g2` and `g3` reach 2^34), so
 * each carry is taken with a division: `>> 16` would silently discard the bits
 * above 32 *before* shifting, which costs the top 16 bits of the result.
 */
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
		// `p3 * 0x10000` reaches 2^50, well inside a double's exact range, and
		// `>>> 0` on a value past 2^32 is the modulo that discards the overflow.
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

/** Rotate left, for the 1..32 bit counts xxHash64 uses. */
const rotl64 = (v: Word, bits: number): Word => {
	if (bits === 32) return { high: v.low, low: v.high };
	const back = 32 - bits;
	return {
		low: ((v.low << bits) | (v.high >>> back)) >>> 0,
		high: ((v.high << bits) | (v.low >>> back)) >>> 0,
	};
};

/** Shift right, for the 29, 32 and 33 bit counts the final mix uses. */
const shr64 = (v: Word, bits: number): Word =>
	bits >= 32
		? { high: 0, low: v.high >>> (bits - 32) }
		: {
				high: v.high >>> bits,
				low: ((v.low >>> bits) | (v.high << (32 - bits))) >>> 0,
			};

/** One round of the main loop. */
const round = (accumulator: Word, lane: Word): Word =>
	mul64(rotl64(add64(accumulator, mul64(lane, P2)), 31), P1);

/** Folds one of the four accumulators into the running total. */
const mergeRound = (accumulator: Word, lane: Word): Word =>
	add64(mul64(xor64(accumulator, round(ZERO, lane)), P1), P4);

const avalanche = (value: Word): Word => {
	const first = mul64(xor64(value, shr64(value, 33)), P2);
	const second = mul64(xor64(first, shr64(first, 29)), P3);
	return xor64(second, shr64(second, 32));
};

/** Two's-complement subtraction; xxHash64 starts its fourth lane below zero. */
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

/**
 * The 64-bit xxHash of `bytes`, little-endian, with a 64-bit `seed`.
 *
 * This is the XXH64 of Yann Collet's specification, transcribed from the
 * reference `xxhash.h`. `tests/format.test.ts` pins it to the published
 * vectors for the empty string, `"a"` and `"abc"`, to a seeded vector, and to
 * the checksums stored in eleven real `.dat` files.
 */
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
	// The trailing 0..31 bytes, eight at a time. Note the lane goes through a
	// full round before being folded in, unlike the main loop's accumulator.
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

/** The hash as the sixteen lower-case hex digits the header stores. */
export const hex64 = (value: bigint): string =>
	value.toString(16).padStart(16, "0");
