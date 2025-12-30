import { Card, Layout, Tabs, Typography } from "antd";
import { useSnapshot } from "valtio";
import { BirthdayTable } from "./BirthdayTable";
import { FilterButtons, FilterSearch } from "./Filter";
import { Statistics } from "./Statistics";
import { dataStore } from "./store";
import { TimelineView } from "./TimelineView";

export const App = () => {
	const dataSnap = useSnapshot(dataStore);
	const data = dataSnap.filtered;

	return (
		<Layout style={{ minHeight: "100vh" }}>
			<Layout.Header style={{ display: "flex", alignItems: "center" }}>
				<Typography.Title level={3} style={{ color: "white", margin: 0 }}>
					Birthday Tracker
				</Typography.Title>
			</Layout.Header>
			<Layout.Content style={{ padding: 16 }}>
				<Card title="Birthdays" size="small" extra={<FilterButtons />}>
					<FilterSearch />
					<Tabs
						defaultActiveKey="table"
						items={[
							{
								key: "table",
								label: "Table",
								children: <BirthdayTable data={data} />,
							},
							{
								key: "timeline",
								label: "Timeline",
								children: <TimelineView data={data} />,
							},
						]}
					/>
				</Card>
				<Statistics />
			</Layout.Content>
			<Layout.Footer style={{ textAlign: "center" }}>
				Birthday Tracker ©{new Date().getFullYear()}
			</Layout.Footer>
		</Layout>
	);
};
