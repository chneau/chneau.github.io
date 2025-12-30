import { Card, ConfigProvider, Layout, Space, Tabs, theme } from "antd";
import { useEffect } from "react";
import { useSnapshot } from "valtio";
import { AppFooter } from "./AppFooter";
import { AppHeader } from "./AppHeader";
import { BirthdayTable } from "./BirthdayTable";
import { CalendarActions } from "./CalendarActions";
import { FilterButtons, FilterSearch } from "./Filter";
import { checkAndNotify } from "./notifications";
import { Statistics } from "./Statistics";
import { dataStore, store } from "./store";
import { TimelineView } from "./TimelineView";

export const App = () => {
	const dataSnap = useSnapshot(dataStore);
	const storeSnap = useSnapshot(store);
	const data = dataSnap.filtered;

	useEffect(() => {
		checkAndNotify(data);
	}, [data]);

	return (
		<ConfigProvider
			theme={{
				algorithm: storeSnap.darkMode
					? theme.darkAlgorithm
					: theme.defaultAlgorithm,
			}}
		>
			<title>{import.meta.env.BUILD_DATE}</title>
			<Layout style={{ minHeight: "100vh" }}>
				<AppHeader data={data} />
				<Layout.Content style={{ padding: 16 }}>
					<Card title="Birthdays" size="small">
						<Space
							orientation="vertical"
							style={{ width: "100%", marginBottom: 16 }}
							size="middle"
						>
							<Space
								wrap
								style={{ justifyContent: "space-between", width: "100%" }}
							>
								<Space wrap>
									<CalendarActions />
								</Space>
								<FilterButtons />
							</Space>
							<FilterSearch style={{ width: "100%" }} />
						</Space>
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
				<AppFooter />
			</Layout>
		</ConfigProvider>
	);
};
