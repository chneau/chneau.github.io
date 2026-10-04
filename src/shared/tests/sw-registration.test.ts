import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import type { registerServiceWorker } from "../service-worker";

/**
 * Coverage for the *registrar* (`src/shared/service-worker.ts`), the page-side
 * half of the site's offline support.
 *
 * `sw.test.ts` next door exercises the worker script itself (`public/sw.js`) —
 * its cache keys, its navigation fallback, its version handling. Nothing
 * exercised the code every one of the thirteen apps runs at boot, so this file
 * pins it.
 *
 * The reload guard is the highest-risk property here, and it is the one the
 * source itself calls out as a historical bug: `clients.claim()` in the worker
 * makes `controllerchange` fire on pages that did not ask for it, and a
 * `controllerchange` handler that reloads unconditionally turns any deploy —
 * or any late `update()` — into a reload loop that only ends when the tab is
 * closed. Getting it wrong is not a cosmetic defect: the page becomes
 * unreloadable. So the assertions below are about the *absence* of a reload
 * (re-claim, empty controller, first visit) at least as much as its presence,
 * and each one reaches a real decision in the source rather than re-stating it.
 */

type Listener = (event: Event) => void;

/** A `ServiceWorker` stand-in: the registrar only reads `scriptURL` and posts. */
type FakeWorker = {
	scriptURL: string;
	messages: unknown[];
	postMessage: (message: unknown) => void;
};

/** The `ServiceWorkerContainer` surface the registrar touches. */
type FakeContainer = {
	controller: FakeWorker | null;
	listeners: Map<string, Set<Listener>>;
	registerCalls: { url: string; options?: RegistrationOptions }[];
	register: (
		url: string,
		options?: RegistrationOptions,
	) => Promise<FakeRegistration>;
	/** Delivers a `controllerchange`, as the browser would after a claim. */
	fire: (type: string) => void;
	addEventListener: (type: string, listener: Listener) => void;
	removeEventListener: (type: string, listener: Listener) => void;
};

/** A `ServiceWorkerRegistration` stand-in. `update()` is fire-and-forget in the
 * source (its rejection is swallowed), so it must not throw synchronously. */
type FakeRegistration = {
	updateCalls: number;
	scope: string;
	installing: FakeWorker | null;
	waiting: FakeWorker | null;
	active: FakeWorker | null;
	update: () => Promise<void>;
	addEventListener: (type: string, listener: Listener) => void;
	removeEventListener: (type: string, listener: Listener) => void;
};

type Restore = () => void;

/** Everything a scenario can observe, plus the undo for what it installed. */
type Harness = {
	container: FakeContainer;
	registration: FakeRegistration;
	reloads: () => number;
	restore: Restore;
};

type SetupOptions = {
	protocol?: string;
	hostname?: string;
	/** The controller present *before* `register()` — the "was controlled" sample. */
	controller?: FakeWorker | null;
	/** Make `register()` reject, as it does for a blocked or 404 worker. */
	registerFailure?: boolean;
};

const makeWorker = (scriptURL: string): FakeWorker => {
	// The worker stand-in is the only place the SCOPE payload lands, so
	// recording it lets a test prove the message reached *some* worker rather
	// than proving nothing.
	const messages: unknown[] = [];
	return {
		scriptURL,
		messages,
		postMessage: (message) => {
			messages.push(message);
		},
	};
};

const listenerMap = () => new Map<string, Set<Listener>>();

