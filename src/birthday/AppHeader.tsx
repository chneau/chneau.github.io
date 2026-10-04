import { Menu, Tooltip } from "@mantine/core";
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
import { AppNav, HeaderAction, type ShortcutGroup, StatusDot } from "../shared";
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
	/**
	 * Shortcut groups for the help dialog `AppNav` owns. They arrive from the
	 * app, which also holds the translated strings.
	 */
	shortcuts: ShortcutGroup[];
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

export const AppHeader = ({
	data,
	onOpenManage,
	shortcuts,
}: AppHeaderProps) => {
	const { t, i18n } = useTranslation();
	// TEMPORARY: the keys below are not in `locales/en.json` yet, so the typed
	// `t()` (whose key union is derived from that file) rejects them. Delete this
	// helper once the locale JSONs gain the keys.
	const tr = t as unknown as (
		key: string,
		opts?: Record<string, unknown>,
	) => string;
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
			notify.warning(t("app.notifications.no_support"));
			return;
		}
		if (notificationState === "denied") {
			notify.warning(tr("app.header.notify_blocked"));
			return;
		}
		const granted = await requestNotificationPermission();
		setNotificationState(Notification.permission);
		if (granted) {
			notify.success(tr("app.header.notify_enabled"));
			checkAndNotify(data);
		} else {
			notify.info(tr("app.header.notify_not_enabled"));
		}
	};

	const demoToolsMenu = [
		{
			key: "test_notif",
			label: t("app.header.test_notification"),
			icon: <Bell size={14} />,
			onClick: () => {
				sendTestNotification();
				notify.info(tr("app.header.notify_test_sent"));
			},
		},
		{
			key: "simulate_bday",
			label: t("app.header.simulate"),
			icon: <Cake size={14} />,
			onClick: () => {
				sendTestNotification();
				triggerConfetti();
				notify.success(tr("app.header.notify_simulated"));
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
		<AppNav
			// This app binds the command palette, so the shared help dialog
			// may advertise it.
			hasCommandPalette
			icon={<Cake size={18} strokeWidth={1.9} />}
			title={t("app.title")}
			subtitle={tr("app.header.build", { date: BUILD_DATE })}
			shortcuts={shortcuts}
			theme={{
				dark: storeSnap.darkMode,
				onToggle: () => {
					store.darkMode = !store.darkMode;
				},
			}}
			// Ten controls is 494px in a 360px bar, so on a phone only
			// BackHome and the switcher stay inline and the rest move behind
			// "More" (`AppNav` wraps this slot in `HeaderOverflow`). Above the
			// breakpoint they render inline, so a wide bar is unchanged. The two
			// Mantine `Menu` triggers are inside deliberately: their dropdowns
			// render in a portal, which is what makes them safe to nest there.
			actions={
				<>
					<Menu position="bottom-end" shadow="md" withinPortal>
						<Menu.Target>
							<HeaderAction icon={<FlaskConical size={15} />}>
								{tr("app.header.demo")}
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
								label={tr("app.header.change_language")}
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
										}}
									>
										{x.label}
									</Menu.Item>
								);
							})}
						</Menu.Dropdown>
					</Menu>

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
								? tr("app.header.alerts_active")
								: notificationsBlocked
									? tr("app.header.alerts_blocked")
									: tr("app.header.alerts_enable")
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
								? tr("app.header.alerts_on")
								: notificationsBlocked
									? tr("app.header.alerts_blocked_short")
									: tr("app.header.alerts_enable_short")}
						</HeaderAction>
					</Tooltip>

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
				</>
			}
		/>
	);
};
