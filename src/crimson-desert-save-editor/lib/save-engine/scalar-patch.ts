import { writeU8, writeU16, writeU32, writeU64 } from "./bytes";
import { assertOnlyChanged } from "./raw-diff";

export type ScalarWrite = {
	offset: number;
	size: number;
	value: number;
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
