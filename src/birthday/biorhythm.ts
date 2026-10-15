export const BIORHYTHM_CYCLES = [
	{ key: "physical", period: 23 },
	{ key: "emotional", period: 28 },
	{ key: "intellectual", period: 33 },
] as const;

export type BiorhythmCycleKey = (typeof BIORHYTHM_CYCLES)[number]["key"];

export const biorhythmValue = (daysLived: number, period: number): number => {
	if (!Number.isFinite(period) || period <= 0) return 0;
	if (!Number.isFinite(daysLived)) return 0;

	const day = daysLived < 0 ? 0 : daysLived;

	const phase = ((day % period) + period) % period;

	return Math.sin((2 * Math.PI * phase) / period) * 100;
};

export const biorhythmWave = (
	daysLived: number,
): Record<BiorhythmCycleKey, number> => {
	const wave: Record<BiorhythmCycleKey, number> = {
		physical: 0,
		emotional: 0,
		intellectual: 0,
	};
	for (const { key, period } of BIORHYTHM_CYCLES) {
		wave[key] = biorhythmValue(daysLived, period);
	}
	return wave;
};
