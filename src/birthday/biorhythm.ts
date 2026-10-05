/**
 * The biorhythm curves, as data and arithmetic.
 *
 * These live apart from `BiorhythmsChart.tsx` so the formula can be reasoned
 * about (and tested) without the chart, the theme and Mantine in the way: the
 * component file is presentation, this file is the claim being drawn.
 */

/**
 * The three cycles biorhythmology claims a person runs on, and the only
 * inputs the chart below ever uses. Nothing here is measured: see
 * `biorhythmValue` for the full statement of what the curves are.
 */
export const BIORHYTHM_CYCLES = [
	{ key: "physical", period: 23 },
	{ key: "emotional", period: 28 },
	{ key: "intellectual", period: 33 },
] as const;

export type BiorhythmCycleKey = (typeof BIORHYTHM_CYCLES)[number]["key"];

/**
 * The one formula behind every point on the chart, in full:
 *
 *     value(day) = sin(2 * PI * daysLived(day) / period) * 100
 *
 * `daysLived(day)` is the whole number of days from the birth date to `day`,
 * anchored on the birthday itself, and `period` is 23, 28 or 33 days
 * depending on the cycle. That is the whole thing: no input from the person,
 * their sleep, their mood, or any observation of any kind.
 *
 * It follows that the curve is a fixed shape slid along the calendar, and the
 * properties that make that worth saying out loud:
 *
 *  - **It is zero on the birth date.** `sin(0) === 0`, so day 0 of every
 *    cycle sits on the axis. That is the anchor, not a low reading.
 *  - **It repeats every `period` days**, exactly, which is why a 30-day window
 *    shows a bit over one lap of each cycle and nothing else changes.
 *  - **A calendar year is deliberately not a period.** 365 is not a multiple of
 *    23, 28 or 33, so the curve deliberately does *not* line up with birthdays,
 *    months or seasons. Biorhythmology is not a calendar.
 *  - **The value is not a percentage.** It is `sin()` scaled by 100, so "72"
 *    means "the sine returned 0.72", not "72% of your capacity". Nothing behind
 *    the number is an observation of the person it is drawn for.
 *
 * @param daysLived Whole days from the birth date. Negative means the anchor
 *   lies in the future (unknown or wrong birth year).
 * @param period Cycle length in days; must be positive and finite.
 * @returns A number in `[-100, 100]`, or `0` when the inputs cannot produce a
 *   meaningful point.
 */
export const biorhythmValue = (daysLived: number, period: number): number => {
	if (!Number.isFinite(period) || period <= 0) return 0;
	if (!Number.isFinite(daysLived)) return 0;

	// A future or unknown birth date would otherwise be extrapolated backwards
	// and drawn as a real reading for someone who does not exist yet. There is
	// no honest curve to the left of the anchor, so the anchor is the floor.
	const day = daysLived < 0 ? 0 : daysLived;

	// Fold the phase into `[0, period)` before the sine. `sin` is exactly
	// 2*PI-periodic, so this changes no value - but it also stops the argument
	// from growing with the age of the record: a birth date in the year 1000 is
	// ~375,000 days out, and `2 * PI * 375000 / 23` is ~102,000 radians, which
	// is large enough for floating-point `sin` to lose real accuracy. Folding
	// first keeps every argument under 2*PI regardless of how old the record
	// is, so a year-1000 birthday yields exactly the same value as a 1990 one.
	const phase = ((day % period) + period) % period;

	return Math.sin((2 * Math.PI * phase) / period) * 100;
};

/** All three cycles for a single day, ready to drop into a chart row. */
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
