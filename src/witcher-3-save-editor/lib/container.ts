import { ByteReader } from "../../shared/save/bytes";
import { lz4DecompressBlock } from "../../shared/save/lz4";

const MAGIC_SNFH = "SNFH";
const MAGIC_FZLC = "FZLC";

const HEADER_FIXED_SIZE = 16;
const RECORD_SIZE = 12;
const TABLE_SLOT_COUNT = 256;

export const MAX_DECOMPRESSED_BYTES = 1 << 30;

export type ChunkRecord = {
	readonly index: number;
	readonly compressedSize: number;
	readonly decompressedSize: number;
	readonly endOffset: number;
	readonly start: number;
};

export type SaveContainer = {
	readonly chunkCount: number;
	readonly headerSize: number;
	readonly tableSlotCount: number;
	readonly chunks: readonly ChunkRecord[];
	readonly fileSize: number;
	readonly data: Uint8Array<ArrayBuffer>;
};

type ParsedTable = {
	readonly chunkCount: number;
	readonly headerSize: number;
	readonly chunks: readonly ChunkRecord[];
};

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

export const parseContainer = (file: Uint8Array): SaveContainer => {
	const { chunkCount, headerSize, chunks } = parseTable(file);
	return {
		chunkCount,
		headerSize,
		tableSlotCount: TABLE_SLOT_COUNT,
		chunks,
		fileSize: file.length,
		data: new Uint8Array(0),
	};
};

export const decompressContainer = (file: Uint8Array): SaveContainer => {
	const { chunkCount, headerSize, chunks } = parseTable(file);

	const total = chunks.reduce((sum, chunk) => sum + chunk.decompressedSize, 0);
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
