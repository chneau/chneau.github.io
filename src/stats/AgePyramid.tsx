import { Bar } from "@ant-design/charts";
import { Col, Typography } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "../birthdays";

export const AgePyramid = ({ data }: { data: readonly Birthday[] }) => {
	const { t } = useTranslation();
	const pyramidData = useMemo(() => {
		const groups = [
			"0-9",
			"10-19",
			"20-29",
			"30-39",
			"40-49",
			"50-59",
			"60-69",
			"70-79",
			"80-89",
			"90+",
		];

		return groups.flatMap((group) => {
			const range = group === "90+" ? [90, 200] : group.split("-").map(Number);
			const range0 = range[0] as number;
			const range1 = range[1] as number;
			const boys = data.filter(
				(b) => b.kind === "♂️" && b.age >= range0 && b.age <= range1,
			);
			const girls = data.filter(
				(b) => b.kind === "♀️" && b.age >= range0 && b.age <= range1,
			);

			return [
				{
					group,
					gender: "♂️",
					value: -boys.length,
					names: boys.map((b) => b.name),
				},
				{
					group,
					gender: "♀️",
					value: girls.length,
					names: girls.map((b) => b.name),
				},
			];
		});
	}, [data]);

	return (
		<Col xs={24} md={12} style={{ minHeight: 350 }}>
			<Typography.Title level={5}>
				{t("app.statistics.pyramid")}
			</Typography.Title>
			<Bar
				data={pyramidData}
				xField="group"
				yField="value"
				seriesField="gender"
				stack={true}
				height={300}
				coordinate={{ transform: [{ type: "transpose" }] }}
				axis={{
					y: {
						labelFormatter: (v: number) => Math.abs(v),
					},
				}}
				tooltip={{
					title: (d) => d.group,
					items: [
						{
							channel: "y",
							name: t("app.statistics.count"),
							valueFormatter: (v: number) => Math.abs(v),
						},
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
