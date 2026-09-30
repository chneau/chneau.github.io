import { LineChart } from "@mantine/charts";
import {
	Alert,
	Group,
	type MantineColor,
	SegmentedControl,
	Text,
	Title,
	useComputedColorScheme,
} from "@mantine/core";
import dayjs from "dayjs";
import { Info } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type BiorhythmsChartProps = {
	birthday: Date;
};

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

type BiorhythmCycleKey = (typeof BIORHYTHM_CYCLES)[number]["key"];

/** The curve never leaves this band: it is the range of `sin()` scaled by 100. */
const CURVE_MIN = -100;
const CURVE_MAX = 100;

/** Windows the reader can page through. */
const RANGES = [7, 14, 30, 90] as const;
type BiorhythmRange = (typeof RANGES)[number];

/**
 * Series colours are picked per colour scheme rather than left to a single
 * tuple, which is the only way to get both themes legible.
 *
 * `@mantine/charts` resolves `series[].color` through `getThemeColor`, which
 * only wraps the string in `var(--mantine-color-<name>-<shade>)`. Those
 * variables are emitted once, in `:root`, and are *not* re-declared under
 * `[data-mantine-color-scheme='dark']` - so one fixed shade is literally the
 * same hex on `#ffffff` and on `#141414`, and cannot clear 3:1 on both. The old
 * `teal.5`/`blue.5`/`yellow.6` measured 2.13 / 2.99 / 1.86 on white: the chart
 * was effectively invisible in light mode. Dark takes the light end of each
 * ramp, light the dark end; every value below clears 3:1 (WCAG non-text
 * contrast) against its own background.
 *
 * The third series is `orange` rather than `yellow`: no yellow shade reaches
 * 3:1 on white (the darkest, `yellow.9` #e67700, manages 3.00), and a brownish
 * amber is a worse trade than an adjacent hue. Both schemes keep orange so the
 * reader can still recognise the same three colours when toggling the theme.
 */
const CYCLE_COLORS = {
	light: {
		physical: "teal.8",
		emotional: "blue.8",
		intellectual: "orange.8",
	},
	dark: {
		physical: "teal.3",
		emotional: "blue.3",
		intellectual: "orange.3",
	},
} as const satisfies Record<
	"light" | "dark",
	Record<BiorhythmCycleKey, MantineColor>
>;

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

/**
 * Axis and tooltip values. Deliberately no percent sign: the number is a
 * scaled `sin()`, and a "%" is what makes the chart read as a measurement.
 */
const formatCurveValue = (value: number): string => {
	const rounded = Math.round(value);
	return rounded > 0 ? `+${rounded}` : `${rounded}`;
};

