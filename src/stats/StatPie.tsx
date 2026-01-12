import { type Datum, Pie } from "@ant-design/charts";
import { Col, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { store } from "../store";

type StatPieProps<T extends Datum> = {
	title: string;
	data: T[];
};

export const StatPie = <T extends Datum>({ title, data }: StatPieProps<T>) => {
	const { t } = useTranslation();
	return (
		<Col xs={24} sm={12} md={8} style={{ minHeight: 300 }}>
			<Typography.Title level={5}>{title}</Typography.Title>
			<Pie
				data={data}
				angleField="value"
				colorField="type"
				height={250}
				legend={{ layout: "horizontal", position: "bottom" }}
				label={{ text: "value", position: "outside" }}
				tooltip={{
					title: (d) => d.type,
					items: [
						{ field: "value", channel: "y", name: t("app.statistics.count") },
						{
							field: "names",
							channel: "color",
							name: t("table.name"),
							valueFormatter: (v: string[]) => v.join(", "),
						},
					],
				}}
				onEvent={(_, event) => {
					if (event.type === "element:click") {
						const datum = event.data?.data;
						if (datum?.type) {
							store.search = datum.type;
							window.scrollTo({ top: 0, behavior: "smooth" });
						}
					}
				}}
			/>
		</Col>
	);
};
