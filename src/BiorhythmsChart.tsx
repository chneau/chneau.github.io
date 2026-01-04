import { Line } from "@ant-design/charts";
import { Typography } from "antd";
import dayjs from "dayjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

type BiorhythmsChartProps = {
	birthday: Date;
};

export const BiorhythmsChart = ({ birthday }: BiorhythmsChartProps) => {
	const { t } = useTranslation();
	const data = useMemo(() => {
		const result = [];
		const start = dayjs().startOf("day");
		const birth = dayjs(birthday).startOf("day");

		for (let i = 0; i < 30; i++) {
			const current = start.add(i, "day");
			const daysLived = current.diff(birth, "day");

			const calculateCycle = (days: number, period: number) =>
				Math.sin((2 * Math.PI * days) / period) * 100;

			result.push({
				day: current.format("MMM DD"),
				value: calculateCycle(daysLived, 23),
				type: "Physical",
			});
			result.push({
				day: current.format("MMM DD"),
				value: calculateCycle(daysLived, 28),
				type: "Emotional",
			});
			result.push({
				day: current.format("MMM DD"),
				value: calculateCycle(daysLived, 33),
				type: "Intellectual",
			});
		}
		return result;
	}, [birthday]);

	return (
		<div style={{ marginTop: 16 }}>
			<Typography.Title level={5}>{t("biorhythms")}</Typography.Title>
			<Line
				data={data}
				xField="day"
				yField="value"
				colorField="type"
				height={200}
				seriesField="type"
				smooth={true}
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
		</div>
	);
};
