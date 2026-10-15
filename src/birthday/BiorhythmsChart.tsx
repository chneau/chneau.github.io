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
import {
	BIORHYTHM_CYCLES,
	type BiorhythmCycleKey,
	biorhythmWave,
} from "./biorhythm";

export {
	BIORHYTHM_CYCLES,
	biorhythmValue,
	biorhythmWave,
} from "./biorhythm";

type BiorhythmsChartProps = {
	birthday: Date;
};

const CURVE_MIN = -100;
const CURVE_MAX = 100;

const RANGES = [7, 14, 30, 90] as const;
type BiorhythmRange = (typeof RANGES)[number];

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
		const start = dayjs().startOf("day");
		const birth = dayjs(birthday).startOf("day");
		const daysLivedToday = start.diff(birth, "day");

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
						curveType="monotone"
						withDots={false}
						withLegend
						valueFormatter={formatCurveValue}
						yAxisLabel={t("biorhythms.axis_label", {
							defaultValue: "generated curve",
						})}
						yAxisProps={{ domain: [CURVE_MIN, CURVE_MAX] }}
						xAxisProps={{
							interval: Math.max(1, Math.floor(days / 7)),
							minTickGap: 12,
						}}
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
