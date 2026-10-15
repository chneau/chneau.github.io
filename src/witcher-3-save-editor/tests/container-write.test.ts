import { describe, expect, test } from "bun:test";
import { lz4CompressBlock } from "../../shared/save/lz4";
import {
	decompressContainer,
	MAX_DECOMPRESSED_BYTES,
	parseContainer,
} from "../lib/container";
import {
	buildContainer,
	HEADER_SIZE,
	rebuildFrom,
} from "../lib/container-write";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

const FIXTURES = (): readonly (readonly [string, Uint8Array])[] => [
	["8559a", smallSave()],
	["52586", largeSave()],
];

describe("the container writer", () => {
	test("writes a 3084-byte header, which is not the 3088 the arithmetic gives", () => {
		expect(HEADER_SIZE).toBe(3084);
		expect(16 + 256 * 12).toBe(3088);
		expect(HEADER_SIZE).not.toBe(16 + 256 * 12);

		const file = buildContainer(
			[
				{
					index: 0,
					compressedSize: 0,
					decompressedSize: 0,
					endOffset: 0,
					start: 0,
				},
			],
			new Uint8Array(0),
		);
		expect(file.length).toBe(HEADER_SIZE + 1);
		const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
		expect(view.getUint32(12, true)).toBe(HEADER_SIZE);
		expect(view.getUint32(8, true)).toBe(1);
	});

	test("writes the magics the reader requires", () => {
		const file = buildContainer(
			[
				{
					index: 0,
					compressedSize: 0,
					decompressedSize: 0,
					endOffset: 0,
					start: 0,
				},
			],
			new Uint8Array(0),
		);
		const text = new TextDecoder().decode(file.subarray(0, 8));
		expect(text).toBe("SNFHFZLC");
	});

	test(
		"rebuilds each fixture into a file the reader accepts",
		() => {
			for (const [label, file] of FIXTURES()) {
				const original = parseContainer(file);
				const rebuilt = buildContainer(
					original.chunks,
					decompressContainer(file).data,
				);

				const parsed = parseContainer(rebuilt);
				expect({ label, chunkCount: parsed.chunkCount }).toEqual({
					label,
					chunkCount: original.chunkCount,
				});
				expect({ label, headerSize: parsed.headerSize }).toEqual({
					label,
					headerSize: HEADER_SIZE,
				});
				expect({
					label,
					slots: parsed.tableSlotCount,
				}).toEqual({ label, slots: 256 });
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"rebuilds each fixture so the payload comes back byte for byte",
		() => {
			for (const [label, file] of FIXTURES()) {
				const payload = decompressContainer(file).data;
				const rebuilt = buildContainer(parseContainer(file).chunks, payload);
				const again = decompressContainer(rebuilt);
				expect({ label, payloadBytes: again.data.length }).toEqual({
					label,
					payloadBytes: payload.length,
				});
				let identical = true;
				for (let index = 0; index < payload.length; index += 1) {
					if (again.data[index] !== payload[index]) {
						identical = false;
						break;
					}
				}
				expect({ label, identical }).toEqual({ label, identical: true });
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"keeps the decompressedSize column unchanged, chunk for chunk",
		() => {
			for (const [label, file] of FIXTURES()) {
				const before = parseContainer(file).chunks;
				const rebuilt = buildContainer(before, decompressContainer(file).data);
				const after = parseContainer(rebuilt).chunks;
				expect({
					label,
					tiles: after.reduce((sum, chunk) => sum + chunk.compressedSize, 0),
					fileBytes: rebuilt.length - parseContainer(rebuilt).headerSize,
				}).toEqual({
					label,
					tiles: rebuilt.length - parseContainer(rebuilt).headerSize,
					fileBytes: rebuilt.length - parseContainer(rebuilt).headerSize,
				});
				expect({
					label,
					decompressed: after.map((chunk) => chunk.decompressedSize),
				}).toEqual({
					label,
					decompressed: before.map((chunk) => chunk.decompressedSize),
				});
				expect({
					label,
					total: after.reduce((sum, chunk) => sum + chunk.decompressedSize, 0),
				}).toEqual({
					label,
					total: before.reduce((sum, chunk) => sum + chunk.decompressedSize, 0),
				});
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("rejects a payload that does not fill the chunk table", () => {
		const chunk = {
			index: 0,
			compressedSize: 0,
			decompressedSize: 100,
			endOffset: 0,
			start: 0,
		};
		expect(() => buildContainer([chunk], new Uint8Array(40))).toThrow(
			/runs past the payload/,
		);
		expect(() => buildContainer([chunk], new Uint8Array(100))).not.toThrow();
	});

	test(
		"refuses an edited payload whose length changed",
		() => {
			const container = decompressContainer(smallSave());
			expect(() => rebuildFrom(container, new Uint8Array(1))).toThrow(
				/only same-width edits can be written/,
			);
			expect(() =>
				rebuildFrom(container, new Uint8Array(container.data.length + 1)),
			).toThrow(/same-width/);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("round-trips a container built from one hand-written chunk", () => {
		const first = new Uint8Array(500).fill(0xa1);
		const second = new Uint8Array(37).fill(0xb2);
		const payload = new Uint8Array(first.length + second.length);
		payload.set(first, 0);
		payload.set(second, first.length);

		const rebuilt = buildContainer(
			[
				{
					index: 0,
					compressedSize: 0,
					decompressedSize: first.length,
					endOffset: 0,
					start: 0,
				},
				{
					index: 1,
					compressedSize: 0,
					decompressedSize: second.length,
					endOffset: 0,
					start: 0,
				},
			],
			payload,
		);
		const parsed = parseContainer(rebuilt);
		expect(parsed.chunkCount).toBe(2);
		expect(parsed.chunks.map((chunk) => chunk.decompressedSize)).toEqual([
			500, 37,
		]);
		expect(parsed.chunks[1]?.endOffset).toBe(0);
		expect(parsed.chunks[0]?.endOffset).toBe(
			HEADER_SIZE + (parsed.chunks[0]?.compressedSize ?? 0),
		);
		expect(parsed.chunks[0]?.compressedSize).toBeLessThan(500);

		const again = decompressContainer(rebuilt);
		expect([...again.data]).toEqual([...payload]);
	});

	test(
		"holds the decompressed ceiling the reader enforces",
		() => {
			expect(MAX_DECOMPRESSED_BYTES).toBe(1 << 30);
			expect(
				MAX_DECOMPRESSED_BYTES > decompressContainer(smallSave()).data.length,
			).toBe(true);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("writes the compressor's own bytes into the file, unmodified", () => {
		const chunk = {
			index: 0,
			compressedSize: 0,
			decompressedSize: 64,
			endOffset: 0,
			start: 0,
		};
		const payload = new Uint8Array(64).fill(7);
		const file = buildContainer([chunk], payload);
		const block = lz4CompressBlock(payload);
		expect([...file.subarray(HEADER_SIZE, HEADER_SIZE + block.length)]).toEqual(
			[...block],
		);
		expect(file.length).toBe(HEADER_SIZE + block.length);
	});
});
