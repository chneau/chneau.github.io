/**
 * The outer `SNFH` / `FZLC` container: a fixed 256-slot chunk table followed by
 * that many raw LZ4 blocks which tile the rest of the file exactly.
 *
 * ```
 * 0x0000  4   "SNFH"
 * 0x0004  4   "FZLC"
 * 0x0008  u32  chunkCount   (15 in the sample)
 * 0x000C  u32  headerSize   (3084 == 12 + 256*12 exactly)
 * 0x0010  chunkCount x (u32 compressedSize, u32 decompressedSize, u32 endOffset)
 * …       zero-filled slots up to headerSize
 * 0x0C0C  ..EOF  chunkCount raw LZ4 blocks
 * ```
 *
 * `headerSize` is 3084, which is 4 less than a full 256-slot table measured
 * from the record start (16 + 256*12 = 3088). It is read from the file, never
 * recomputed, so this costs the parser nothing; noted because "3084 ==
 * 12 + 256*12" is a true-looking identity that only holds if the 4-byte
 * `headerSize` field is excluded from the header it sizes, and someone will
 * otherwise try to use it as an assertion.
 *
 * Two things about the table are worth stating because both have already cost
 * somebody an afternoon:
 *
 *  - The third column is an **end offset**, not a length, and it is **0 on the
 *    final record**. Walking the file with it hands the last block a start of 0
 *    and every block after a start that is one column short of the truth. So
 *    nothing here walks with it: each block's start is `headerSize` plus a
 *    running sum of `compressedSize`, and `endOffset` is only ever cross-checked
 *    where it is non-zero, with a mismatch reported rather than resolved.
 *  - Chunks are a *storage* boundary, not a semantic one. Strings straddle
 *    chunk edges in the sample (chunk 12 ends mid-word and chunk 13 resumes
 *    it), so the concatenated `data` is the thing to parse, and `chunks` is for
 *    reporting progress and inspecting layout.
 */

import { ByteReader } from "../../shared/save/bytes";
import { lz4DecompressBlock } from "./lz4";

const MAGIC_SNFH = "SNFH";
const MAGIC_FZLC = "FZLC";

/** Bytes before the table: two magics, a count and a header size. */
const HEADER_FIXED_SIZE = 16;
/** One chunk table entry: compressedSize, decompressedSize, endOffset. */
const RECORD_SIZE = 12;
/** The table is a fixed-size array, so the slot count is known regardless of how many are used. */
const TABLE_SLOT_COUNT = 256;

/**
 * The most this tool will allocate for one chunk, and for the whole stream.
 *
 * `decompressedSize` is a u32 read straight out of the file and goes into
 * `new Uint8Array`, so an unchecked sum turns a corrupt field into an
 * allocation the caller never asked for — fifteen records claiming 1.5 GiB
 * each is 22.5 GiB out of a 4,299-byte file, and the only symptom is an OOM
 * kill with nothing pointing at the field that was wrong.
 *
 * A *ratio* bound would be the wrong instrument: LZ4 compresses a long run of
 * identical bytes almost to nothing, so "compressed × factor" is not a property
 * of a valid save. This is a plain ceiling instead.
 *
 * 1 GiB is ~68× the reference save's 15,490,509 bytes and comfortably above any
 * real PC save, while being a number that cannot exhaust a machine. A save that
 * genuinely exceeded it would be a format change worth a deliberate decision,
 * not something to discover as an OOM kill.
 *
 * The ceiling lives here, with the container that performs the allocation,
 * rather than in a caller. It used to be duplicated in a CLI entry point, and
 * two copies of a safety limit can drift — and the one that mattered most was
 * the one in the layer every command went through, not the one that would have
 * caught a direct call.
 */
export const MAX_DECOMPRESSED_BYTES = 1 << 30;

