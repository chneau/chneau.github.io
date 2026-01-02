import { Button, Layout, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { useSnapshot } from "valtio";
import type { Birthday } from "./birthdays";
import { triggerConfetti } from "./celebration";
import {
	checkAndNotify,
	requestNotificationPermission,
	sendTestNotification,
} from "./notifications";
import { store } from "./store";

type AppHeaderProps = {
	data: readonly Birthday[];
};

type BeforeInstallPromptEvent = Event & {
	readonly platforms: string[];
	readonly userChoice: Promise<{
		outcome: "accepted" | "dismissed";
		platform: string;
	}>;
	prompt(): Promise<void>;
};

export const AppHeader = ({ data }: AppHeaderProps) => {
	const storeSnap = useSnapshot(store);
	const [installPrompt, setInstallPrompt] =
		useState<BeforeInstallPromptEvent>();

	useEffect(() => {
		const handler = (e: Event) => {
			e.preventDefault();
			setInstallPrompt(e as unknown as BeforeInstallPromptEvent);
		};
		window.addEventListener("beforeinstallprompt", handler);
		return () => window.removeEventListener("beforeinstallprompt", handler);
	}, []);

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
				{installPrompt && (
					<Button
						onClick={async () => {
							if (installPrompt) {
								installPrompt.prompt();
								const { outcome } = await installPrompt.userChoice;
								if (outcome === "accepted") {
									setInstallPrompt(undefined);
								}
							}
						}}
						title="Install App"
					>
						📲 Install
					</Button>
				)}
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
				<Button
					href="https://github.com/chneau/chneau.github.io"
					target="_blank"
					rel="noreferrer"
					title="View on GitHub"
				>
					GitHub 🐙
				</Button>
			</Space>
		</Layout.Header>
	);
};
