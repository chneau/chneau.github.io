/**
 * Rebuilding a `.sav` container.
 *
 * The decoder next door can inflate a container and read its chunk table; this
 * is the other direction, and it exists because an editor has to hand a file
 * back. It is deliberately small: there is no encoder for the *contents*, only
 * for the envelope.
 *
 * ## Why rebuilding the envelope is enough
 *
 * A `.sav` carries no checksum over its contents. Not in the `SNFH`/`FZLC`
 * header, not in the `SAV3` stream, not in the `SE` footer — the one CRC in the
 * game belongs to the asset *bundle* format, which is a different file. So a
 * save edited in place needs nothing recomputed over the payload.
 *
 * What does need fixing is the chunk table. Each record is three `u32`s —
 * `compressedSize`, `decompressedSize`, `endOffset` — and when a patched block
 * compresses to a different size, every *subsequent* `endOffset` shifts, because
 * `endOffset` is the only absolute file offset in the format. That bookkeeping
 * is 3084 bytes and nothing else refers to it: the `SAV3` header, the footer,
 * the `SC` span index and the variable table all address the **decompressed**
 * stream, whose length a width-preserving edit leaves alone.
 *
 * ## The 3084, and why it is not 3088
 *
 * The header is 16 fixed bytes plus 256 table slots of 12 bytes, which is 3088
 * arithmetically — but the game writes **3084**, and its own reader only requires
 * `headerSize >= 16 + chunkCount * 12`, so a 3088 file parses here and would be
 * a file the game may not accept. The decoder's own container test carries the
 * 3088 constant, so it is an easy thing to inherit by accident; this writes the
 * game's value and says so.
 */

import type { Bytes } from "../../shared/save/bytes";
import type { ChunkRecord, SaveContainer } from "./container";
import { lz4CompressBlock } from "./lz4-write";

/** 16 fixed header bytes + 256 slots × 12 — but see the note above. */
export const HEADER_SIZE = 3084;
const FIXED_HEADER = 16;
const RECORD_SIZE = 12;

const ascii = (value: string): Uint8Array => new TextEncoder().encode(value);

/**
 * Re-emit the container around a decompressed payload.
 *
 * `chunks` must describe the payload in order and the same sizes it was read
 * with — this reuses the caller's chunk boundaries rather than rechunking, so
 * that a `decompressedSize` column copied from the original stays correct and
 * the `SC` span index (which addresses the decompressed stream) is untouched.
 */
/**
 * Rebuild the whole `.sav` from a chunk table and a decompressed payload.
 *
 * Returns `Bytes` — `Uint8Array<ArrayBuffer>` — because it allocates a fresh
 * `ArrayBuffer` and every byte of the file goes into it. The narrower type
 * matters: `decode` takes `Bytes` (WebCrypto will not accept a `SharedArrayBuffer`),
 * so the old `Uint8Array` annotation forced callers to write `as Bytes`, which is
 * a cast between two of *our* types rather than over a third party's — the kind
 * AGENTS.md says buys silence and owes the next reader a lie. The scripts are
 * where it surfaced: `add-item.ts` could not feed its own output back to `decode`
 * without one.
 */
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
		// The final record's `endOffset` is a sentinel, not an offset: the reader
		// treats a non-zero final value as a hard error.
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

/**
 * Rebuild a file from an edited copy of its decompressed payload.
 *
 * `container` is the *original* parse, because the chunk table describes the
 * layout the payload must keep: the sizes are what make a width-preserving edit
 * safe, and re-deriving them from an edited buffer would hide a mistake rather
 * than catch it.
 */
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
