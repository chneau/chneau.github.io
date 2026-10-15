import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MAX_REPLAY_TIME, MIN_REPLAY_TIME } from "../utils";

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

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const previousLocalStorage = Object.getOwnPropertyDescriptor(
	globalThis,
	"localStorage",
);

const define = (name: "window" | "localStorage", value: unknown): void => {
	Object.defineProperty(globalThis, name, {
		value,
		writable: true,
		configurable: true,
		enumerable: true,
	});
};

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

const loadStore = async (search = "") => {
	captured = { url: "", search };
	const stamp = `${Math.random()}`;
	const [store, url] = (await Promise.all([
		import(`../store?case=${stamp}`),
		import(`../url?case=${stamp}`),
	])) as unknown as [typeof import("../store"), typeof import("../url")];
	return { store, url, stamp };
};

const timeParamOf = (search: string): string | null =>
	new URLSearchParams(search).get("t");

describe("store and share link agree on the clock", () => {
	test("a jump past the end of the day lands in the store AND the link", async () => {
		const { store, url } = await loadStore();

		store.railActions.setTimeOffset(1455);
		await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_SETTLE_MS));

		expect(store.railStore.timeOffset).toBe(MAX_REPLAY_TIME);
		expect(timeParamOf(captured.search)).toBe(String(MAX_REPLAY_TIME));

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
			expect(written).toBeGreaterThanOrEqual(MIN_REPLAY_TIME);
			expect(written).toBeLessThanOrEqual(MAX_REPLAY_TIME);

			const expectedParam = written === 480 ? null : String(written);
			expect(timeParamOf(captured.search)).toBe(expectedParam);

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
