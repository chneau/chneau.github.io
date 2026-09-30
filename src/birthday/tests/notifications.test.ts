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

/**
 * Tests for `notifications.ts`.
 *
 * `checkAndNotify` guards on `window`, `localStorage`, `Notification` and
 * `navigator`, none of which bun defines, and importing the module also pulls
 * in `i18n`, whose language detector probes `localStorage` / `navigator` at
 * init time. So every DOM global is installed here before the module is
 * imported, and the globals are restored in `afterAll` so the rest of the
 * suite is unaffected.
 */

type NotificationsModule = typeof import("../notifications");

// --- fixtures ------------------------------------------------------------

/** Local-midnight constructors, so the suite is timezone-agnostic. */
const DAY_ONE = new Date(2026, 2, 10, 9, 0, 0); // 2026-03-10
const DAY_TWO = new Date(2026, 2, 11, 9, 0, 0); // 2026-03-11
const DAY_ONE_KEY = "2026-03-10";
const DAY_TWO_KEY = "2026-03-11";

/**
 * `birthdaySchema` refuses a date that is not strictly before today ("nobody is
 * born in the future"), so a record *dated* the simulated current day is
 * rejected outright. The fixtures therefore carry a 1990 birth year while
 * keeping the month/day aligned to `DAY_ONE` / `DAY_TWO`: `daysBeforeBirthday`
 * only looks at month and day, so a 1993 birthday on 2026-03-10 is still due
 * today. Without this the seed is dropped with a ZodError and the suite would
 * silently assert against the previous dataset.
 */
const BORN_DAY_ONE = "1993-03-10";
const BORN_DAY_TWO = "1993-03-11";
/** Comfortably far from either simulated day, and safely in the past. */
const BORN_NOT_DUE = "1993-06-01";

const BOY = "\u2642\uFE0F";
const WEDDING = "\u{1F492}";

/** Build the raw list `birthdays.ts` reads out of `localStorage`. */
const seedJson = (
	entries: readonly { name: string; date: string; kind?: string }[],
): string =>
	JSON.stringify(
		entries.map((e) => ({ name: e.name, date: e.date, kind: e.kind ?? BOY })),
	);

type Shown = { title: string; body: string | undefined };

// --- environment ---------------------------------------------------------

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
/** Reproduces Chrome on Android, where only a service worker may construct one. */
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
						: // Never settles, exactly like a page with no service worker
							// registered (the dev server on localhost).
							new Promise<never>(() => {}),
		},
	});
};

/** Let the fire-and-forget `checkAndNotify` inside a subscription settle. */
const flush = () => new Promise<void>((r) => setTimeout(r, 10));

const lastNotified = () => storageMap.get("lastNotifiedDate") ?? null;

let mod: NotificationsModule;
/**
 * Install a global as a writable, configurable data property.
 *
 * Plain assignment is not enough. `bun test` runs every file in ONE process,
 * and several others import `src/shared/tests/happy-dom.ts`, whose
 * `GlobalRegistrator` defines `navigator` (among others) as a read-only
 * accessor. Assigning to such a property throws
 * "Attempted to assign to readonly property", which is how this file's setup
 * and teardown used to fail - but only in a full-suite run, never alone.
 */
const setGlobal = (key: string, value: unknown): void => {
	Object.defineProperty(globalThis, key, {
		value,
		configurable: true,
		writable: true,
		enumerable: true,
	});
};

/**
 * The previous DESCRIPTORS, not the previous values: reading the value of an
 * accessor property evaluates its getter, which is not always safe or even
 * possible (a throwing getter is one of the states this suite exercises
 * elsewhere), and a value cannot express "this was a getter".
 */
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
	// leave the wall clock and the derived dataset as we found them
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

/** Point the dataset at `entries` and rebuild it from the stubbed storage. */
const load = (
	entries: readonly { name: string; date: string; kind?: string }[],
) => {
	storageMap.set("custom_birthdays_data", seedJson(entries));
	recomputeBirthdays();
};

const all = (): Shown[] => [...shownByServiceWorker, ...shownByConstructor];

// --- delivery ------------------------------------------------------------

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
		// nothing was announced, so the day must not be latched shut
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
		// past MAX_NAMES the list is summarised with a trailing count
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

		// Must not hang forever on `navigator.serviceWorker.ready`: this still
		// resolves, just via the 2s SW_READY_TIMEOUT_MS budget.
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

		// the rejection is logged, so keep the expected noise out of the run
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

// --- latch ---------------------------------------------------------------

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
		// a remount re-runs the mount-time check against the same latch
		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(false);
		expect(all()).toHaveLength(1);
	});

	test("concurrent triggers in the same tick notify only once", async () => {
		load([{ name: "Ada", date: BORN_DAY_ONE }]);

		// e.g. a double-clicked bell, or a day-roll recompute immediately
		// followed by a user edit. Both read the latch before either writes it.
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

		// the in-flight slot must have been released, or today stays silent
		setSystemTime(DAY_TWO);
		recomputeBirthdays();
		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		expect(all()).toHaveLength(2);
	});

	test("the latch is written only on confirmed delivery", async () => {
		// No service worker, so delivery has to go through the constructor.
		swMode = "absent";
		installNavigator();
		constructorThrows = true;
		load([{ name: "Ada", date: BORN_DAY_ONE }]);

		// Delivery failed, so the day must NOT be marked as notified...
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

		// ...otherwise the alert is swallowed for the rest of the day.
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

// --- day roll ------------------------------------------------------------

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

		// mount-time check, as `App.tsx` does
		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		expect(all()).toHaveLength(1);
		expect(all()[0]?.body).toContain("Ada");

		unsubscribe = mod.subscribeDayRollNotification(() => birthdays);

		// What `store.ts`'s date-roll watcher does when YYYY-MM-DD changes.
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

		// Further recomputes on the same day (a user edit, another poll) must
		// not stack up notifications.
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

		// Grace is not in this dataset, so there is nothing to say.
		expect(all()).toHaveLength(0);
		expect(lastNotified()).toBeNull();
	});

	test("reads the list lazily, so a recompute is never missed", async () => {
		load([{ name: "Ada", date: BORN_DAY_ONE }]);
		unsubscribe = mod.subscribeDayRollNotification(() => birthdays);

		// A birthday added the day after the tab was opened, then a recompute.
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

// --- the alert must not be silenced by the UI filters --------------------

describe("checkAndNotify / the unfiltered dataset", () => {
	test("anniversaries hidden by the default filter still notify", async () => {
		// `showWeddings` defaults to false, so a filtered dataset would drop
		// this record entirely and silence the alert.
		load([{ name: "Ada & Grace", date: BORN_DAY_ONE, kind: WEDDING }]);
		expect(birthdays).toHaveLength(1);

		await expect(mod.checkAndNotify(birthdays)).resolves.toBe(true);
		expect(all()).toHaveLength(1);
		expect(all()[0]?.body).toContain("Ada & Grace");
	});
});