/** One row of the chunk table, resolved to the offsets it describes. */
export type ChunkRecord = {
	readonly index: number;
	readonly compressedSize: number;
	readonly decompressedSize: number;
	/** Absolute end offset. 0 on the final record — a sentinel, not a real offset. */
	readonly endOffset: number;
	/** Absolute start offset in the file, derived by walking from headerSize. */
	readonly start: number;
};

export type SaveContainer = {
	readonly chunkCount: number;
	readonly headerSize: number;
	readonly tableSlotCount: number; // 256
	readonly chunks: readonly ChunkRecord[];
	readonly fileSize: number;
	/** All chunks concatenated, in order. 15,490,509 bytes for the sample. */
	readonly data: Uint8Array<ArrayBuffer>;
};

/** The table has been read but the blocks have not been touched. */
type ParsedTable = {
	readonly chunkCount: number;
	readonly headerSize: number;
	readonly chunks: readonly ChunkRecord[];
};

/**
 * Both magics, checked in order, each naming itself when it is wrong.
 *
 * The reading comes from the shared little-endian cursor rather than a
 * container-local one. The upstream decoder carried its own `ByteReader` whose
 * used surface here was exactly `u32`, `latin1` and `position`, all of which
 * the shared reader provides with the same byte order and the same bounds
 * checking — a fourth cursor in the repository would be a fourth thing to be
 * wrong quietly.
 */
const checkMagic = (
	reader: ByteReader,
	expected: string,
	what: string,
): void => {
	const found = reader.latin1(4, `${what} magic`);
	if (found !== expected) {
		throw new Error(
			`Not a Witcher 3 save: expected ${what} magic "${expected}" at offset ${
				reader.position - 4
			} but found "${found}"`,
		);
	}
};

/**
 * Read the header and the used part of the chunk table, without decompressing
 * anything. Cheap enough to run on every file a caller is merely considering,
 * and `chunks` is enough to size the work `decompressContainer` will do.
 */
const parseTable = (file: Uint8Array): ParsedTable => {
	if (file.length < HEADER_FIXED_SIZE) {
		throw new Error(
			`Not a Witcher 3 save: ${file.length} byte(s) is too short for the ${HEADER_FIXED_SIZE}-byte ${MAGIC_SNFH} header`,
		);
	}
	const reader = new ByteReader(file);
	checkMagic(reader, MAGIC_SNFH, MAGIC_SNFH);
	checkMagic(reader, MAGIC_FZLC, MAGIC_FZLC);
	const chunkCount = reader.u32("chunkCount");
	const headerSize = reader.u32("headerSize");

	if (chunkCount === 0) {
		throw new Error("Not a Witcher 3 save: the chunk table is empty");
	}
	// The table is a fixed 256-slot array, so a count above that cannot be
	// real. The `headerSize` check below does not catch this: a file can claim
	// 300 chunks *and* a headerSize large enough to hold 300 records, and then
	// records 256..299 are silently read out of the compressed payload that
	// follows, and decoded as if they were chunk data.
	if (chunkCount > TABLE_SLOT_COUNT) {
		throw new Error(
			`Corrupt save: chunkCount ${chunkCount} exceeds the ${TABLE_SLOT_COUNT} fixed slot(s) of the chunk table`,
		);
	}
	if (headerSize < HEADER_FIXED_SIZE + chunkCount * RECORD_SIZE) {
		throw new Error(
			`Corrupt save: headerSize ${headerSize} cannot hold ${chunkCount} chunk record(s) of ${RECORD_SIZE} bytes after the ${HEADER_FIXED_SIZE}-byte header`,
		);
	}
	if (headerSize > file.length) {
		throw new Error(
			`Truncated save: headerSize ${headerSize} runs past the end of the ${file.length}-byte file`,
		);
	}

	// Walk the blocks from headerSize. `endOffset` is checked, never trusted.
	const chunks: ChunkRecord[] = [];
	let start = headerSize;
	for (let index = 0; index < chunkCount; index += 1) {
		const compressedSize = reader.u32(`chunk ${index} compressedSize`);
		const decompressedSize = reader.u32(`chunk ${index} decompressedSize`);
		const endOffset = reader.u32(`chunk ${index} endOffset`);

		if (start + compressedSize > file.length) {
			throw new Error(
				`Truncated save: chunk ${index} claims ${compressedSize} compressed byte(s) at ${start}, which runs ${
					start + compressedSize - file.length
				} past the end of the ${file.length}-byte file`,
			);
		}
		// Only the last record's 0 is a sentinel meaning "no end recorded". It is
		// the one value allowed to disagree with the walk.
		//
		// A 0 on any *other* record used to be accepted too, which quietly
		// disabled the cross-check for that chunk: a corrupt file could zero the
		// endOffset of every record and never fail, because the only thing being
		// compared was the non-zero case.
		const isFinal = index === chunkCount - 1;
		if (endOffset === 0) {
			if (!isFinal) {
				throw new Error(
					`Corrupt save: chunk ${index} records endOffset 0, which is only a valid sentinel on the final chunk; its bytes span ${start}..${
						start + compressedSize
					}`,
				);
			}
		} else if (endOffset !== start + compressedSize) {
			throw new Error(
				`Corrupt save: chunk ${index} records endOffset ${endOffset} but its bytes span ${start}..${
					start + compressedSize
				}`,
			);
		}

		chunks.push({ index, compressedSize, decompressedSize, endOffset, start });
		start += compressedSize;
	}

	return { chunkCount, headerSize, chunks };
};