const install = (options: SetupOptions = {}): Harness => {
	const {
		protocol = "https:",
		hostname = "chneau.github.io",
		controller = null,
		registerFailure = false,
	} = options;

	const registerCalls: { url: string; options?: RegistrationOptions }[] = [];
	const containerListeners = listenerMap();
	const registrationListeners = listenerMap();

	// A claim hands the page the worker it just registered. When the page was
	// already controlled, that is the same worker under the same script URL —
	// which is precisely the case the reload guard must ignore.
	const claimed =
		controller ?? makeWorker("https://chneau.github.io/sw.js?v=dev");
	const registration: FakeRegistration = {
		updateCalls: 0,
		scope: "/",
		// The claim hands back a worker the registrar may talk to directly; on a
		// plain success it is the same one the controller now points at.
		installing: null,
		waiting: null,
		active: claimed,
		update: () => {
			registration.updateCalls += 1;
			return Promise.resolve();
		},
		addEventListener: (type, listener) => {
			const existing = registrationListeners.get(type) ?? new Set();
			existing.add(listener);
			registrationListeners.set(type, existing);
		},
		removeEventListener: (type, listener) => {
			registrationListeners.get(type)?.delete(listener);
		},
	};

	const container: FakeContainer = {
		controller,
		listeners: containerListeners,
		registerCalls,
		register: (url, registerOptions) => {
			registerCalls.push({ url, options: registerOptions });
			if (registerFailure) return Promise.reject(new Error("boom"));
			// A real register() resolves with the controller already set: the
			// worker calls clients.claim() before the promise settles. Modelling
			// that is the whole reason `wasControlled` is sampled up front.
			container.controller = claimed;
			// No cast to `ServiceWorkerRegistration`: the registrar reaches this
			// object through the real DOM types, and this fake is only ever seen
			// at runtime, so the honest return type is the fake's own.
			return Promise.resolve(registration);
		},
		fire: (type) => {
			for (const listener of containerListeners.get(type) ?? []) {
				listener(new Event(type));
			}
		},
		addEventListener: (type, listener) => {
			const existing = containerListeners.get(type) ?? new Set();
			existing.add(listener);
			containerListeners.set(type, existing);
		},
		removeEventListener: (type, listener) => {
			containerListeners.get(type)?.delete(listener);
		},
	};

	let reloads = 0;
	// `registerServiceWorker` attaches its `load` handler to the real `window`,
	// which Bun shares with every other suite in the process — and the handler
	// is never removed, because in a real page the page goes away instead. Left
	// alone, the first harness's handler would fire again under the tenth
	// harness's globals and register a second time, so every assertion after the
	// first would be measuring leakage rather than the source. Recording the
	// handlers and detaching them on restore keeps each scenario to one
	// registration.
	const recordedLoads: Listener[] = [];
	const nativeAdd = window.addEventListener.bind(window);
	const nativeRemove = window.removeEventListener.bind(window);
	window.addEventListener = ((
		type: string,
		listener: Listener,
		options?: boolean | AddEventListenerOptions,
	) => {
		if (type === "load") recordedLoads.push(listener);
		nativeAdd(type, listener, options);
	}) as typeof window.addEventListener;
	window.removeEventListener = ((
		type: string,
		listener: Listener,
		options?: boolean | EventListenerOptions,
	) => {
		if (type === "load") {
			const at = recordedLoads.indexOf(listener);
			if (at >= 0) recordedLoads.splice(at, 1);
		}
		nativeRemove(type, listener, options);
	}) as typeof window.removeEventListener;

	const previousLocation = Object.getOwnPropertyDescriptor(window, "location");
	const previousServiceWorker = Object.getOwnPropertyDescriptor(
		navigator,
		"serviceWorker",
	);
	// happy-dom exposes `location` as a configurable accessor on window, so the
	// whole object can be swapped and put back exactly as found.
	Object.defineProperty(window, "location", {
		configurable: true,
		value: {
			href: `${protocol}//${hostname}/`,
			protocol,
			hostname,
			origin: `${protocol}//${hostname}`,
			reload: () => {
				reloads += 1;
			},
		},
	});
	Object.defineProperty(navigator, "serviceWorker", {
		configurable: true,
		value: container,
	});

	return {
		container,
		registration,
		reloads: () => reloads,
		restore: () => {
			for (const listener of [...recordedLoads]) {
				nativeRemove("load", listener);
			}
			recordedLoads.length = 0;
			window.addEventListener = nativeAdd;
			window.removeEventListener = nativeRemove;
			if (previousLocation) {
				Object.defineProperty(window, "location", previousLocation);
			} else {
				Reflect.deleteProperty(window, "location");
			}
			if (previousServiceWorker) {
				Object.defineProperty(
					navigator,
					"serviceWorker",
					previousServiceWorker,
				);
			} else {
				Reflect.deleteProperty(navigator, "serviceWorker");
			}
		},
	};
};

/**
 * The source defers all of its work to a `load` listener. Dispatching the event
 * (rather than poking the handler directly) is what makes this a test of the
 * real entry point, and the awaits drain the register promise chain so the
 * assertions run after `controllerchange` has been wired up.
 */
/**
 * A fresh copy of the registrar, so the module-level `registered` latch starts
 * unset for every scenario.
 *
 * The registrar is idempotent by design — one `load` listener per document — and
 * that idempotence is module state, so a statically imported copy would let the
 * first test in this file consume the single attempt and leave every later one
 * asserting nothing. Re-importing under a distinct specifier gives each scenario
 * its own module instance, which is the same trick `weather-cache.test.ts` uses
 * to get a fresh `store.ts`.
 */
let instance = 0;
const freshRegistrar = async (): Promise<typeof registerServiceWorker> => {
	instance += 1;
	const fresh = (await import(`../service-worker?swreg=${instance}`)) as {
		registerServiceWorker: typeof registerServiceWorker;
	};
	return fresh.registerServiceWorker;
};

