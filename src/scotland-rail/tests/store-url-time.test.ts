import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MAX_REPLAY_TIME, MIN_REPLAY_TIME } from "../utils";

/**
 * Regression guard for a disagreement between the store and the share link.
 *
 * The scrubber exposes 05:00-24:00 and `url.ts` clamped what it wrote, but
 * `setTimeOffset` did not clamp. Seven timetable call times run past 24:00
 * (up to 24:35), so clicking one of them in the inspector - or any other jump
 * - left the store at e.g. 1455 while the link recorded `?t=1440`. The user
 * saw a 24:35 clock with the thumb pinned at 100%, and reloading their own
 * link silently moved the replay 15 minutes back.
 *
 * `store.ts` has module-scope side effects (it builds the store, reads the
 * URL, subscribes and recomputes), so each case re-imports it with a
 * cache-busting query against a stubbed `window`.
 */

type Captured = { url: string; search: string };

let captured: Captured = { url: "", search: "" };

const locationStub = {
	get search() {
		return captured.search;
	},
	pathname: "/scotland-rail/",
	hash: "",
};

const windowStub = {
	location: locationStub,
	// `store.ts` pulls in the shared theme, whose persistence helper attaches
	// a cross-tab listener at module scope once `window` exists.
	addEventListener: () => {},
	removeEventListener: () => {},
	history: {
		replaceState: (_data: unknown, _unused: string, url: string) => {
			captured = {
				url,
				search: url.includes("?") ? url.slice(url.indexOf("?")) : "",
			};
		},
	},
};

// Saved so the previous descriptors can be restored verbatim.
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const previousLocalStorage = Object.getOwnPropertyDescriptor(
	globalThis,
	"localStorage",
);

/**
 * Installed writable on purpose: sibling suites install `globalThis.localStorage`
 * themselves, and leaving a read-only property behind breaks their plain
 * assignments once the whole suite runs in one process.
 */
const define = (name: "window" | "localStorage", value: unknown): void => {
	Object.defineProperty(globalThis, name, {
		value,
		writable: true,
		configurable: true,
		enumerable: true,
	});
};

/** Flatten any inherited descriptor back to a writable data property. */
const restore = (
	name: "window" | "localStorage",
	saved: PropertyDescriptor | undefined,
): void => {
	if (!saved) {
		delete (globalThis as unknown as Record<string, unknown>)[name];
		return;
	}
	const inherited =
		typeof saved.get === "function" ? saved.get.call(globalThis) : saved.value;
	define(name, inherited);
};

beforeAll(() => {
	define("window", windowStub);
	// An inert storage: the settings suite owns persistence coverage, this
	// file only needs the global to exist so the store's SSR guard passes.
	define("localStorage", {
		getItem: () => null,
		setItem: () => {},
		removeItem: () => {},
		clear: () => {},
	});
});

afterAll(() => {
	restore("window", previousWindow);
	restore("localStorage", previousLocalStorage);
});

const DEBOUNCE_SETTLE_MS = 400;

/** A fresh module graph, started from `?t=...` (or no time at all). */
const loadStore = async (search = "") => {
	captured = { url: "", search };
	const stamp = `${Math.random()}`;
	const [store, url] = (await Promise.all([
		import(`../store?case=${stamp}`),
		import(`../url?case=${stamp}`),
	])) as unknown as [typeof import("../store"), typeof import("../url")];
	return { store, url, stamp };
};

/** The `t` parameter the mirrored link carries, or null when omitted. */
const timeParamOf = (search: string): string | null =>
	new URLSearchParams(search).get("t");

describe("store and share link agree on the clock", () => {
	test("a jump past the end of the day lands in the store AND the link", async () => {
		const { store, url } = await loadStore();

		// 24:15, one of the seven timetable call times beyond the scrubber end.
		store.railActions.setTimeOffset(1455);
		await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_SETTLE_MS));

		expect(store.railStore.timeOffset).toBe(MAX_REPLAY_TIME);
		expect(timeParamOf(captured.search)).toBe(String(MAX_REPLAY_TIME));

		// And the link must restore exactly the clock the user was looking at.
		captured = { ...captured, search: captured.search };
		expect(url.readUrlState().timeOffset).toBe(store.railStore.timeOffset);
	});

	test("every jump round-trips through the link unchanged", async () => {
		const { store, url } = await loadStore();
		const values = [
			MIN_REPLAY_TIME,
			301,
			780,
			1439,
			MAX_REPLAY_TIME,
			1455,
			1475,
			99,
			0,
			9999,
		];

		for (const value of values) {
			store.railActions.setTimeOffset(value);
			await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_SETTLE_MS));

			const written = store.railStore.timeOffset;
			// The store never leaves the window the scrubber exposes...
			expect(written).toBeGreaterThanOrEqual(MIN_REPLAY_TIME);
			expect(written).toBeLessThanOrEqual(MAX_REPLAY_TIME);

			// ...and the link carries that same integer, unless it is the
			// default the link omits (08:00).
			const expectedParam = written === 480 ? null : String(written);
			expect(timeParamOf(captured.search)).toBe(expectedParam);

			// Re-parsing the mirrored link yields the identical clock.
			const readBack = url.readUrlState();
			expect(readBack.timeOffset ?? 480).toBe(written);
		}
	});

	test("sub-minute jumps round to a whole minute", async () => {
		const { store, url } = await loadStore();

		store.railActions.setTimeOffset(1439.6);
		await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_SETTLE_MS));

		expect(store.railStore.timeOffset).toBe(MAX_REPLAY_TIME);
		expect(url.readUrlState().timeOffset).toBe(MAX_REPLAY_TIME);
	});

	test("restart returns to the start of the window", async () => {
		const { store } = await loadStore();

		store.railActions.setTimeOffset(1440);
		store.railActions.restart();
		await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_SETTLE_MS));

		expect(store.railStore.timeOffset).toBe(MIN_REPLAY_TIME);
		expect(timeParamOf(captured.search)).toBe(String(MIN_REPLAY_TIME));
	});
});

describe("deep links are clamped by the same rule", () => {
	test("?t=1455 opens at 24:00", async () => {
		const { store } = await loadStore("?t=1455");
		expect(store.railStore.timeOffset).toBe(MAX_REPLAY_TIME);
	});

	test("?t=100 opens at 05:00", async () => {
		const { store } = await loadStore("?t=100");
		expect(store.railStore.timeOffset).toBe(MIN_REPLAY_TIME);
	});

	test("a deep link and a fresh jump to the same minute agree", async () => {
		const linked = await loadStore("?t=1455");
		const jumped = await loadStore();
		jumped.store.railActions.setTimeOffset(1455);
		expect(jumped.store.railStore.timeOffset).toBe(
			linked.store.railStore.timeOffset,
		);
	});
});
