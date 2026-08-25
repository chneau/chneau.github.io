import dayjs from "dayjs";
import type { Birthday } from "./birthdays";
import i18n from "./i18n";

export const requestNotificationPermission = async () => {
	if (!("Notification" in window)) {
		console.log(i18n.t("app.notifications.no_support"));
		return;
	}

	if (Notification.permission === "default") {
		await Notification.requestPermission();
	}
};

export const checkAndNotify = (birthdays: readonly Birthday[]) => {
	if (!("Notification" in window) || Notification.permission !== "granted") {
		return;
	}

	const today = dayjs().format("YYYY-MM-DD");
	const lastNotified = localStorage.getItem("lastNotifiedDate");

	// Prevent spamming: only notify once per day
	if (lastNotified === today) {
		return;
	}

	const upcoming = birthdays.filter((b) => b.daysBeforeBirthday <= 1);

	if (upcoming.length === 0) return;

	const todayBirthdays = upcoming.filter((b) => b.daysBeforeBirthday === 0);
	const tomorrowBirthdays = upcoming.filter((b) => b.daysBeforeBirthday === 1);

	let title = "";
	let body = "";

	if (todayBirthdays.length > 0) {
		const names = todayBirthdays.map((b) => b.name).join(", ");
		title = i18n.t("app.notifications.today_title");
		body = i18n.t("app.notifications.today_body", { names });
	}

	if (tomorrowBirthdays.length > 0) {
		const names = tomorrowBirthdays.map((b) => b.name).join(", ");
		if (title) {
			body += i18n.t("app.notifications.both_body", { names });
		} else {
			title = i18n.t("app.notifications.upcoming_title");
			body = i18n.t("app.notifications.upcoming_body", { names });
		}
	}

	if (title) {
		notify(title, {
			body,
			icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎂</text></svg>",
		});
		localStorage.setItem("lastNotifiedDate", today);
	}
};

const notify = async (title: string, options?: NotificationOptions) => {
	if (!("Notification" in window) || Notification.permission !== "granted") {
		return;
	}

	if ("serviceWorker" in navigator) {
		const registration = await navigator.serviceWorker.ready;
		registration.showNotification(title, options);
	} else {
		try {
			new Notification(title, options);
		} catch (e) {
			console.error("Failed to construct Notification", e);
		}
	}
};

export const sendTestNotification = () => {
	if (!("Notification" in window)) {
		alert(i18n.t("app.notifications.no_support"));
		return;
	}

	if (Notification.permission !== "granted") {
		alert(i18n.t("app.notifications.no_permission"));
		return;
	}

	notify(i18n.t("app.notifications.test_title"), {
		body: i18n.t("app.notifications.test_body"),
		icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎂</text></svg>",
	});
};