const boot = async (_harness: Harness): Promise<void> => {
	const register = await freshRegistrar();
	register();
	window.dispatchEvent(new Event("load"));
	// Two turns: one for `register()`'s promise to settle, one for the
	// `.then` body that registers the listener.
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};

const afterEachRestore: Restore[] = [];

afterEach(() => {
	while (afterEachRestore.length > 0) {
		afterEachRestore.pop()?.();
	}
});

describe("registerServiceWorker — the environment gate", () => {
	test("registers on a plain https host", async () => {
		const harness = install({
			protocol: "https:",
			hostname: "chneau.github.io",
		});
		afterEachRestore.push(harness.restore);

		await boot(harness);

		expect(harness.container.registerCalls).toHaveLength(1);
	});

	// Each of these is a refusal the source has decided on by name; a case that
	// silently started registering would be a dev machine talking to a
	// half-installed worker over an insecure origin.
	const refused: { protocol: string; hostname: string; why: string }[] = [
		{ protocol: "http:", hostname: "chneau.github.io", why: "insecure scheme" },
		{ protocol: "https:", hostname: "localhost", why: "loopback by name" },
		{ protocol: "https:", hostname: "127.0.0.1", why: "loopback by address" },
		{ protocol: "https:", hostname: "::1", why: "IPv6 loopback" },
		{ protocol: "https:", hostname: "[::1]", why: "bracketed IPv6 loopback" },
		{ protocol: "https:", hostname: "pi.local", why: "mDNS LAN preview" },
		{ protocol: "https:", hostname: "preview.local", why: "mDNS, not bare" },
	];

	for (const scenario of refused) {
		test(`refuses ${scenario.why} (${scenario.protocol}//${scenario.hostname})`, async () => {
			const harness = install({
				protocol: scenario.protocol,
				hostname: scenario.hostname,
			});
			afterEachRestore.push(harness.restore);

			await boot(harness);

			expect(harness.container.registerCalls).toHaveLength(0);
		});
	}

	test("refuses when the Service Worker API is absent from navigator", async () => {
		const harness = install();
		afterEachRestore.push(harness.restore);
		Reflect.deleteProperty(navigator, "serviceWorker");

		await boot(harness);

		expect(harness.container.registerCalls).toHaveLength(0);
	});

	test("a refused origin attaches no load listener beyond the one it added", async () => {
		// Guards the gate itself: `register()` is never reached, so the fake
		// container must be untouched, not merely uncalled once.
		const harness = install({ protocol: "http:", hostname: "localhost" });
		afterEachRestore.push(harness.restore);

		await boot(harness);

		expect(harness.container.listeners.size).toBe(0);
		expect(harness.reloads()).toBe(0);
	});
});

describe("registerServiceWorker — what it registers", () => {
	test("registers /sw.js at scope / with the build token, and updates", async () => {
		const previousBuildId = Reflect.get(globalThis, "SW_BUILD_ID");
		Reflect.set(globalThis, "SW_BUILD_ID", "2026-10-04T12:00:00Z");
		afterEachRestore.push(() => {
			if (previousBuildId === undefined) {
				Reflect.deleteProperty(globalThis, "SW_BUILD_ID");
			} else {
				Reflect.set(globalThis, "SW_BUILD_ID", previousBuildId);
			}
		});

		const harness = install();
		afterEachRestore.push(harness.restore);

		await boot(harness);

		expect(harness.container.registerCalls).toEqual([
			{
				url: "/sw.js?v=2026-10-04T120000Z",
				options: { scope: "/" },
			},
		]);
		// The proactive update is what surfaces a new deploy at all.
		expect(harness.registration.updateCalls).toBe(1);
	});

	test("falls back to the token 'dev' when the build id is absent", async () => {
		const previousBuildId = Reflect.get(globalThis, "SW_BUILD_ID");
		Reflect.deleteProperty(globalThis, "SW_BUILD_ID");
		afterEachRestore.push(() => {
			if (previousBuildId !== undefined) {
				Reflect.set(globalThis, "SW_BUILD_ID", previousBuildId);
			}
		});

		const harness = install();
		afterEachRestore.push(harness.restore);

		await boot(harness);

		expect(harness.container.registerCalls[0]?.url).toBe("/sw.js?v=dev");
	});

	test("announces the app scope to a worker, so its fallbacks stay per-app", async () => {
		const link = document.createElement("link");
		link.rel = "canonical";
		link.href = "https://chneau.github.io/cv/";
		document.head.append(link);
		afterEachRestore.push(() => link.remove());

		const harness = install();
		afterEachRestore.push(harness.restore);

		await boot(harness);

		const controller = harness.container.controller;
		expect(controller?.messages).toEqual([{ type: "SCOPE", base: "/cv/" }]);
	});

	test("a failed registration is swallowed and attaches nothing", async () => {
		const harness = install({ registerFailure: true });
		afterEachRestore.push(harness.restore);

		await boot(harness);

		// Offline support is best-effort: no throw, and crucially no
		// controllerchange listener that could reload a page that has no worker.
		expect(harness.container.listeners.size).toBe(0);
		expect(harness.reloads()).toBe(0);
	});
});

