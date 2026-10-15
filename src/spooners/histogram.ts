export type Bin = { start: number; end: number; count: number };

export const buildHistogram = (prices: number[]): Bin[] => {
	if (!prices.length) {
		return [];
	}
	const min = Math.floor(Math.min(...prices) * 2) / 2;
	const max = Math.ceil(Math.max(...prices) * 2) / 2;
	const span = Math.max(max - min, 0.5);
	const step = Math.max(0.25, Math.round((span / 10) * 4) / 4);
	const bins: Bin[] = [];
	for (let start = min; start < max - 1e-9; start += step) {
		bins.push({ start, end: start + step, count: 0 });
	}
	if (!bins.length) {
		bins.push({ start: min, end: min + step, count: 0 });
	}
	for (const price of prices) {
		const index = Math.min(
			bins.length - 1,
			Math.max(0, Math.floor((price - min) / step)),
		);
		const bin = bins[index];
		if (bin) {
			bin.count += 1;
		}
	}
	return bins;
};

export const medianPosition = (
	median: number | undefined,
	scale: { min: number; max: number },
): number | null =>
	median != null && scale.max > scale.min
		? ((median - scale.min) / (scale.max - scale.min)) * 100
		: null;
