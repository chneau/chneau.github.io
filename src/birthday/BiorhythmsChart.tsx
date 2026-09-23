import {
	ConfigProvider as ChartConfigProvider,
	Line,
} from "@ant-design/charts";
import { Typography } from "antd";
import dayjs from "dayjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { store } from "./store";

type BiorhythmsChartProps = {
	birthday: Date;
};

export const BiorhythmsChart = ({ birthday }: BiorhythmsChartProps) => {
	const { t } = useTranslation();
	const { darkMode } = useSnapshot(store);

	const data = useMemo(() => {
		const result = [];
		const start = dayjs().startOf("day");
		const birth = dayjs(birthday).startOf("day");
		const cycles = [
			{ period: 23, type: t("biorhythms.physical") },
			{ period: 28, type: t("biorhythms.emotional") },
			{ period: 33, type: t("biorhythms.intellectual") },
		];

		for (let i = 0; i < 30; i++) {
			const current = start.add(i, "day");
			const daysLived = current.diff(birth, "day");
			const dayLabel = current.format("MMM DD");

			for (const { period, type } of cycles) {
				result.push({
					day: dayLabel,
					value: Math.sin((2 * Math.PI * daysLived) / period) * 100,
					type,
				});
			}
		}
		return result;
	}, [birthday, t]);

	return (
		<div style={{ marginTop: 16 }}>
			<Typography.Title level={5}>{t("biorhythms.title")}</Typography.Title>
			<ChartConfigProvider common={{ theme: darkMode ? "dark" : "light" }}>
				<Line
					data={data}
					theme={darkMode ? "dark" : "light"}
					xField="day"
					yField="value"
					colorField="type"
					height={200}
					seriesField="type"
					smooth={true}
					legend={{
						color: {
							itemLabelFill: darkMode
								? "rgba(255, 255, 255, 0.85)"
								: "rgba(0, 0, 0, 0.88)",
						},
					}}
					axis={{
						y: {
							labelFormatter: (v: number) => `${Math.round(v)}%`,
						},
					}}
					tooltip={{
						title: (d) => d.day,
						items: [
							{
								channel: "y",
								valueFormatter: (v: number) => `${Math.round(v)}%`,
							},
						],
					}}
				/>
			</ChartConfigProvider>
		</div>
	);
};