describe("registerServiceWorker — the reload guard", () => {
	test("a first visit never reloads, because no listener is attached at all", async () => {
		// `clients.claim()` sets the controller before `register()` resolves, so
		// the pre-registered sample is null. The guard is the absence of a
		// listener: asserting only "no reload" would also pass if the listener
		// existed but happened not to fire, which is a weaker thing than what the
		// code actually guarantees.
		const harness = install({ controller: null });
		afterEachRestore.push(harness.restore);

		await boot(harness);
		// Registration really did happen, and it really did hand us a controller.
		expect(harness.container.registerCalls).toHaveLength(1);
		expect(harness.container.controller).not.toBeNull();

		harness.container.fire("controllerchange");

		expect(harness.container.listeners.get("controllerchange")).toBeUndefined();
		expect(harness.reloads()).toBe(0);
	});

	test("a re-claim of the same worker does not reload", async () => {
		// The historical bug: the worker calls claim() on every activation, so
		// controllerchange fires with the *same* script URL. Reloading here is a
		// loop.
		const harness = install({
			controller: makeWorker(
				"https://chneau.github.io/sw.js?v=2026-10-04T120000Z",
			),
		});
		afterEachRestore.push(harness.restore);

		await boot(harness);
		expect(harness.container.listeners.get("controllerchange")?.size).toBe(1);

		harness.container.controller = makeWorker(
			"https://chneau.github.io/sw.js?v=2026-10-04T120000Z",
		);
		harness.container.fire("controllerchange");

		expect(harness.reloads()).toBe(0);
	});

	test("a genuinely different worker reloads exactly once", async () => {
		const harness = install({
			controller: makeWorker("https://chneau.github.io/sw.js?v=old-deploy"),
		});
		afterEachRestore.push(harness.restore);

		await boot(harness);
		expect(harness.container.listeners.get("controllerchange")?.size).toBe(1);

		harness.container.controller = makeWorker(
			"https://chneau.github.io/sw.js?v=new-deploy",
		);
		harness.container.fire("controllerchange");

		expect(harness.reloads()).toBe(1);
	});

	test("an empty controller script URL does not reload", async () => {
		// A controller without a usable scriptURL carries no evidence that the
		// worker changed, so reloading on it would be a guess.
		const harness = install({
			controller: makeWorker("https://chneau.github.io/sw.js?v=old-deploy"),
		});
		afterEachRestore.push(harness.restore);

		await boot(harness);

		harness.container.controller = makeWorker("");
		harness.container.fire("controllerchange");
		expect(harness.reloads()).toBe(0);

		// ...and an absent controller after the claim is equally no evidence.
		harness.container.controller = null;
		harness.container.fire("controllerchange");
		expect(harness.reloads()).toBe(0);
	});
});

describe("registerServiceWorker — it runs at most once", () => {
	/**
	 * The comment claimed "at most once per page load" while the guard compared
	 * only script URLs. `location.reload()` is asynchronous, so a second
	 * `controllerchange` — an update landing while the navigation is still being
	 * scheduled — arrives before the page goes away and reloaded again.
	 */
	test("two claims by the same new worker reload once, not twice", async () => {
		const harness = install({
			controller: makeWorker("https://chneau.github.io/sw.js?v=old"),
		});
		afterEachRestore.push(harness.restore);

		await boot(harness);

		const fresh = makeWorker("https://chneau.github.io/sw.js?v=new");
		harness.container.controller = fresh;
		harness.container.fire("controllerchange");
		expect(harness.reloads()).toBe(1);

		// Same worker again. The URL still differs from the pre-registered one, so
		// the comparison alone would allow a second reload.
		harness.container.fire("controllerchange");
		expect(harness.reloads()).toBe(1);
	});

	/**
	 * Idempotence: two calls previously added two `load` listeners, so two
	 * registrations, two `update()` calls and two `controllerchange` listeners —
	 * each of which could reload.
	 */
	test("calling it twice registers once", async () => {
		const harness = install({
			controller: makeWorker("https://chneau.github.io/sw.js?v=old"),
		});
		afterEachRestore.push(harness.restore);

		const register = await freshRegistrar();
		register();
		register();
		window.dispatchEvent(new Event("load"));
		await Promise.resolve();
		await Promise.resolve();

		// One `load` listener, so one registration.
		expect(harness.container.registerCalls).toHaveLength(1);
	});
});
