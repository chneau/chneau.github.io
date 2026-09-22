import {
	BellOutlined,
	ExperimentOutlined,
	GithubOutlined,
	SettingOutlined,
} from "@ant-design/icons";
import {
	Badge,
	Button,
	Dropdown,
	Layout,
	type MenuProps,
	message,
	Space,
	Tooltip,
	Typography,
} from "antd";
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
	onOpenManage?: () => void;
};

type BeforeInstallPromptEvent = Event & {
	readonly platforms: string[];
	readonly userChoice: Promise<{
		outcome: "accepted" | "dismissed";
		platform: string;
	}>;
	prompt(): Promise<void>;
};

export const AppHeader = ({ data, onOpenManage }: AppHeaderProps) => {
	const { t, i18n } = useTranslation();
	const storeSnap = useSnapshot(store);
	const [installPrompt, setInstallPrompt] =
		useState<BeforeInstallPromptEvent>();
	const [notificationState, setNotificationState] =
		useState<NotificationPermission>(() => {
			if (typeof window !== "undefined" && "Notification" in window) {
				return Notification.permission;
			}
			return "default";
		});

	useEffect(() => {
		const handler = (e: Event) => {
			if ("prompt" in e) {
				e.preventDefault();
				setInstallPrompt(e as unknown as BeforeInstallPromptEvent);
			}
		};
		window.addEventListener("beforeinstallprompt", handler);
		return () => window.removeEventListener("beforeinstallprompt", handler);
	}, []);

	const handleToggleNotifications = async () => {
		if (typeof window === "undefined" || !("Notification" in window)) {
			message.warning("Notifications are not supported in this browser");
			return;
		}

		if (notificationState === "denied") {
			message.warning(
				"Notifications are blocked in your browser site settings. Please enable them in browser settings.",
			);
			return;
		}

		const granted = await requestNotificationPermission();
		setNotificationState(Notification.permission);
		if (granted) {
			message.success("Notifications enabled!");
			checkAndNotify(data);
		} else {
			message.info("Notifications not enabled");
		}
	};

	const demoToolsMenu: MenuProps["items"] = [
		{
			key: "test_notif",
			label: "Send Test Notification",
			icon: <BellOutlined />,
			onClick: () => {
				sendTestNotification();
				message.info("Sent test notification");
			},
		},
		{
			key: "simulate_bday",
			label: "Simulate Birthday Celebration",
			icon: "🎉",
			onClick: () => {
				sendTestNotification();
				triggerConfetti();
				message.success("Simulated celebration with confetti!");
			},
		},
	];

	const languageItems = [
		{ key: "en", label: "🇬🇧 English" },
		{ key: "fr", label: "🇫🇷 Français" },
		{ key: "es", label: "🇪🇸 Español" },
		{ key: "de", label: "🇩🇪 Deutsch" },
		{ key: "gd", label: "🇬🇧 Gàidhlig" },
		{ key: "zh", label: "🇨🇳 中文" },
		{ key: "ty", label: "🇵🇫 Tahitien" },
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
				gap: "8px",
				height: "auto",
				lineHeight: "normal",
				paddingBottom: 8,
				paddingTop: 8,
			}}
		>
			<Typography.Title level={3} style={{ color: "white", margin: 0 }}>
				🎂 {t("app.title")}{" "}
				<small style={{ fontSize: "0.5em", opacity: 0.8 }}>
					({BUILD_DATE})
				</small>
			</Typography.Title>
			<Space wrap size="small">
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

				{onOpenManage && (
					<Button
						type="primary"
						icon={<SettingOutlined />}
						onClick={onOpenManage}
					>
						Manage Birthdays
					</Button>
				)}

				{/* Notification status button with clear real-world status feedback */}
				<Tooltip
					title={
						notificationState === "granted"
							? "Notifications are active. Click to verify."
							: notificationState === "denied"
								? "Notifications are blocked in your browser settings."
								: "Click to enable birthday alerts"
					}
				>
					<Button
						onClick={handleToggleNotifications}
						icon={<BellOutlined />}
						aria-label={t("app.header.enable_notifications")}
					>
						{notificationState === "granted" ? (
							<Badge status="success" text="Alerts On" />
						) : notificationState === "denied" ? (
							<Badge status="error" text="Alerts Blocked" />
						) : (
							"Enable Alerts"
						)}
					</Button>
				</Tooltip>

				{/* Consolidated Dev & Demo Tools Dropdown */}
				<Dropdown menu={{ items: demoToolsMenu }} trigger={["click"]}>
					<Button icon={<ExperimentOutlined />} title="Demo & Simulation Tools">
						Demo Tools
					</Button>
				</Dropdown>

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
					icon={<GithubOutlined />}
					aria-label={t("app.header.github")}
				>
					GitHub
				</Button>
			</Space>
		</Layout.Header>
	);
};
