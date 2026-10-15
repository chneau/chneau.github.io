import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AppSettings } from "../data/types";

const createStorage = (initial: Record<string, string> = {}) => {
	const map = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
		removeItem: (key: string) => void map.delete(key),
		clear: () => map.clear(),
		_dump: () => Object.fromEntries(map),
	};
};

let activeStorage: ReturnType<typeof createStorage> | null = null;

const globalStub = {
	getItem: (key: string) => activeStorage?.getItem(key) ?? null,
	setItem: (key: string, value: string) => activeStorage?.setItem(key, value),
	removeItem: (key: string) => activeStorage?.removeItem(key),
	clear: () => activeStorage?.clear(),
};

const previousLocalStorage = Object.getOwnPropertyDescriptor(
	globalThis,
	"localStorage",
);

const installLocalStorage = (): void => {
	Object.defineProperty(globalThis, "localStorage", {
		value: globalStub,
		writable: true,
		configurable: true,
		enumerable: true,
	});
};

beforeAll(installLocalStorage);

afterAll(() => {
	if (!previousLocalStorage) {
		delete (globalThis as unknown as Record<string, unknown>).localStorage;
		return;
	}
	const inheritedValue =
		typeof previousLocalStorage.get === "function"
			? previousLocalStorage.get.call(globalThis)
			: previousLocalStorage.value;

	Object.defineProperty(globalThis, "localStorage", {
		value: inheritedValue,
		writable: true,
		configurable: true,
		enumerable: true,
	});
});

type StoreModule = typeof import("../store");
type DefaultsModule = typeof import("../data/types");

const loadStore = async (seed: Record<string, string> = {}) => {
	const stamp = `${Math.random()}`;
	const storage = createStorage(seed);
	activeStorage = storage;
	const [store, defaults] = (await Promise.all([
		import(`../store?case=${stamp}`),
		import(`../data/types?case=${stamp}`),
	])) as unknown as [StoreModule, DefaultsModule];
	return { store, defaults: defaults.DEFAULT_SETTINGS, storage };
};

describe("settings reset", () => {
	test("resetSettings restores defaults after user toggles", async () => {
		const { store, defaults } = await loadStore();

		for (const key of Object.keys(defaults) as (keyof AppSettings)[]) {
			const current = defaults[key];
			if (typeof current === "boolean") {
				store.railActions.updateSetting(key, !current as never);
			}
		}

		expect(defaults.showLochs).toBe(true);

		store.railActions.resetSettings();
		expect(store.railStore.settings).toEqual(defaults);
	});

	test("the defaults constant is never mutated by updates", async () => {
		const { store, defaults } = await loadStore();
		const before = JSON.stringify(defaults);

		store.railActions.updateSetting("showLochs", false);
		store.railActions.updateSetting("cityLights", false);

		expect(JSON.stringify(defaults)).toBe(before);
		expect(store.railStore.settings.showLochs).toBe(false);
	});

	test("updateSetting does not leak across store instances", async () => {
		const first = await loadStore();
		first.store.railActions.updateSetting("showLochs", false);
		first.store.railActions.updateSetting("cityLights", false);

		const second = await loadStore();
		expect(second.store.railStore.settings.showLochs).toBe(true);
		expect(second.store.railStore.settings.cityLights).toBe(true);
	});
});

describe("settings persistence", () => {
	test("changes are written to storage", async () => {
		const { store, storage } = await loadStore();
		store.railActions.updateSetting("showLochs", false);
		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(storage._dump().scotland_rail_settings).toContain(
			'"showLochs":false',
		);
	});

	test("settings still persist AFTER a reset", async () => {
		const { store, storage } = await loadStore();

		store.railActions.updateSetting("showLochs", false);
		await new Promise((resolve) => setTimeout(resolve, 400));
		store.railActions.resetSettings();
		await new Promise((resolve) => setTimeout(resolve, 400));

		store.railActions.updateSetting("cityLights", false);
		await new Promise((resolve) => setTimeout(resolve, 400));

		const raw = storage._dump().scotland_rail_settings;
		expect(raw).toBeDefined();
		expect(raw).toContain('"cityLights":false');
	});

	test("a stored value is read back on the next load", async () => {
		const { store, storage } = await loadStore();
		store.railActions.updateSetting("showLochs", false);
		await new Promise((resolve) => setTimeout(resolve, 400));

		const persisted = storage._dump().scotland_rail_settings;
		expect(persisted).toBeDefined();

		const reloaded = await loadStore({
			scotland_rail_settings: persisted ?? "",
		});
		expect(reloaded.store.railStore.settings.showLochs).toBe(false);
	});
});
