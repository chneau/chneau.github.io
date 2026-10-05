/**
 * What every test that reads a real save needs: the two committed fixtures,
 * read off disk as bytes.
 *
 * Not a test file itself — `bun test` does not collect it — so the suites share
 * one definition of the pair rather than each re-deriving the path and the
 * read. The expensive half (decompressing, walking 228,000 token values) is
 * *not* cached here on purpose: a cache would let one suite's decode be
 * measured against another's, and a test that reads what another test wrote is
 * a test that passes for the wrong reason.
 *
 * ## What the pair is for
 *
 * The two saves are two game builds, and the difference between them is the
 * point rather than incidental:
 *
 *  - `8559a` is one chunk and 299 KB. Progression decodes; the wallet does not,
 *    because that build's item records use a different shape and hold zero
 *    records of the shape `locateMoney` looks for.
 *  - `52586` is five chunks and 1.3 MB, and both progression and money decode.
 *
 * So the smaller fixture is the default for anything about the container or the
 * compressor, and the larger one is used only where money is specifically what
 * is under test. Both are real files the game wrote, which is what makes an
 * assertion about a rebuilt file mean anything.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Bytes } from "../../shared/save/bytes";

const SAVES = join(import.meta.dir, "..", "saves");

/**
 * Bun's default per-test timeout is 5 s, and the 1.3 MB fixture walks roughly
 * 228,000 token values on the way to a document. Two tests in this suite rode
 * the default before it was raised, which is a flake waiting for a slower
 * machine rather than a stable pass, so every fixture test states its own.
 */
export const FIXTURE_TIMEOUT_MS = 120_000;

/** The small save: one chunk, progression only, no wallet. */
export const smallSave = (): Bytes =>
	new Uint8Array(
		readFileSync(join(SAVES, "ManualSave_8559a_7ea48000_39dc1b8.sav")),
	);

/** The large save: five chunks, and the build whose wallet this codec finds. */
export const largeSave = (): Bytes =>
	new Uint8Array(
		readFileSync(join(SAVES, "ManualSave_52586_7ea48c00_591a1d1.sav")),
	);

/**
 * The offsets of the bytes that differ between two equal-length buffers.
 *
 * Returned rather than counted so a caller can assert *both* how many bytes
 * moved and which ones — the count alone would pass for a patch that corrupted
 * an unrelated region and happened to touch the same number of bytes.
 */
export const changedOffsets = (
	before: Uint8Array,
	after: Uint8Array,
): number[] => {
	if (before.length !== after.length) {
		throw new Error(
			`cannot compare buffers of ${before.length} and ${after.length} bytes`,
		);
	}
	const out: number[] = [];
	for (let index = 0; index < before.length; index += 1) {
		if (before[index] !== after[index]) out.push(index);
	}
	return out;
};
