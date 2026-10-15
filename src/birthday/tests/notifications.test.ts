import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	setSystemTime,
	test,
} from "bun:test";
import { birthdays, recomputeBirthdays } from "../birthdays";

type NotificationsModule = typeof import("../notifications");

const DAY_ONE = new Date(2026, 2, 10, 9, 0, 0);
const DAY_TWO = new Date(2026, 2, 11, 9, 0, 0);
const DAY_ONE_KEY = "2026-03-10";
const DAY_TWO_KEY = "2026-03-11";

const BORN_DAY_ONE = "1993-03-10";
const BORN_DAY_TWO = "1993-03-11";
const BORN_NOT_DUE = "1993-06-01";

const BOY = "\u2642\uFE0F";
const WEDDING = "\u{1F492}";

const seedJson = (
	entries: readonly { name: string; date: string; kind?: string }[],
): string =>
	JSON.stringify(
		entries.map((e) => ({ name: e.name, date: e.date, kind: e.kind ?? BOY })),
	);

type Shown = { title: string; body: string | undefined };

const storageMap = new Map<string, string>();
const storage = {
	getItem: (k: string) => storageMap.get(k) ?? null,
	setItem: (k: string, v: string) => {
		storageMap.set(k, v);
	},
	removeItem: (k: string) => {
		storageMap.delete(k);
	},
	clear: () => storageMap.clear(),
	key: (i: number) => [...storageMap.keys()][i] ?? null,
	get length() {
		return storageMap.size;
	},
};

let shownByServiceWorker: Shown[] = [];
let shownByConstructor: Shown[] = [];
let constructorThrows = false;

type SwMode = "ready" | "pending" | "rejecting" | "absent";
let swMode: SwMode = "ready";

class FakeNotification {
	static permission: NotificationPermission = "granted";
	static requestPermission = async (): Promise<NotificationPermission> =>
		"granted";
	constructor(title: string, options?: NotificationOptions) {
		if (constructorThrows) {
			throw new TypeError("Illegal constructor");
		}
		shownByConstructor.push({ title, body: options?.body });
	}
}

const installNavigator = () => {
	if (swMode === "absent") {
		setGlobal("navigator", {});
		return;
	}
	setGlobal("navigator", {
		serviceWorker: {
			ready:
				swMode === "ready"
					? Promise.resolve({
							showNotification: async (
								title: string,
								options?: NotificationOptions,
							) => {
								shownByServiceWorker.push({
									title,
									body: options?.body,
								});
							},
						})
					: swMode === "rejecting"
						? Promise.reject(new Error("no active registration"))
						: new Promise<never>(() => {}),
		},
	});
};

const flush = () => new Promise<void>((r) => setTimeout(r, 10));

const lastNotified = () => storageMap.get("lastNotifiedDate") ?? null;

let mod: NotificationsModule;
const setGlobal = (key: string, value: unknown): void => {
	Object.defineProperty(globalThis, key, {
		value,
		configurable: true,
		writable: true,
		enumerable: true,
	});
};

const previous = new Map<string, PropertyDescriptor | undefined>();

const GLOBAL_KEYS = ["window", "navigator", "localStorage", "Notification"];

beforeAll(async () => {
	for (const key of GLOBAL_KEYS) {
		previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
	}
	setGlobal("localStorage", storage);
	setGlobal("window", { Notification: FakeNotification });
	setGlobal("Notification", FakeNotification);
	installNavigator();
	mod = await import("../notifications");
});

afterAll(() => {
	for (const [key, descriptor] of previous) {
		if (descriptor) {
			Object.defineProperty(globalThis, key, descriptor);
		} else {
			Reflect.deleteProperty(globalThis, key);
		}
	}
	previous.clear();
	setSystemTime(new Date());
	recomputeBirthdays();
});

beforeEach(() => {
	setSystemTime(DAY_ONE);
	shownByServiceWorker = [];
	shownByConstructor = [];
	constructorThrows = false;
	swMode = "ready";
	installNavigator();
	storageMap.clear();
});

afterEach(() => {
	setSystemTime(new Date());
});

const load = (
	entries: readonly { name: string; date: string; kind?: string }[],
) => {
	storageMap.set("custom_birthdays_data", seedJson(entries));
	recomputeBirthdays();
};

