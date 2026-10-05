import { describe, expect, test } from "bun:test";
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
import { lz4CompressBlock } from "../lib/lz4-write";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

/**
 * Rebuilding the container: the envelope, and nothing else.
 *
 * This is the half of writing that has no clever trick behind it and is still
 * where a save gets lost. The chunk table is the only structure in the format
 * holding absolute *file* offsets — `endOffset` — and the table's rows are
 * rewritten from scratch on every rebuild, because a patch that compresses to a
 * different size shifts every row after it. A row written wrong does not throw:
 * it produces a file whose later blocks are read from the wrong place, which
 * decompresses to plausible-looking bytes that are not the save.
 *
 * So the tests here are about bookkeeping, asserted against the decompressed
 * payload rather than against the compressed bytes — comparing compressed bytes
 * would only prove that two compressors agree, and `lib/lz4-write.ts` is explicit
 * that they are not expected to.
 */

/** Both fixtures, so every claim about the envelope is made against each. */
const FIXTURES = (): readonly (readonly [string, Uint8Array])[] => [
	["8559a", smallSave()],
	["52586", largeSave()],
];

describe("the container writer", () => {
	test("writes a 3084-byte header, which is not the 3088 the arithmetic gives", () => {
		// Sixteen fixed bytes (two magics, a chunk count and a header size) plus
		// 256 table slots of 12 bytes is 16 + 3072 = 3088 arithmetically. The game
		// writes **3084**, and its reader only requires
		// `headerSize >= 16 + chunkCount * 12`, so a 3088 file parses perfectly here
		// and would be a file the game may refuse. The decoder's own notes carry
		// the 3088 identity, which is exactly why it is worth a test: the constant
		// is easy to "correct" back to the tidy number by somebody reading the
		// arithmetic rather than a save.
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
		// The header is written at the size the game uses, so the first block
		// begins there rather than four bytes later. An empty payload compresses to
		// a single token byte, which is the shortest legal block there is.
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

				// `parseContainer` validates the layout, including every `endOffset`
				// against a walk of the `compressedSize` column — so reaching the end
				// of this call without a throw *is* the assertion that the table was
				// written correctly. It does not decompress, which is what makes it
				// usable as a check on a multi-megabyte file.
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
			// The claim the whole editor rests on. An *unedited* save rebuilt through
			// this writer must decompress to precisely the bytes it was read from: the
			// compressor is free to choose different literals and different offsets,
			// but it may not lose or reorder one.
			for (const [label, file] of FIXTURES()) {
				const payload = decompressContainer(file).data;
				const rebuilt = buildContainer(parseContainer(file).chunks, payload);
				const again = decompressContainer(rebuilt);
				expect({ label, payloadBytes: again.data.length }).toEqual({
					label,
					payloadBytes: payload.length,
				});
				// Compared in slices: spreading five million bytes into an array to
				// diff them would cost more than the decode did.
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
			// The sizes are what make a width-preserving edit safe. They are copied
			// from the original table rather than recomputed from the rebuilt blocks,
			// and if a rebuild ever derived them afresh they would follow the
			// compressor's output instead — and the `SC` span index, which addresses
			// the *decompressed* stream, would then be addressing a stream of a
			// different length from the one the table describes.
			for (const [label, file] of FIXTURES()) {
				const before = parseContainer(file).chunks;
				const rebuilt = buildContainer(before, decompressContainer(file).data);
				const after = parseContainer(rebuilt).chunks;
				expect({
					label,
					compressed: after.map((chunk) => chunk.compressedSize),
				}).toEqual({
					label,
					// Compression is allowed to differ; only the decompressed column is
					// a contract.
					compressed: after.map((chunk) => chunk.compressedSize),
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
		// The one guard against a caller handing over a truncated payload: a
		// chunk whose `decompressedSize` runs past the end would otherwise be
		// compressed from a short buffer and written as a block that decompresses
		// to fewer bytes than the table claims, which `decompressContainer` then
		// rejects — after the file has been built and, in a page, offered.
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
		// A payload that does fit is accepted, so the guard is on the overrun and
		// not on the call itself.
		expect(() => buildContainer([chunk], new Uint8Array(100))).not.toThrow();
	});

	test(
		"refuses an edited payload whose length changed",
		() => {
			// The safety argument of this whole editor is that a width-preserving edit
			// cannot move an offset. `rebuildFrom` is where that is enforced, and it
			// has to be enforced rather than assumed: a payload one byte longer would
			// produce a file whose `SC` span index and variable table now address a
			// stream they no longer describe, and nothing downstream would notice.
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
		// A synthetic envelope, so the table arithmetic is tested without a
		// five-megabyte fixture in the way. Two chunks of different sizes, because
		// a writer that assumed uniform chunks would pass on a save that happens
		// to be uniform and fail on one that is not — and this game's last chunk
		// is 914,021 bytes where the first four are 1,048,576.
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
		// The final record's `endOffset` is a sentinel, and the reader treats a
		// non-zero value there as a hard error — so reaching this line at all is
		// already the assertion that the writer honours it.
		expect(parsed.chunks[1]?.endOffset).toBe(0);
		// The first record's is a real offset, into the *compressed* file: 500
		// identical bytes occupy far fewer than 500 on disk, and writing 500 here
		// would be a table that the reader rejects only because its own cross-check
		// happens to disagree — the blocks themselves would still look fine.
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
			// A `decompressedSize` column is attacker-adjacent data: it goes straight
			// into `new Uint8Array`. The reader caps it, and this asserts the cap is
			// still there after the writer was added, because a writer that could be
			// talked into emitting a larger ceiling would make the reader's guard
			// decorative.
			expect(MAX_DECOMPRESSED_BYTES).toBe(1 << 30);
			expect(
				MAX_DECOMPRESSED_BYTES > decompressContainer(smallSave()).data.length,
			).toBe(true);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("writes the compressor's own bytes into the file, unmodified", () => {
		// The last layer of the envelope, pinned directly: what `buildContainer`
		// places after the header must be byte-for-byte what the compressor
		// returned for that chunk. Everything above this test — the table, the
		// round trip — would still pass if the writer silently sliced or padded a
		// block, because the decoder would refuse the result only later and with a
		// message about the wrong thing.
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
