import { Heatmap } from "@ant-design/charts";
import { Col, Typography } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type Birthday, monthNames } from "../birthdays";

export const BirthHeatmap = ({ data }: { data: readonly Birthday[] }) => {
	const { t } = useTranslation();
	const heatmapData = useMemo(() => {
		const months = Array.from({ length: 12 }, (_, i) => i);
		const days = Array.from({ length: 31 }, (_, i) => i + 1);

		return months.flatMap((m) =>
			days.flatMap((d) => {
				const births = data.filter((x) => x.month === m + 1 && x.day === d);
				if (births.length === 0) return [];
				const key = monthNames[m];
				if (!key) throw new Error(`Invalid month index ${m}`);
				return [
					{
						month: t(`data.months.${key}`),
						day: d.toString(),
						value: births.length,
						names: births.map((b) => b.name),
					},
				];
			}),
		);
	}, [data, t]);

	return (
		<Col xs={24} style={{ minHeight: 350 }}>
			<Typography.Title level={5}>
				{t("app.statistics.birth_heatmap")}
			</Typography.Title>
			<Heatmap
				data={heatmapData}
				xField="day"
				yField="month"
				colorField="value"
				height={300}
				mark="cell"
				style={{ inset: 0.5 }}
				scale={{
					x: {
						type: "band",
						domain: Array.from({ length: 31 }, (_, i) => (i + 1).toString()),
					},
					y: {
						type: "band",
						domain: monthNames.map((m) => t(`data.months.${m}`)),
					},
				}}
				tooltip={{
					title: (d) => `${d.month} ${d.day}`,
					items: [
						{ field: "value", name: t("app.statistics.count") },
						{
							field: "names",
							name: t("table.name"),
							valueFormatter: (v: string[]) => v.join(", "),
						},
					],
				}}
			/>
		</Col>
	);
};
