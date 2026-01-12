import { Column, type Datum } from "@ant-design/charts";
import { Col, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { store } from "../store";

type StatColumnProps<T extends Datum> = {
	title: string;
	data: T[];
};

export const StatColumn = <T extends Datum>({
	title,
	data,
}: StatColumnProps<T>) => {
	const { t } = useTranslation();
	return (
		<Col xs={24} sm={12} md={8} style={{ minHeight: 250 }}>
			<Typography.Title level={5}>{title}</Typography.Title>
			<Column
				data={data}
				xField="type"
				yField="value"
				height={200}
				axis={{ y: { grid: false } }}
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
