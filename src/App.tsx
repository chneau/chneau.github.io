import type { MenuProps } from "antd";
import {
	Button,
	Card,
	ConfigProvider,
	Dropdown,
	Layout,
	message,
	Space,
	Tabs,
	Typography,
	theme,
} from "antd";
import { useEffect } from "react";
import { useSnapshot } from "valtio";
import { BirthdayTable } from "./BirthdayTable";
import { FilterButtons, FilterSearch } from "./Filter";
import { checkAndNotify, requestNotificationPermission } from "./notifications";
import { Statistics } from "./Statistics";
import { dataStore, store } from "./store";
import { TimelineView } from "./TimelineView";

const downloadICS = () => {
	const filename = "birthdays.ics";
	const url = "/birthdays.ics";

	const link = document.createElement("a");
	link.href = url;
	link.setAttribute("download", filename);
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
};

const subscribeICS = () => {
	const url =
		`${window.location.host}${window.location.pathname}/birthdays.ics`.replace(
			/\/+/g,
			"/",
		);
	window.location.assign(`webcal://${url}`);
};

const addToGoogleCalendar = () => {
	const url = `${window.location.origin}/birthdays.ics`;
	const googleUrl = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(
		url,
	)}`;
	window.open(googleUrl, "_blank");
};

const calendarItems: MenuProps["items"] = [
	{
		key: "subscribe",
		label: "Subscribe to Calendar (webcal)",
		icon: "📅",
		onClick: subscribeICS,
	},
	{
		key: "google",
		label: "Add to Google Calendar",
		icon: "🌐",
		onClick: addToGoogleCalendar,
	},
	{
		key: "copy",
		label: "Copy ICS Link",
		icon: "🔗",
		onClick: () => {
			const url = `${window.location.origin}/birthdays.ics`;
			navigator.clipboard.writeText(url);
			message.success("ICS link copied to clipboard!");
		},
	},
	{
		type: "divider",
	},
	{
		key: "download",
		label: "Download ICS File",
		icon: "📥",
		onClick: downloadICS,
	},
];

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
						Birthday Tracker{" "}
						<small style={{ fontSize: "0.5em", opacity: 0.8 }}>
							({import.meta.env.BUILD_DATE})
						</small>
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
								<Space wrap>
									<Dropdown menu={{ items: calendarItems }}>
										<Button type="primary">📅 Calendar Actions</Button>
									</Dropdown>
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
				<Layout.Footer style={{ textAlign: "center" }}>
					Birthday Tracker ©{new Date().getFullYear()}
				</Layout.Footer>
			</Layout>
		</ConfigProvider>
	);
};
