import type { Birthday } from "./birthdays";

export const requestNotificationPermission = async () => {
	if (!("Notification" in window)) {
		console.log("This browser does not support desktop notification");
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

	const today = new Date().toDateString();
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
		title = "🎂 Happy Birthday!";
		body = `Today is ${names}'s birthday!`;
	}

	if (tomorrowBirthdays.length > 0) {
		const names = tomorrowBirthdays.map((b) => b.name).join(", ");
		if (title) {
			body += `\nAnd ${names} has a birthday tomorrow!`;
		} else {
			title = "📅 Upcoming Birthday";
			body = `${names} has a birthday tomorrow!`;
		}
	}

	if (title) {
		new Notification(title, {
			body,
			icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎂</text></svg>",
		});
		localStorage.setItem("lastNotifiedDate", today);
	}
};

export const sendTestNotification = () => {
	if (!("Notification" in window)) {
		alert("This browser does not support desktop notification");
		return;
	}

	if (Notification.permission !== "granted") {
		alert("Notification permission not granted. Please click the bell icon.");
		return;
	}

	new Notification("🎉 Test Notification", {
		body: "This is a test notification from Birthday Tracker!",
		icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎂</text></svg>",
	});
};
