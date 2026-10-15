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

const writable = (bytes: Uint8Array) => locateWritable(bytes);

describe("patching a scalar in place", () => {
	test(
		"changes exactly the bytes of the patched field, and nothing else",
		() => {
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

			expect([...patched.subarray(level.offset + 1, level.offset + 4)]).toEqual(
				[...payload.subarray(level.offset + 1, level.offset + 4)],
			);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"leaves every other writable field exactly where it was",
		() => {
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

		const spilled = new Uint8Array(8).fill(0x11);
		const bounded = probe(spilled, 0, 0, 0x1234);
		expect({
			changed: bounded.changed,
			readBack: bounded.readBack,
		}).toEqual({ changed: true, readBack: 0x1234 });
		expect([...spilled]).toEqual([
			0x34, 0x12, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
		]);

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
		"returns nothing on a build whose crowns identity it does not hold",
		() => {
			const payload = decompressContainer(smallSave()).data;
			expect(locateMoney(payload)).toBeUndefined();
			expect(locateWritable(payload).money).toBeUndefined();
		},
		FIXTURE_TIMEOUT_MS,
	);
});
