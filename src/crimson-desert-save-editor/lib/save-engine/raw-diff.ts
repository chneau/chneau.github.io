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
