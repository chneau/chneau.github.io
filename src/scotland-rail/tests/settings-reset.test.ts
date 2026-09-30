import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AppSettings } from "../data/types";

/**
 * Regression guard for two coupled bugs in the settings store.
 *
 * 1. `getInitialState` assigned `settings: DEFAULT_SETTINGS` BY REFERENCE.
 *    `proxy()` wraps the object it is given, so every user toggle mutated the
 *    module-level constant, and `resetSettings` - which spread that same
 *    constant - restored the already-mutated values. "Reset to defaults" was a
 *    no-op for every setting the user had touched.
 *  2. Persistence was subscribed to `railStore.settings`. `resetSettings`
 *    replaces that object, orphaning the listener, so after one reset NO
 *    settings change was ever saved again for the session.
 *
 * `src/scotland-rail/store.ts` has module-scope side effects (it builds the
 * whole store, subscribes, and recomputes), so the module is re-imported with a
 * cache-busting query and a stubbed `localStorage` per case.
 */

/** Minimal localStorage stand-in with independent storage per instance. */
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

/**
 * Bun has no `localStorage`, so the store's `typeof localStorage === "undefined"`
 * SSR guard would skip persistence entirely. One global stub is installed for
 * the file; every `loadStore` call points it at a fresh store.
 */
let activeStorage: ReturnType<typeof createStorage> | null = null;

const globalStub = {
	getItem: (key: string) => activeStorage?.getItem(key) ?? null,
	setItem: (key: string, value: string) => activeStorage?.setItem(key, value),
	removeItem: (key: string) => activeStorage?.removeItem(key),
	clear: () => activeStorage?.clear(),
};

// Saved so the previous descriptor can be restored verbatim.
const previousLocalStorage = Object.getOwnPropertyDescriptor(
	globalThis,
	"localStorage",
);

/**
 * Installed with `defineProperty` rather than a plain assignment: another test
 * file in the suite installs its own `localStorage` via `defineProperty` and may
 * leave it non-writable, and a plain assignment would then throw
 * "Attempted to assign to readonly property" - a failure that only appears when
 * the whole suite runs together.
 */
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
	// Restore the previous VALUE as a plain WRITABLE data property.
	//
	// Several files in this suite install `globalThis.localStorage` with plain
	// assignment. If the property we inherited is a getter-only accessor (bun
	// defines some globals that way), restoring it verbatim - or restoring any
	// descriptor without `writable` - makes every later assignment throw
	// "Attempted to assign to readonly property". That only surfaces when the
	// whole suite runs in one process, which is exactly when it is most
	// confusing. Flattening to a writable data property is the cooperative
	// choice: it preserves the value and keeps the global assignable for others.
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

/**
 * A unique query defeats bun's module cache, giving a fresh module graph - and
 * therefore a fresh `DEFAULT_SETTINGS` - per case. Two stores loaded this way
 * must not share mutable state, which is exactly what the regression did.
 */
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

		// Flip every boolean setting away from its default.
		for (const key of Object.keys(defaults) as (keyof AppSettings)[]) {
			const current = defaults[key];
			if (typeof current === "boolean") {
				store.railActions.updateSetting(key, !current as never);
			}
		}

		// The module constant must NOT have been mutated by user interaction.
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

		// A second, independent module graph must start from clean defaults.
		const second = await loadStore();
		expect(second.store.railStore.settings.showLochs).toBe(true);
		expect(second.store.railStore.settings.cityLights).toBe(true);
	});
});

describe("settings persistence", () => {
	test("changes are written to storage", async () => {
		const { store, storage } = await loadStore();
		store.railActions.updateSetting("showLochs", false);
		// The save is debounced; flush the macrotask queue.
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

		// The regression: the listener used to be bound to the replaced object,
		// so from here on nothing was ever written again.
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
