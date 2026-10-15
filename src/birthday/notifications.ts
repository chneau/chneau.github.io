import dayjs from "dayjs";
import { type Birthday, subscribeBirthdays } from "./birthdays";
import i18n from "./i18n";

const CAKE_ICON =
	"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎂</text></svg>";

const LAST_NOTIFIED_KEY = "lastNotifiedDate";

const SW_READY_TIMEOUT_MS = 2000;

const MAX_NAMES = 3;

const t = (candidates: readonly string[], names: string): string =>
	i18n.t([...candidates], { names, defaultValue: "" });

const hasSupport = (): boolean =>
	typeof window !== "undefined" && "Notification" in window;

const canNotify = (): boolean =>
	hasSupport() && Notification.permission === "granted";

const readLastNotified = (): string | null => {
	if (typeof localStorage === "undefined") return null;
	try {
		return localStorage.getItem(LAST_NOTIFIED_KEY);
	} catch (e) {
		console.error("Failed to read lastNotifiedDate", e);
		return null;
	}
};

const writeLastNotified = (date: string): void => {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(LAST_NOTIFIED_KEY, date);
	} catch (e) {
		console.error("Failed to write lastNotifiedDate", e);
	}
};

const summariseNames = (
	list: readonly Birthday[],
): { names: string; many: boolean } => {
	const names = list.map((b) => b.name);
	if (names.length <= MAX_NAMES) {
		return { names: names.join(", "), many: false };
	}
	const head = names.slice(0, MAX_NAMES).join(", ");
	return {
		names: `${head} and ${names.length - MAX_NAMES} others`,
		many: true,
	};
};

type Message = { title: string; body: string };

const buildMessage = (upcoming: readonly Birthday[]): Message | null => {
	const todays = upcoming.filter((b) => b.daysBeforeBirthday === 0);
	const tomorrows = upcoming.filter((b) => b.daysBeforeBirthday === 1);

	let title = "";
	let body = "";

	if (todays.length > 0) {
		const { names, many } = summariseNames(todays);
		title = i18n.t("app.notifications.today_title");
		body = many
			? t(
					["app.notifications.today_body_many", "app.notifications.today_body"],
					names,
				)
			: t(["app.notifications.today_body"], names);
	}

	if (tomorrows.length > 0) {
		const { names, many } = summariseNames(tomorrows);
		if (title) {
			body += many
				? t(
						["app.notifications.both_body_many", "app.notifications.both_body"],
						names,
					)
				: t(["app.notifications.both_body"], names);
		} else {
			title = i18n.t("app.notifications.upcoming_title");
			body = many
				? t(
						[
							"app.notifications.upcoming_body_many",
							"app.notifications.upcoming_body",
						],
						names,
					)
				: t(["app.notifications.upcoming_body"], names);
		}
	}

	if (!title || !body) return null;
	return { title, body };
};

const withTimeout = async <T>(
	promise: Promise<T>,
	ms: number,
	fallback: T,
): Promise<T> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<T>((resolve) => {
		timer = setTimeout(() => resolve(fallback), ms);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		clearTimeout(timer);
	}
};

const notify = async (
	title: string,
	options?: NotificationOptions,
): Promise<boolean> => {
	if (!canNotify()) return false;

	if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
		try {
			const registration = await withTimeout(
				navigator.serviceWorker.ready,
				SW_READY_TIMEOUT_MS,
				null,
			);
			if (registration) {
				await registration.showNotification(title, options);
				return true;
			}
		} catch (e) {
			console.error("Failed to show notification via service worker", e);
		}
	}

	try {
		new Notification(title, options);
		return true;
	} catch (e) {
		console.error("Failed to construct Notification", e);
		return false;
	}
};

const runCheck = async (list: readonly Birthday[]): Promise<boolean> => {
	if (!canNotify()) return false;

	const today = dayjs().format("YYYY-MM-DD");
	if (readLastNotified() === today) return false;

	const upcoming = list.filter((b) => b.daysBeforeBirthday <= 1);
	if (upcoming.length === 0) return false;

	const message = buildMessage(upcoming);
	if (!message) return false;

	const delivered = await notify(message.title, {
		body: message.body,
		icon: CAKE_ICON,
	});
	if (delivered) writeLastNotified(today);
	return delivered;
};

let inFlight: Promise<boolean> | null = null;

export const checkAndNotify = (list: readonly Birthday[]): Promise<boolean> => {
	if (inFlight) return inFlight;
	const run = runCheck(list);
	inFlight = run;
	const release = () => {
		if (inFlight === run) inFlight = null;
	};
	void run.then(release, release);
	return run;
};

export const subscribeDayRollNotification = (
	getBirthdays: () => readonly Birthday[],
): (() => void) =>
	subscribeBirthdays(() => {
		void checkAndNotify(getBirthdays());
	});

export const requestNotificationPermission = async (): Promise<boolean> => {
	if (!hasSupport()) {
		console.log(i18n.t("app.notifications.no_support"));
		return false;
	}

	if (Notification.permission === "default") {
		const res = await Notification.requestPermission();
		return res === "granted";
	}
	return Notification.permission === "granted";
};

export const sendTestNotification = () => {
	if (!hasSupport()) {
		alert(i18n.t("app.notifications.no_support"));
		return;
	}

	if (Notification.permission !== "granted") {
		alert(i18n.t("app.notifications.no_permission"));
		return;
	}

	void notify(i18n.t("app.notifications.test_title"), {
		body: i18n.t("app.notifications.test_body"),
		icon: CAKE_ICON,
	});
};
