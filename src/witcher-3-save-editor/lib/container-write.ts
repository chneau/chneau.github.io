import type { Bytes } from "../../shared/save/bytes";
import { lz4CompressBlock } from "../../shared/save/lz4";
import type { ChunkRecord, SaveContainer } from "./container";

export const HEADER_SIZE = 3084;
const FIXED_HEADER = 16;
const RECORD_SIZE = 12;

const ascii = (value: string): Uint8Array => new TextEncoder().encode(value);

export const buildContainer = (
	original: readonly ChunkRecord[],
	payload: Uint8Array,
): Bytes => {
	const blocks = original.map((chunk, index) => {
		const start = offsetOf(original, index);
		const end = start + chunk.decompressedSize;
		if (end > payload.length) {
			throw new Error(
				`chunk ${index} runs past the payload (${end} > ${payload.length})`,
			);
		}
		return lz4CompressBlock(payload.subarray(start, end));
	});

	const total = blocks.reduce((sum, block) => sum + block.length, 0);
	const file = new Uint8Array(HEADER_SIZE + total);
	const view = new DataView(file.buffer);

	file.set(ascii("SNFH"), 0);
	file.set(ascii("FZLC"), 4);
	view.setUint32(8, blocks.length, true);
	view.setUint32(12, HEADER_SIZE, true);

	let cursor = HEADER_SIZE;
	blocks.forEach((block, index) => {
		const record = FIXED_HEADER + index * RECORD_SIZE;
		view.setUint32(record, block.length, true);
		view.setUint32(record + 4, original[index]?.decompressedSize ?? 0, true);
		view.setUint32(
			record + 8,
			index === blocks.length - 1 ? 0 : cursor + block.length,
			true,
		);
		file.set(block, cursor);
		cursor += block.length;
	});

	return file;
};

const offsetOf = (chunks: readonly ChunkRecord[], index: number): number => {
	let at = 0;
	for (let i = 0; i < index; i += 1) {
		at += chunks[i]?.decompressedSize ?? 0;
	}
	return at;
};

export const rebuildFrom = (
	container: SaveContainer,
	editedPayload: Uint8Array,
): Uint8Array => {
	if (editedPayload.length !== container.data.length) {
		throw new Error(
			`the edited payload is ${editedPayload.length} bytes but the save's is ${container.data.length}; only same-width edits can be written`,
		);
	}
	return buildContainer(container.chunks, editedPayload);
};
