import { Menu, Tooltip } from "@mantine/core";
import dayjs from "dayjs";
import {
	Bell,
	Cake,
	Check,
	Download,
	FlaskConical,
	Languages,
	Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import {
	AppHeader as AppHeaderShell,
	BackHome,
	Brand,
	HeaderAction,
	SchemeToggle,
	StatusDot,
} from "../shared";
import type { Birthday } from "./birthdays";
import { triggerConfetti } from "./celebration";
import {
	checkAndNotify,
	requestNotificationPermission,
	sendTestNotification,
} from "./notifications";
import { notify } from "./notify";
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

const GitHubMark = ({ size = 15 }: { size?: number }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 16 16"
		fill="currentColor"
		aria-hidden="true"
	>
		<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
	</svg>
);

const LANGUAGES = [
	{ key: "en", label: "English", short: "EN" },
	{ key: "fr", label: "Français", short: "FR" },
	{ key: "es", label: "Español", short: "ES" },
	{ key: "de", label: "Deutsch", short: "DE" },
	{ key: "gd", label: "Gàidhlig", short: "GD" },
	{ key: "zh", label: "中文", short: "ZH" },
	{ key: "ty", label: "Tahitien", short: "TY" },
];

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
			notify.warning("Notifications are not supported in this browser");
			return;
		}
		if (notificationState === "denied") {
			notify.warning(
				"Notifications are blocked in your browser settings. Enable them to receive alerts.",
			);
			return;
		}
		const granted = await requestNotificationPermission();
		setNotificationState(Notification.permission);
		if (granted) {
			notify.success("Notifications enabled");
			checkAndNotify(data);
		} else {
			notify.info("Notifications not enabled");
		}
	};

	const demoToolsMenu = [
		{
			key: "test_notif",
			label: "Send test notification",
			icon: <Bell size={14} />,
			onClick: () => {
				sendTestNotification();
				notify.info("Sent test notification");
			},
		},
		{
			key: "simulate_bday",
			label: "Simulate celebration",
			icon: <Cake size={14} />,
			onClick: () => {
				sendTestNotification();
				triggerConfetti();
				notify.success("Simulated a celebration");
			},
		},
	];

	const current = LANGUAGES.find((x) => i18n.language.startsWith(x.key)) ?? {
		key: "en",
		label: "English",
		short: "EN",
	};

	const notificationsOn = notificationState === "granted";
	const notificationsBlocked = notificationState === "denied";

	return (
		<AppHeaderShell
			brand={
				<Brand
					href="/"
					icon={<Cake size={18} strokeWidth={1.9} />}
					title={t("app.title")}
					subtitle={`build ${BUILD_DATE}`}
				/>
			}
			actions={
				<>
					<BackHome />
					{installPrompt && (
						<HeaderAction
							icon={<Download size={15} />}
							onClick={async () => {
								installPrompt.prompt();
								const { outcome } = await installPrompt.userChoice;
								if (outcome === "accepted") setInstallPrompt(undefined);
							}}
						>
							{t("app.header.install")}
						</HeaderAction>
					)}

					<Tooltip
						label={
							notificationsOn
								? "Alerts are active. Click to verify."
								: notificationsBlocked
									? "Alerts are blocked in your browser settings."
									: "Enable birthday alerts"
						}
					>
						<HeaderAction
							label={t("app.header.enable_notifications")}
							active={notificationsOn}
							onClick={handleToggleNotifications}
							icon={
								<>
									{notificationState === "default" ? (
										<span className="app-statusdot" aria-hidden="true" />
									) : (
										<StatusDot on={notificationsOn} />
									)}
									<Bell size={15} />
								</>
							}
						>
							{notificationsOn
								? "Alerts on"
								: notificationsBlocked
									? "Alerts blocked"
									: "Enable alerts"}
						</HeaderAction>
					</Tooltip>

					<Menu position="bottom-end" shadow="md" withinPortal>
						<Menu.Target>
							<HeaderAction icon={<FlaskConical size={15} />}>
								Demo
							</HeaderAction>
						</Menu.Target>
						<Menu.Dropdown>
							{demoToolsMenu.map((item) => (
								<Menu.Item
									key={item.key}
									leftSection={item.icon}
									onClick={item.onClick}
								>
									{item.label}
								</Menu.Item>
							))}
						</Menu.Dropdown>
					</Menu>

					<Menu position="bottom-end" shadow="md" withinPortal>
						<Menu.Target>
							<HeaderAction
								label="Change language"
								icon={<Languages size={15} />}
							>
								{current.short}
							</HeaderAction>
						</Menu.Target>
						<Menu.Dropdown>
							{LANGUAGES.map((x) => {
								const isCurrent = i18n.language.startsWith(x.key);
								return (
									<Menu.Item
										key={x.key}
										c={isCurrent ? "teal" : undefined}
										fw={isCurrent ? 600 : undefined}
										rightSection={isCurrent ? <Check size={14} /> : undefined}
										onClick={() => {
											i18n.changeLanguage(x.key);
											dayjs.locale(x.key);
										}}
									>
										{x.label}
									</Menu.Item>
								);
							})}
						</Menu.Dropdown>
					</Menu>

					<HeaderAction
						href="https://github.com/chneau/chneau.github.io"
						target="_blank"
						iconOnly
						label={t("app.header.github")}
						icon={<GitHubMark size={16} />}
					/>

					{onOpenManage && (
						<HeaderAction
							accent
							label={t("app.hero.manage")}
							onClick={onOpenManage}
							icon={<Settings size={15} />}
						>
							{t("app.hero.manage")}
						</HeaderAction>
					)}

					<SchemeToggle
						dark={storeSnap.darkMode}
						onToggle={() => {
							store.darkMode = !store.darkMode;
						}}
					/>
				</>
			}
		/>
	);
};
