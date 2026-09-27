import { LineChart } from "@mantine/charts";
import { Title } from "@mantine/core";
import dayjs from "dayjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

type BiorhythmsChartProps = {
	birthday: Date;
};

const CYCLES = [
	{ key: "physical", period: 23, color: "teal.5" },
	{ key: "emotional", period: 28, color: "blue.5" },
	{ key: "intellectual", period: 33, color: "yellow.6" },
] as const;

export const BiorhythmsChart = ({ birthday }: BiorhythmsChartProps) => {
	const { t } = useTranslation();

	const data = useMemo(() => {
		const result: Record<string, string | number>[] = [];
		const start = dayjs().startOf("day");
		const birth = dayjs(birthday).startOf("day");

		for (let i = 0; i < 30; i++) {
			const current = start.add(i, "day");
			const daysLived = current.diff(birth, "day");
			const row: Record<string, string | number> = {
				day: current.format("MMM DD"),
			};
			for (const { key, period } of CYCLES) {
				row[key] = Math.sin((2 * Math.PI * daysLived) / period) * 100;
			}
			result.push(row);
		}
		return result;
	}, [birthday]);

	const series = CYCLES.map((cycle) => ({
		name: cycle.key,
		label: t(`biorhythms.${cycle.key}`),
		color: cycle.color,
	}));

	return (
		<div style={{ marginTop: 16 }}>
			<Title order={5}>{t("biorhythms.title")}</Title>
			<LineChart
				h={200}
				data={data}
				dataKey="day"
				series={series}
				curveType="natural"
				withDots={false}
				withLegend
				valueFormatter={(value) => `${Math.round(value)}%`}
				yAxisProps={{ domain: [-100, 100] }}
				xAxisProps={{ interval: 4 }}
			/>
		</div>
	);
};