const all = (): Shown[] => [...shownByServiceWorker, ...shownByConstructor];

describe("checkAndNotify / delivery", () => {
	test("announces a birthday that falls today", async () => {
		load([{ name: "Ada", date: BORN_DAY_ONE }]);
		expect(birthdays[0]?.daysBeforeBirthday).toBe(0);

		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);

		expect(all()).toHaveLength(1);
		expect(all()[0]?.title).toContain("Happy Birthday");
		expect(all()[0]?.body).toContain("Ada");
		expect(lastNotified()).toBe(DAY_ONE_KEY);
	});

	test("announces a birthday that falls tomorrow", async () => {
		load([{ name: "Grace", date: BORN_DAY_TWO }]);
		expect(birthdays[0]?.daysBeforeBirthday).toBe(1);

		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		expect(all()).toHaveLength(1);
		expect(all()[0]?.body).toContain("Grace");
	});

	test("stays quiet when nothing is due", async () => {
		load([{ name: "Alan", date: BORN_NOT_DUE }]);

		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(false);
		expect(all()).toHaveLength(0);
		expect(lastNotified()).toBeNull();
	});

	test("collapses a crowded day into a single notification", async () => {
		load([
			{ name: "Ada", date: BORN_DAY_ONE },
			{ name: "Grace", date: BORN_DAY_ONE },
			{ name: "Alan", date: BORN_DAY_ONE },
			{ name: "Edsger", date: BORN_DAY_ONE },
			{ name: "Barbara", date: BORN_DAY_ONE },
		]);

		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		expect(all()).toHaveLength(1);
		expect(all()[0]?.body).toContain("others");
	});

	test("notifies through the service worker when one is ready", async () => {
		load([{ name: "Ada", date: BORN_DAY_ONE }]);

		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		expect(shownByServiceWorker).toHaveLength(1);
		expect(shownByConstructor).toHaveLength(0);
	});

	test("falls back to the page API when the service worker never becomes ready", async () => {
		swMode = "pending";
		installNavigator();
		load([{ name: "Ada", date: BORN_DAY_ONE }]);

		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		expect(shownByConstructor).toHaveLength(1);
		expect(lastNotified()).toBe(DAY_ONE_KEY);
	});

	test("falls back when there is no service worker support at all", async () => {
		swMode = "absent";
		installNavigator();
		load([{ name: "Ada", date: BORN_DAY_ONE }]);

		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		expect(shownByConstructor).toHaveLength(1);
	});

	test("falls back when the registration lookup rejects", async () => {
		swMode = "rejecting";
		installNavigator();
		load([{ name: "Ada", date: BORN_DAY_ONE }]);

		const realError = console.error;
		console.error = () => {};
		try {
			await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		} finally {
			console.error = realError;
		}
		expect(shownByConstructor).toHaveLength(1);
	});
});

describe("checkAndNotify / once-per-day latch", () => {
	test("a second check on the same day is silent", async () => {
		load([{ name: "Ada", date: BORN_DAY_ONE }]);

		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(false);
		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(false);
		expect(all()).toHaveLength(1);
	});

	test("a same-day remount is not spammy", async () => {
		load([{ name: "Ada", date: BORN_DAY_ONE }]);

		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(false);
		expect(all()).toHaveLength(1);
	});

	test("concurrent triggers in the same tick notify only once", async () => {
		load([{ name: "Ada", date: BORN_DAY_ONE }]);

		const results = await Promise.all([
			mod.checkAndNotify(birthdays),
			mod.checkAndNotify(birthdays),
			mod.checkAndNotify(birthdays),
		]);

		expect(all()).toHaveLength(1);
		expect(results).toEqual([true, true, true]);
	});

	test("the next day is not blocked by a coalesced in-flight check", async () => {
		load([
			{ name: "Ada", date: BORN_DAY_ONE },
			{ name: "Grace", date: BORN_DAY_TWO },
		]);
		await Promise.all([
			mod.checkAndNotify(birthdays),
			mod.checkAndNotify(birthdays),
		]);
		expect(all()).toHaveLength(1);

		setSystemTime(DAY_TWO);
		recomputeBirthdays();
		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		expect(all()).toHaveLength(2);
	});

	test("the latch is written only on confirmed delivery", async () => {
		swMode = "absent";
		installNavigator();
		constructorThrows = true;
		load([{ name: "Ada", date: BORN_DAY_ONE }]);

		const realError = console.error;
		console.error = () => {};
		let delivered: boolean;
		try {
			delivered = await mod.checkAndNotify(birthdays);
		} finally {
			console.error = realError;
		}
		expect(delivered).toBe(false);
		expect(all()).toHaveLength(0);
		expect(lastNotified()).toBeNull();

		constructorThrows = false;
		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		expect(all()).toHaveLength(1);
		expect(lastNotified()).toBe(DAY_ONE_KEY);
	});

	test("the latch is keyed to the day, so yesterday's does not block today", async () => {
		load([
			{ name: "Ada", date: BORN_DAY_ONE },
			{ name: "Grace", date: BORN_DAY_TWO },
		]);
		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		expect(lastNotified()).toBe(DAY_ONE_KEY);
		expect(all()).toHaveLength(1);

		setSystemTime(DAY_TWO);
		recomputeBirthdays();
		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		expect(all()).toHaveLength(2);
		expect(lastNotified()).toBe(DAY_TWO_KEY);
	});
});

