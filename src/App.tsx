import {
	Button,
	Card,
	ConfigProvider,
	Layout,
	Space,
	Tabs,
	Typography,
	theme,
} from "antd";
import { useEffect } from "react";
import { useSnapshot } from "valtio";
import { BirthdayTable } from "./BirthdayTable";
import { FilterButtons, FilterSearch } from "./Filter";
import { downloadICS } from "./ics";
import { checkAndNotify, requestNotificationPermission } from "./notifications";
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
			<Layout style={{ minHeight: "100vh" }}>
				<Layout.Header
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "0 16px",
						flexWrap: "wrap",
						height: "auto",
						lineHeight: "normal",
						paddingBottom: 8,
						paddingTop: 8,
					}}
				>
					<Typography.Title level={3} style={{ color: "white", margin: 0 }}>
						Birthday Tracker
					</Typography.Title>
					<Space>
						<Button
							onClick={async () => {
								await requestNotificationPermission();
								checkAndNotify(data);
							}}
							title="Enable Notifications"
						>
							🔔
						</Button>
						<Button
							onClick={() => {
								store.darkMode = !store.darkMode;
							}}
						>
							{storeSnap.darkMode ? "☀️ Light" : "🌙 Dark"}
						</Button>
					</Space>
				</Layout.Header>
				<Layout.Content style={{ padding: 16 }}>
					<Card title="Birthdays" size="small">
						<Space
							direction="vertical"
							style={{ width: "100%", marginBottom: 16 }}
							size="middle"
						>
							<Space
								wrap
								style={{ justifyContent: "space-between", width: "100%" }}
							>
								<Button onClick={() => downloadICS(data)}>
									📅 Import to Calendar
								</Button>
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
				<Layout.Footer style={{ textAlign: "center" }}>
					Birthday Tracker ©{new Date().getFullYear()}
				</Layout.Footer>
			</Layout>
		</ConfigProvider>
	);
};
