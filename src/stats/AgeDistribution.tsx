import { Area } from "@ant-design/charts";
import { Col, Typography } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "../birthdays";

export const AgeDistribution = ({ data }: { data: readonly Birthday[] }) => {
	const { t } = useTranslation();
	const distributionData = useMemo(() => {
		const ages = data.map((b) => b.age);
		if (ages.length === 0) return [];
		const minAge = Math.min(...ages);
		const maxAge = Math.max(...ages);
		const result = [];
		for (let i = minAge; i <= maxAge; i++) {
			const count = data.filter((b) => b.age === i);
			result.push({
				age: i.toString(),
				value: count.length,
				names: count.map((b) => b.name),
			});
		}
		return result;
	}, [data]);

	return (
		<Col xs={24} md={12} style={{ minHeight: 350 }}>
			<Typography.Title level={5}>
				{t("app.statistics.age_distribution")}
			</Typography.Title>
			<Area
				data={distributionData}
				xField="age"
				yField="value"
				height={300}
				shapeField="smooth"
				style={{ fill: "linear-gradient(-90deg, white 0%, #1890ff 100%)" }}
				tooltip={{
					title: (d) => `${t("table.age")} ${d.age}`,
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