/**
 * Header and chunk table only — no decompression. A caller that wants to report
 * chunk sizes, or to check the layout before spending the work, stops here.
 */
export const parseContainer = (file: Uint8Array): SaveContainer => {
	const { chunkCount, headerSize, chunks } = parseTable(file);
	return {
		chunkCount,
		headerSize,
		tableSlotCount: TABLE_SLOT_COUNT,
		chunks,
		fileSize: file.length,
		// Not decompressed: this caller's contract is the layout, not the payload.
		data: new Uint8Array(0),
	};
};

/**
 * Parse, then expand every block and concatenate the results in order. The
 * total length is exactly the sum of the declared `decompressedSize`s, which is
 * the strongest cheap check available that the whole table was read correctly.
 */
export const decompressContainer = (file: Uint8Array): SaveContainer => {
	const { chunkCount, headerSize, chunks } = parseTable(file);

	const total = chunks.reduce((sum, chunk) => sum + chunk.decompressedSize, 0);
	// `parseContainer` validates the layout; this validates the sizes the layout
	// points at. They are separate concerns — a file can be perfectly
	// well-formed at the byte level and still claim a decompression bomb.
	// The bound is therefore here, one layer down, where the allocation
	// actually happens, rather than in a caller: `decompressContainer` is
	// exported and can be called directly, and a ceiling only a caller
	// remembers is a ceiling that does not hold.
	if (total > MAX_DECOMPRESSED_BYTES) {
		throw new Error(
			`Corrupt save: the ${chunkCount} chunk(s) declare ${total} decompressed byte(s), over the ${MAX_DECOMPRESSED_BYTES}-byte ceiling this tool will allocate; a ${file.length}-byte file cannot plausibly expand that far`,
		);
	}
	const data = new Uint8Array(total);
	let written = 0;
	for (const chunk of chunks) {
		const block = file.slice(chunk.start, chunk.start + chunk.compressedSize);
		const expanded = lz4DecompressBlock(block, chunk.decompressedSize);
		data.set(expanded, written);
		written += expanded.length;
	}
	if (written !== total) {
		throw new Error(
			`Corrupt save: wrote ${written} decompressed byte(s) where the chunk table declares ${total}`,
		);
	}

	return {
		chunkCount,
		headerSize,
		tableSlotCount: TABLE_SLOT_COUNT,
		chunks,
		fileSize: file.length,
		data,
	};
};
