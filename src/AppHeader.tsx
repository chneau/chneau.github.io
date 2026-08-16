import { Button, Dropdown, Layout, Space, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import type { Birthday } from "./birthdays";
import { triggerConfetti } from "./celebration";
import {
	checkAndNotify,
	requestNotificationPermission,
	sendTestNotification,
} from "./notifications";
import { store } from "./store";

declare const BUILD_DATE: string;

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
	const { t, i18n } = useTranslation();
	const storeSnap = useSnapshot(store);
	const [installPrompt, setInstallPrompt] =
		useState<BeforeInstallPromptEvent>();

	useEffect(() => {
		const handler = (e: Event) => {
			if ("prompt" in e) {
				e.preventDefault();
				// Casting Event to BeforeInstallPromptEvent as it's a non-standard browser event not yet in TypeScript's base lib
				setInstallPrompt(e as unknown as BeforeInstallPromptEvent);
			}
		};
		window.addEventListener("beforeinstallprompt", handler);
		return () => window.removeEventListener("beforeinstallprompt", handler);
	}, []);

	const languageItems = [
		{
			key: "en",
			label: "🇬🇧 English",
		},
		{
			key: "fr",
			label: "🇫🇷 Français",
		},
		{
			key: "es",
			label: "🇪🇸 Español",
		},
		{
			key: "de",
			label: "🇩🇪 Deutsch",
		},
		{
			key: "gd",
			label: "🇬🇧 Gàidhlig",
		},
		{
			key: "zh",
			label: "🇨🇳 中文",
		},
		{
			key: "ty",
			label: "🇵🇫 Tahitien",
		},
	];

	const currentLang =
		languageItems
			.find((x) => i18n.language.startsWith(x.key))
			?.label.split(" ")[1] || "EN";
	const currentEmoji =
		languageItems
			.find((x) => i18n.language.startsWith(x.key))
			?.label.split(" ")[0] || "🇬🇧";

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
				{t("app.title")}{" "}
				<small style={{ fontSize: "0.5em", opacity: 0.8 }}>
					({BUILD_DATE})
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
						title={t("app.header.install")}
					>
						📲 {t("app.header.install")}
					</Button>
				)}
				<Button
					onClick={() => sendTestNotification()}
					title={t("app.header.test_notification")}
					aria-label={t("app.header.test_notification")}
				>
					🧪🔔
				</Button>
				<Button
					onClick={() => {
						sendTestNotification();
						triggerConfetti();
					}}
					title={t("app.header.simulate")}
					aria-label={t("app.header.simulate")}
				>
					🧪🎂
				</Button>
				<Button
					onClick={async () => {
						await requestNotificationPermission();
						checkAndNotify(data);
					}}
					title={t("app.header.enable_notifications")}
					aria-label={t("app.header.enable_notifications")}
				>
					🔔
				</Button>
				<Dropdown
					menu={{
						items: languageItems,
						onClick: (e) => {
							i18n.changeLanguage(e.key);
							dayjs.locale(e.key);
						},
						selectedKeys: [i18n.language],
					}}
					trigger={["click"]}
				>
					<Button aria-label="Change language">
						{currentEmoji} {currentLang}
					</Button>
				</Dropdown>
				<Button
					onClick={() => {
						store.darkMode = !store.darkMode;
					}}
					aria-label={
						storeSnap.darkMode ? t("app.header.light") : t("app.header.dark")
					}
				>
					{storeSnap.darkMode
						? `☀️ ${t("app.header.light")}`
						: `🌙 ${t("app.header.dark")}`}
				</Button>
				<Button
					href="https://github.com/chneau/chneau.github.io"
					target="_blank"
					rel="noreferrer"
					title={t("app.header.github")}
					aria-label={t("app.header.github")}
				>
					{t("app.header.github")} 🐙
				</Button>
			</Space>
		</Layout.Header>
	);
};
