import dayjs from "dayjs";
import { type Birthday, subscribeBirthdays } from "./birthdays";
import i18n from "./i18n";

const CAKE_ICON =
	"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎂</text></svg>";

const LAST_NOTIFIED_KEY = "lastNotifiedDate";

/**
 * `navigator.serviceWorker.ready` never settles when no service worker is
 * registered (the dev server on localhost never registers one), so awaiting it
 * unconditionally drops the notification *and* stalls forever. Race it: after
 * this budget we fall back to the page-level `Notification` constructor.
 */
const SW_READY_TIMEOUT_MS = 2000;

/** Beyond this many names the list is summarised rather than enumerated. */
const MAX_NAMES = 3;

/** Every key is looked up as a candidate list so a missing translation falls
 * back to the next candidate instead of leaking the key into a notification. */
const t = (candidates: readonly string[], names: string): string =>
	i18n.t([...candidates], { names, defaultValue: "" });

// --- guards --------------------------------------------------------------

/** `Notification` is absent during SSR and in some embedded webviews. */
const hasSupport = (): boolean =>
	typeof window !== "undefined" && "Notification" in window;

const canNotify = (): boolean =>
	hasSupport() && Notification.permission === "granted";

/** `localStorage` throws outright in some privacy modes, and is absent in SSR. */
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

// --- message building ----------------------------------------------------

/**
 * "Ada" / "Ada, Grace" / "Ada, Grace, Alan and 9 others".
 *
 * The trailing count is what makes the plain `{{names}}` templates read as
 * "...and 9 others's birthday!", so the caller switches to the `*_body_many`
 * templates once `many` is true.
 */
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

	// An unresolved body means no usable template, so there is nothing to show.
	if (!title || !body) return null;
	return { title, body };
};

// --- delivery ------------------------------------------------------------

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

/** Resolves to `true` only when the notification was actually handed off. */
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
		// fall through to the page-level API below
	}

	try {
		new Notification(title, options);
		return true;
	} catch (e) {
		// e.g. Chrome on Android, where only the service worker may construct
		// one. Report an undelivered notification so the day is retried.
		console.error("Failed to construct Notification", e);
		return false;
	}
};

// --- public API ----------------------------------------------------------

/**
 * Fire a single birthday notification for anything due today or tomorrow.
 *
 * Returns whether a notification was delivered. The `lastNotifiedDate` latch is
 * written *only* on confirmed delivery, so a failed attempt is retried on the
 * next trigger rather than being silently swallowed for the rest of the day.
 */
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

/**
 * Delivery is asynchronous, so two triggers landing in the same tick (a
 * double-clicked bell, or a day-roll recompute followed by a user edit) would
 * both read the latch before either wrote it, and notify twice. Concurrent
 * callers share the in-flight result instead.
 */
let inFlight: Promise<boolean> | null = null;

export const checkAndNotify = (list: readonly Birthday[]): Promise<boolean> => {
	if (inFlight) return inFlight;
	const run = runCheck(list);
	inFlight = run;
	const release = () => {
		// Identity check: never clear a slot a later check has taken over.
		if (inFlight === run) inFlight = null;
	};
	void run.then(release, release);
	return run;
};

/**
 * Re-run the notification check whenever the birthday dataset is recomputed.
 *
 * `recomputeBirthdays()` is what the store's date-roll watcher calls when the
 * `YYYY-MM-DD` day changes (60s poll plus `visibilitychange`), so subscribing to
 * it is what makes a birthday arriving while the tab sits open announce itself.
 * The `lastNotifiedDate` latch keeps this at most one notification per day, and
 * the day-roll also fires on user edits, which stay subject to the same latch.
 *
 * The list is read through a getter because `birthdays` is a mutable
 * module-level binding that is reassigned on every recompute.
 */
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