export const BiorhythmsChart = ({ birthday }: BiorhythmsChartProps) => {
	const { t } = useTranslation();
	const [days, setDays] = useState<BiorhythmRange>(30);
	const colorScheme = useComputedColorScheme();
	const palette = CYCLE_COLORS[colorScheme];

	const { data, anchorable } = useMemo(() => {
		// "Today" is read once per recomputation rather than once per point, so
		// a window is anchored to a single day and cannot straddle midnight
		// halfway through the loop. It is intentionally not live: the chart only
		// recomputes when the birthday or the window changes.
		const start = dayjs().startOf("day");
		const birth = dayjs(birthday).startOf("day");
		const daysLivedToday = start.diff(birth, "day");

		// An unparseable date, or one in the future, leaves nothing to anchor
		// the phase to. Say so instead of drawing a curve that implies a
		// measurement of a person who does not exist yet.
		const anchorable =
			birth.isValid() && Number.isFinite(daysLivedToday) && daysLivedToday >= 0;

		const rows: Record<string, string | number>[] = [];
		for (let i = 0; i < days; i++) {
			const current = start.add(i, "day");
			rows.push({
				day: current.format("MMM DD"),
				...biorhythmWave(current.diff(birth, "day")),
			});
		}
		return { data: rows, anchorable };
	}, [birthday, days]);

	// The legend names the curves as claims, not states: "Physical · 23-day
	// belief" rather than a bare "Physical", which reads as a reading.
	const series = BIORHYTHM_CYCLES.map(({ key, period }) => ({
		name: key,
		label: `${t(`biorhythms.${key}`)} · ${t("biorhythms.cycle_belief", {
			days: period,
			defaultValue: "{{days}}-day belief",
		})}`,
		color: palette[key],
	}));

	return (
		<div style={{ marginTop: 16 }}>
			<Title order={5}>{t("biorhythms.title")}</Title>

			{/*
			 * The disclosure sits above the plot rather than under it. A caption
			 * below the chart is the first thing a reader skips, and the whole
			 * problem with the old y-axis is that it looks like data until you
			 * read a line saying it is not data.
			 */}
			<Alert
				color="yellow"
				variant="light"
				icon={<Info size={16} strokeWidth={1.9} aria-hidden />}
				mb="sm"
				styles={{ message: { fontSize: 12, lineHeight: 1.5 } }}
			>
				{t("biorhythms.disclaimer", {
					defaultValue:
						"Biorhythms are a popular belief, not a scientifically supported measure. The three curves below are generated from the birth date by a fixed sine formula - no measurement of you, your health or your mood is involved, and a point on a curve does not mean anything.",
				})}
			</Alert>

			{anchorable ? (
				<>
					<Group gap="xs" mb={4} wrap="nowrap" align="center">
						<Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
							{t("biorhythms.range", { defaultValue: "Range" })}
						</Text>
						<SegmentedControl
							size="xs"
							fullWidth
							value={String(days)}
							onChange={(value) => setDays(Number(value) as BiorhythmRange)}
							data={RANGES.map((range) => ({
								value: String(range),
								label: t("biorhythms.range_days", {
									days: range,
									defaultValue: "{{days}}d",
								}),
							}))}
						/>
					</Group>

					<LineChart
						h={200}
						data={data}
						dataKey="day"
						series={series}
						// `monotone`, not `natural`: both are cubic splines, but
						// `natural` overshoots between sample points, which on a
						// curve whose domain is pinned to [-100, 100] would draw
						// values the maths never produced. `monotone` cannot.
						curveType="monotone"
						withDots={false}
						withLegend
						valueFormatter={formatCurveValue}
						// Rendered rotated along a 200px axis, so the label is kept
						// short: "generated curve" is the whole claim. The longer
						// version of it lives in the alert above.
						yAxisLabel={t("biorhythms.axis_label", {
							defaultValue: "generated curve",
						})}
						yAxisProps={{ domain: [CURVE_MIN, CURVE_MAX] }}
						xAxisProps={{
							interval: Math.max(1, Math.floor(days / 7)),
							minTickGap: 12,
						}}
						// The chart animates nothing, deliberately. `@mantine/charts`
						// already sets `isAnimationActive: false` on every line and
						// defaults the tooltip to 0ms; both are re-pinned here so a
						// library bump cannot start animating a chart that is mounted
						// inside every expandable table row. `lineProps` is spread
						// *after* Mantine's own line config, so this is the flag that
						// actually wins. It is the `prefers-reduced-motion` guarantee:
						// the curves appear already drawn, for everyone.
						lineProps={{ isAnimationActive: false }}
						tooltipAnimationDuration={0}
					/>
				</>
			) : (
				<Text size="sm" c="dimmed">
					{t("biorhythms.unknown_birth", {
						defaultValue:
							"This birthday has no usable birth date yet, so there is no day zero to anchor the curves to. Nothing is plotted.",
					})}
				</Text>
			)}

			<Text size="xs" c="dimmed" mt={8} style={{ lineHeight: 1.5 }}>
				{t("biorhythms.formula_note", {
					defaultValue:
						"How it is drawn: value = sin(2*PI * days since birth / period) * 100, with periods of 23, 28 and 33 days. The axes are the curve's own output, not measurements of anyone.",
				})}
			</Text>
		</div>
	);
};
