import { Button, Layout, Space, Typography } from "antd";
import { useSnapshot } from "valtio";
import type { Birthday } from "./birthdays";
import { triggerConfetti } from "./celebration";
import {
	checkAndNotify,
	requestNotificationPermission,
	sendTestNotification,
} from "./notifications";
import { store } from "./store";

interface AppHeaderProps {
	data: readonly Birthday[];
}

export const AppHeader = ({ data }: AppHeaderProps) => {
	const storeSnap = useSnapshot(store);

	return (
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
					({document.title})
				</small>
			</Typography.Title>
			<Space wrap>
				<Button
					onClick={() => sendTestNotification()}
					title="Test Notification"
				>
					🧪🔔
				</Button>
				<Button
					onClick={() => {
						sendTestNotification();
						triggerConfetti();
					}}
					title="Simulate Birthday"
				>
					🧪🎂
				</Button>
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
	);
};
