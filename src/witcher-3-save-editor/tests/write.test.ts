import { describe, expect, test } from "bun:test";
import { decompressContainer, parseContainer } from "../lib/container";
import { buildContainer } from "../lib/container-write";
import {
	clampScalar,
	locateMoney,
	locateWritable,
	patchScalar,
	readScalar,
} from "../lib/write";
import { changedOffsets, FIXTURE_TIMEOUT_MS, smallSave } from "./fixtures";

/**
 * Writing a field: the patch lands, and nothing else moves.
 *
 * This is the claim the codec's design exists to make, and it is the one a
 * static type system has nothing to say about. A Witcher 3 save carries no
 * checksum, so a wrong write is not *detected* — it is loaded, and the game
 * either misbehaves or discards the file. Which means the only place the
 * correctness of a patch can be established is here, by comparing the payload
 * before and after and requiring the difference to be exactly the bytes that
 * were asked for.
 *
 * The assertion is deliberately strict about *which* bytes changed, not only
 * how many. A patch that touched the right count of bytes in the wrong place
 * would pass a count-only check, and that is precisely the failure this editor
 * is built to make impossible.
 */

/** Both fixtures' offsets, once per test run rather than once per test. */
const writable = (bytes: Uint8Array) => locateWritable(bytes);

describe("patching a scalar in place", () => {
	test(
		"changes exactly the bytes of the patched field, and nothing else",
		() => {
			// The level is an `i32` holding 4, so writing 12 touches one byte of the
			// four — and the other three must be *bit-identical*, not merely equal in
			// value. A writer that zeroed the field before writing, or that wrote a
			// little-endian `i32` into a stream expecting something else, would leave
			// more than one byte moved.
			const payload = decompressContainer(smallSave()).data;
			const found = writable(payload);
			const level = found.level;
			if (level === undefined) throw new Error("the fixture has no level");

			expect({ value: level.value, kind: level.kind }).toEqual({
				value: 4,
				kind: "i32",
			});

			const patched = payload.slice();
			expect(patchScalar(patched, level, 12)).toBe(true);

			const moved = changedOffsets(payload, patched);
			expect({ moved: moved.length }).toEqual({ moved: 1 });
			expect(moved).toEqual([level.offset]);
			expect(readScalar(patched, level)).toBe(12);

			// The three untouched bytes of the `i32` are asserted individually: a
			// count of one is necessary but not sufficient.
			expect([...patched.subarray(level.offset + 1, level.offset + 4)]).toEqual(
				[...payload.subarray(level.offset + 1, level.offset + 4)],
			);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"leaves every other writable field exactly where it was",
		() => {
			// The stronger form of the same claim, and the one that catches a writer
			// patching the wrong offset: after one field is written, every *other*
			// address this codec knows must still read what it read before. Comparing
			// the two address lists as well as the values catches a patch that moved
			// a field rather than corrupting it.
			const payload = decompressContainer(smallSave()).data;
			const before = writable(payload);
			const patched = payload.slice();
			const level = before.level;
			if (level === undefined) throw new Error("the fixture has no level");
			patchScalar(patched, level, 12);

			const after = writable(patched);
			expect({
				levelOffset: after.level?.offset,
				difficultyOffset: after.difficulty?.offset,
				difficultyValue: after.difficulty?.value,
				points: after.points.map((point) => ({
					freeOffset: point.freeOffset,
					free: point.free,
					used: point.used,
				})),
				skills: after.skills.length,
			}).toEqual({
				levelOffset: before.level?.offset,
				difficultyOffset: before.difficulty?.offset,
				difficultyValue: before.difficulty?.value,
				points: before.points.map((point) => ({
					freeOffset: point.freeOffset,
					free: point.free,
					used: point.used,
				})),
				skills: before.skills.length,
			});
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"writes a value back through a rebuilt container, still touching only that field",
		() => {
			// The whole pipeline, rather than a patch into a buffer: inflate, write one
			// scalar, rebuild, re-inflate, and require the payload to differ from the
			// original in exactly the patched bytes. This is the assertion that a save
			// handed to a player differs from the one they gave us in the one place
			// they asked for.
			const file = smallSave();
			const original = decompressContainer(file);
			const patched = original.data.slice();
			const level = writable(patched).level;
			if (level === undefined) throw new Error("the fixture has no level");
			patchScalar(patched, level, 12);

			const rebuilt = buildContainer(parseContainer(file).chunks, patched);
			const reread = decompressContainer(rebuilt);

			expect({ payloadBytes: reread.data.length }).toEqual({
				payloadBytes: original.data.length,
			});
			const moved = changedOffsets(original.data, reread.data);
			expect({ moved: moved.length, at: moved }).toEqual({
				moved: 1,
				at: [level.offset],
			});
			expect(readScalar(reread.data, level)).toBe(12);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("clamps rather than wrapping, and refuses a write that changes nothing", () => {
		// The `u16` crowns field cannot hold more than 65535, and a value over it
		// is not a clamped quantity — it is a different record, which is why the
		// field refuses rather than wrapping to 4464.
		//
		// A scratch buffer rather than a fixture: this is about the arithmetic in
		// `patchScalar`, and reaching into a real save to test it would make the
		// assertion depend on a byte this suite has no other reason to know.
		const probe = (
			buffer: Uint8Array,
			at: number,
			value: number,
			next: number,
		) => {
			const target = {
				id: "probe",
				label: "Probe",
				value,
				offset: at,
				kind: "u16",
				min: 0,
				max: 0xffff,
			} as const;
			return {
				changed: patchScalar(buffer, target, next),
				readBack: readScalar(buffer, target),
				clamped: clampScalar(target, next),
			};
		};

		const zeroed = new Uint8Array(8);
		expect(probe(zeroed, 0, 0, 70000)).toEqual({
			changed: true,
			readBack: 65535,
			clamped: 65535,
		});

		// Two bytes wide and no wider: a `u16` write that spilled would corrupt
		// whatever record field follows it, and this format lays records out
		// contiguously.
		const spilled = new Uint8Array(8).fill(0x11);
		const bounded = probe(spilled, 0, 0, 0x1234);
		expect({
			changed: bounded.changed,
			readBack: bounded.readBack,
		}).toEqual({ changed: true, readBack: 0x1234 });
		expect([...spilled]).toEqual([
			0x34, 0x12, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
		]);

		// A write of the value already there changes nothing and says so, which is
		// what keeps a no-op edit out of a rebuilt file.
		const settled = new Uint8Array(8).fill(0x11);
		const quiet = probe(settled, 0, 0x1111, 0x1111);
		expect({
			changed: quiet.changed,
			readBack: quiet.readBack,
		}).toEqual({ changed: false, readBack: 0x1111 });
		expect([...settled]).toEqual([
			0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
		]);
	});

	test(
		"refuses a non-finite value rather than writing a NaN",
		() => {
			// `DataView.setInt32` truncates, and `Math.trunc(NaN)` is `NaN`, so a
			// non-finite value would be written as zeros — a field the player never
			// asked to change, silently set to 0.
			const payload = decompressContainer(smallSave()).data.slice();
			const found = writable(payload);
			const level = found.level;
			if (level === undefined) throw new Error("the fixture has no level");
			const before = payload.slice();
			expect(patchScalar(payload, level, Number.NaN)).toBe(false);
			expect(patchScalar(payload, level, Number.POSITIVE_INFINITY)).toBe(false);
			expect(changedOffsets(before, payload)).toEqual([]);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"refuses an address past the end of the payload",
		() => {
			// A target discovered from one save and applied to another is the exact
			// hazard the codec's design is built against — offsets differ between
			// saves of the same build. `patchScalar` bounds-checks the write, so a
			// stale address is a no-op rather than a write into the next allocation.
			const payload = decompressContainer(smallSave()).data;
			const beyond = {
				id: "beyond",
				label: "Beyond",
				value: 1,
				offset: payload.length - 1,
				kind: "i32",
				min: 0,
				max: 1000,
			} as const;
			const before = payload.slice();
			expect(patchScalar(payload, beyond, 5)).toBe(false);
			expect(changedOffsets(before, payload)).toEqual([]);
		},
		FIXTURE_TIMEOUT_MS,
	);
});

describe("locating the wallet", () => {
	test(
		"returns nothing on a build whose item records have a different shape",
		() => {
			// The honest-degradation contract, at the layer that decides it. This
			// build contains *zero* records of the shape the wallet is found by, so
			// the only correct answer is "not here" — a guess here would write over
			// one of the 1,845 unrelated records the shape alone matches.
			const payload = decompressContainer(smallSave()).data;
			expect(locateMoney(payload)).toBeUndefined();
			expect(locateWritable(payload).money).toBeUndefined();
		},
		FIXTURE_TIMEOUT_MS,
	);
});