describe("subscribeDayRollNotification / the calendar day advancing", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		unsubscribe = undefined;
	});

	test("re-runs the check when the day rolls over, and announces the new birthday", async () => {
		load([
			{ name: "Ada", date: BORN_DAY_ONE },
			{ name: "Grace", date: BORN_DAY_TWO },
		]);

		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		expect(all()).toHaveLength(1);
		expect(all()[0]?.body).toContain("Ada");

		unsubscribe = mod.subscribeDayRollNotification(() => birthdays);

		setSystemTime(DAY_TWO);
		recomputeBirthdays();
		await flush();

		expect(all()).toHaveLength(2);
		expect(all()[1]?.body).toContain("Grace");
		expect(lastNotified()).toBe(DAY_TWO_KEY);
	});

	test("the day-roll re-check still respects the once-per-day latch", async () => {
		load([
			{ name: "Ada", date: BORN_DAY_ONE },
			{ name: "Grace", date: BORN_DAY_TWO },
		]);
		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);

		unsubscribe = mod.subscribeDayRollNotification(() => birthdays);

		setSystemTime(DAY_TWO);
		recomputeBirthdays();
		await flush();
		expect(all()).toHaveLength(2);

		recomputeBirthdays();
		await flush();
		recomputeBirthdays();
		await flush();
		expect(all()).toHaveLength(2);
	});

	test("a day roll with nothing due announces nothing", async () => {
		load([{ name: "Ada", date: BORN_DAY_ONE }]);
		unsubscribe = mod.subscribeDayRollNotification(() => birthdays);

		setSystemTime(DAY_TWO);
		recomputeBirthdays();
		await flush();

		expect(all()).toHaveLength(0);
		expect(lastNotified()).toBeNull();
	});

	test("reads the list lazily, so a recompute is never missed", async () => {
		load([{ name: "Ada", date: BORN_DAY_ONE }]);
		unsubscribe = mod.subscribeDayRollNotification(() => birthdays);

		load([
			{ name: "Ada", date: BORN_DAY_ONE },
			{ name: "Grace", date: BORN_DAY_ONE },
		]);
		await flush();
		expect(all()).toHaveLength(1);
		expect(all()[0]?.body).toContain("Grace");
	});

	test("unsubscribing stops the re-checks", async () => {
		load([
			{ name: "Ada", date: BORN_DAY_ONE },
			{ name: "Grace", date: BORN_DAY_TWO },
		]);
		const stop = mod.subscribeDayRollNotification(() => birthdays);
		stop();

		setSystemTime(DAY_TWO);
		recomputeBirthdays();
		await flush();

		expect(all()).toHaveLength(0);
	});
});

describe("checkAndNotify / the unfiltered dataset", () => {
	test("anniversaries hidden by the default filter still notify", async () => {
		load([{ name: "Ada & Grace", date: BORN_DAY_ONE, kind: WEDDING }]);
		expect(birthdays).toHaveLength(1);

		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		expect(all()).toHaveLength(1);
		expect(all()[0]?.body).toContain("Ada & Grace");
	});
});
