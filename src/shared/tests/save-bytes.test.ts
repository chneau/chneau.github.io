import { describe, expect, test } from "bun:test";
import {
	ByteReader,
	ByteWriter,
	bytesEqual,
	fromHex,
	toHexRows,
} from "../save/bytes";

/**
 * `ByteWriter.ensure` growth.
 *
 * The growth step used to be `let size = length * 2` followed by
 * `while (size < offset + extra) size *= 2`. For a writer created with a
 * capacity of 0 that is `size = 0`, and `0 * 2` is still 0 — so the condition
 * never became false and the first write spun forever. A hang, not a throw,
 * which is why no codec hit it: every caller passed a real initial capacity, so
 * the bug sat latent behind an argument nobody supplied.
 *
 * The floor is now the requested size rather than zero.
 */

describe("ByteWriter growth", () => {
	test("a zero-capacity writer writes instead of hanging", () => {
		const writer = new ByteWriter(0);
		// If this regressed the test would never reach the next line.
		writer.u8(0xab);
		expect(writer.length).toBe(1);
		expect(Array.from(writer.finish())).toEqual([0xab]);
	});

	test("a zero-capacity writer grows through a sequence of writes", () => {
		const writer = new ByteWriter(0);
		for (let i = 0; i < 64; i += 1) writer.u8(i & 0xff);
		expect(writer.length).toBe(64);
		const bytes = writer.finish();
		expect(bytes[0]).toBe(0);
		expect(bytes[63]).toBe(63);
	});

	test("a zero-capacity multi-byte write lands at the right offset", () => {
		const writer = new ByteWriter(0);
		writer.u16(0x1234);
		expect(writer.length).toBe(2);
		// Little-endian is the writer's default.
		expect(bytesEqual(writer.finish(), fromHex("3412"))).toBe(true);
	});

	test("growth preserves what was already written", () => {
		const writer = new ByteWriter(0);
		writer.u8(1);
		writer.u8(2);
		writer.u32(0xdeadbeef);
		expect(bytesEqual(writer.finish(), fromHex("0102efbeadde"))).toBe(true);
	});

	test("a writer with a small capacity grows past it without losing bytes", () => {
		const writer = new ByteWriter(2);
		writer.u8(9);
		writer.u8(8);
		writer.u8(7);
		expect(writer.length).toBe(3);
		expect(bytesEqual(writer.finish(), fromHex("090807"))).toBe(true);
	});

	test("what a grown writer writes reads back identically", () => {
		const writer = new ByteWriter(0);
		writer.u8(0x42);
		writer.u32(0x01020304);
		writer.raw(fromHex("aabb"));

		const reader = new ByteReader(writer.finish());
		expect(reader.u8()).toBe(0x42);
		expect(reader.u32()).toBe(0x01020304);
		expect(reader.raw(2)).toEqual(fromHex("aabb"));
	});

	test("an empty writer finishes as empty rather than as its capacity", () => {
		// `finish` truncates to what was written; growth must not change that.
		expect(new ByteWriter(0).finish().length).toBe(0);
		expect(new ByteWriter(64).finish().length).toBe(0);
	});

	test("writtenFrom still sees the full grown buffer", () => {
		const writer = new ByteWriter(0);
		writer.u8(0x11);
		writer.u8(0x22);
		expect(bytesEqual(writer.writtenFrom(0), fromHex("1122"))).toBe(true);
	});
});

describe("toHexRows", () => {
	const bytes = new Uint8Array([
		0x00, 0x41, 0x7e, 0x7f, 0xff, 0x20, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66,
		0x67, 0x68, 0x69, 0x6a, 0x6b,
	]);

	test("lays out fixed-width rows with printable ASCII and dots", () => {
		const rows = toHexRows(bytes, 16, 4096);
		expect({
			count: rows.length,
			firstOffset: rows[0]?.offset,
			firstHex: rows[0]?.hex.slice(0, 4),
			// NUL, DEL and 0xff are not printable; "A" and "~" are.
			firstAscii: rows[0]?.ascii,
			// The second row is one byte, and its offset continues the sequence.
			secondOffset: rows[1]?.offset,
			secondAscii: rows[1]?.ascii,
		}).toEqual({
			count: 2,
			firstOffset: 0,
			firstHex: ["00", "41", "7e", "7f"],
			// `00` `7f` `ff` are dots, `20` is the space it is, `A~` printable.
			firstAscii: ".A~.. abcdefghij",
			secondOffset: 16,
			secondAscii: "k",
		});
	});

	test("a zero-width row cannot spin forever", () => {
		// `bytesPerRow` of 0 used to make the loop advance by nothing: a hang, not
		// a throw. The stride is clamped to at least one byte per row, so a
		// 17-byte input is 17 rows of one rather than an infinite loop.
		expect(toHexRows(bytes, 0, 32).length).toBe(17);
		// A negative width is clamped the same way rather than looping.
		expect(toHexRows(bytes, -4, 4).length).toBe(4);
	});

	test("the limit bounds the work and the last row is not padded", () => {
		expect(toHexRows(bytes, 16, 5).map((row) => row.hex.length)).toEqual([5]);
		expect(toHexRows(bytes, 16, 0)).toEqual([]);
		expect(toHexRows(new Uint8Array(0), 16, 4096)).toEqual([]);
	});
});
