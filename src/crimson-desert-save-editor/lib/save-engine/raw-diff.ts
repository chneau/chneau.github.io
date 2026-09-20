/**
 * Proof that an in-place edit touched only the bytes it meant to.
 *
 * Every scalar edit in the engine — a quantity, a refinement level, a socket
 * count, a socket's item key — rewrites one fixed-width field inside the raw
 * payload and then has to show that nothing around it moved. The payload is
 * re-serialized by the PARC writer on the way out, so the only way to be sure
 * the write stayed local is to diff the payload before and after.
 *
 * Each call site used to do this its own way, with its own message. This is
 * that check, once: the caller names the field it intended to touch and gets
 * back the offsets that changed, for its audit record.
 */

/** A half-open range of raw-payload offsets: `[start, start + size)`. */
type ByteRange = { start: number; size: number };

const covers = (offset: number, ranges: ByteRange[]): boolean =>
	ranges.some(
		(range) => offset >= range.start && offset < range.start + range.size,
	);

const describeRanges = (ranges: ByteRange[]): string =>
	ranges
		.map((range) =>
			range.size === 1
				? `byte ${range.start}`
				: `bytes ${range.start}..${range.start + range.size - 1}`,
		)
		.join(", ");

/**
 * Diff two same-length payloads and assert every changed byte landed inside
 * `ranges`. Returns the changed offsets in ascending order.
 *
 * Throws when the edit resized the payload, when it changed a byte outside the
 * field it claimed, or when it changed nothing at all — a staged edit that
 * silently does nothing is a bug, not a no-op. `context` names the edit so the
 * failure says which field escaped.
 */
export const assertOnlyChanged = (
	before: Uint8Array,
	after: Uint8Array,
	ranges: ByteRange[],
	context: string,
): number[] => {
	if (before.length !== after.length) {
		throw new Error(`${context} must not change the raw payload size`);
	}
	const changed: number[] = [];
	for (let index = 0; index < before.length; index++) {
		if (before[index] === after[index]) continue;
		if (!covers(index, ranges)) {
			throw new Error(
				`${context} changed byte ${index}, outside ${describeRanges(ranges)}`,
			);
		}
		changed.push(index);
	}
	if (changed.length === 0) {
		throw new Error(`${context} did not change any bytes`);
	}
	return changed;
};
