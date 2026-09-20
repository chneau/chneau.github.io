/**
 * In-place scalar writes, applied and proved.
 *
 * Most of the values this editor changes are fixed-width scalars sitting at a
 * known payload offset: an item's endurance, a dye channel, a bond level, a
 * quest state. Every one of those edits is the same three steps — write the
 * bytes, prove nothing else in the payload moved, then re-encode the container
 * and prove it reopens byte-identically.
 *
 * Doing that once here means the feature modules only have to say *which*
 * offsets hold *what*, and a mistake in one of them cannot skip the proof:
 * `assertOnlyChanged` refuses an edit that touched a byte outside the declared
 * field, and the caller's `commitSave` refuses output that does not round-trip.
 * A batch of related fields — one item's red, green and blue channels, say —
 * costs one diff and one re-encode instead of one per field.
 *
 * `patchScalars` is the pure half, so a feature that has already changed the
 * payload structurally (creating a field, say) can plan its writes against the
 * payload that produced and prove them the same way.
 */

import { writeU8, writeU16, writeU32, writeU64 } from "./bytes";
import { assertOnlyChanged } from "./raw-diff";

/** One fixed-width field to overwrite. */
export type ScalarWrite = {
	/** Payload offset of the field. */
	offset: number;
	/** Width in bytes: 1, 2, 4 or 8. */
	size: number;
	/** New value, unsigned. */
	value: number;
	/** Field name, for the audit record and the failure message. */
	label: string;
};

const SIZES = new Set([1, 2, 4, 8]);

const writeAt = (
	data: Uint8Array,
	offset: number,
	size: number,
	value: number,
): void => {
	if (size === 1) writeU8(data, offset, value);
	else if (size === 2) writeU16(data, offset, value);
	else if (size === 4) writeU32(data, offset, value);
	else writeU64(data, offset, BigInt(value));
};

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => {
	if (a.length !== b.length) return false;
	for (let index = 0; index < a.length; index++) {
		if (a[index] !== b[index]) return false;
	}
	return true;
};

const validate = (
	payload: Uint8Array,
	writes: ScalarWrite[],
): ScalarWrite[] => {
	if (!Array.isArray(writes) || writes.length === 0) {
		throw new Error("A scalar edit requires at least one field");
	}
	const ordered = [...writes].sort((a, b) => a.offset - b.offset);
	for (let index = 0; index < ordered.length; index++) {
		const write = ordered[index] as ScalarWrite;
		if (!Number.isInteger(write.offset) || write.offset < 0) {
			throw new Error(`${write.label} has an invalid payload offset`);
		}
		if (!SIZES.has(write.size)) {
			throw new Error(`${write.label} has an unsupported field width`);
		}
		if (write.offset + write.size > payload.length) {
			throw new Error(`${write.label} extends past the end of the payload`);
		}
		if (!Number.isInteger(write.value) || write.value < 0) {
			throw new Error(`${write.label} must be a whole unsigned number`);
		}
		const limit =
			write.size === 8 ? Number.MAX_SAFE_INTEGER : 2 ** (write.size * 8) - 1;
		if (write.value > limit) {
			throw new Error(
				`${write.label} does not fit in ${write.size} byte${
					write.size === 1 ? "" : "s"
				}`,
			);
		}
		const previous = ordered[index - 1];
		if (previous && write.offset < previous.offset + previous.size) {
			throw new Error(
				`${write.label} overlaps ${previous.label} in the payload`,
			);
		}
	}
	return ordered;
};

/**
 * Overwrites the fields in a copy of `payload` and returns it with the offsets
 * that changed. Rejects overlapping fields, out-of-range values, and a write of
 * the value that is already there — a staged edit that changes nothing is a
 * bug, and the caller filters those out before queueing them.
 */
export const patchScalars = (
	payload: Uint8Array,
	context: string,
	writes: ScalarWrite[],
): { payload: Uint8Array; changed: number[]; labels: string[] } => {
	const ordered = validate(payload, writes);
	const edited = payload.slice();
	for (const write of ordered) {
		const before = payload.slice(write.offset, write.offset + write.size);
		writeAt(edited, write.offset, write.size, write.value);
		const after = edited.slice(write.offset, write.offset + write.size);
		if (sameBytes(before, after)) {
			throw new Error(`${write.label} already holds the requested value`);
		}
	}
	const changed = assertOnlyChanged(
		payload,
		edited,
		ordered.map((write) => ({ start: write.offset, size: write.size })),
		context,
	);
	return {
		payload: edited,
		changed,
		labels: ordered.map((write) => write.label),
	};
};
