import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Bytes } from "../../shared/save/bytes";

const SAVES = join(import.meta.dir, "..", "saves");

export const FIXTURE_TIMEOUT_MS = 120_000;

export const smallSave = (): Bytes =>
	new Uint8Array(
		readFileSync(join(SAVES, "ManualSave_8559a_7ea48000_39dc1b8.sav")),
	);

export const largeSave = (): Bytes =>
	new Uint8Array(
		readFileSync(join(SAVES, "ManualSave_52586_7ea48c00_591a1d1.sav")),
	);

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
