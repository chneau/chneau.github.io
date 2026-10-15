import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import type { registerServiceWorker } from "../service-worker";

type Listener = (event: Event) => void;

type FakeWorker = {
	scriptURL: string;
	messages: unknown[];
	postMessage: (message: unknown) => void;
};

type FakeContainer = {
	controller: FakeWorker | null;
	listeners: Map<string, Set<Listener>>;
	registerCalls: { url: string; options?: RegistrationOptions }[];
	register: (
		url: string,
		options?: RegistrationOptions,
	) => Promise<FakeRegistration>;
	fire: (type: string) => void;
	addEventListener: (type: string, listener: Listener) => void;
	removeEventListener: (type: string, listener: Listener) => void;
};

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

type Harness = {
	container: FakeContainer;
	registration: FakeRegistration;
	reloads: () => number;
	restore: Restore;
};

type SetupOptions = {
	protocol?: string;
	hostname?: string;
	controller?: FakeWorker | null;
	registerFailure?: boolean;
};

const makeWorker = (scriptURL: string): FakeWorker => {
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

	const claimed =
		controller ?? makeWorker("https://chneau.github.io/sw.js?v=dev");
	const registration: FakeRegistration = {
		updateCalls: 0,
		scope: "/",
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
			container.controller = claimed;
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

		expect(harness.container.listeners.size).toBe(0);
		expect(harness.reloads()).toBe(0);
	});
});

describe("registerServiceWorker — the reload guard", () => {
	test("a first visit never reloads, because no listener is attached at all", async () => {
		const harness = install({ controller: null });
		afterEachRestore.push(harness.restore);

		await boot(harness);
		expect(harness.container.registerCalls).toHaveLength(1);
		expect(harness.container.controller).not.toBeNull();

		harness.container.fire("controllerchange");

		expect(harness.container.listeners.get("controllerchange")).toBeUndefined();
		expect(harness.reloads()).toBe(0);
	});

	test("a re-claim of the same worker does not reload", async () => {
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
		const harness = install({
			controller: makeWorker("https://chneau.github.io/sw.js?v=old-deploy"),
		});
		afterEachRestore.push(harness.restore);

		await boot(harness);

		harness.container.controller = makeWorker("");
		harness.container.fire("controllerchange");
		expect(harness.reloads()).toBe(0);

		harness.container.controller = null;
		harness.container.fire("controllerchange");
		expect(harness.reloads()).toBe(0);
	});
});

describe("registerServiceWorker — it runs at most once", () => {
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

		harness.container.fire("controllerchange");
		expect(harness.reloads()).toBe(1);
	});

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

		expect(harness.container.registerCalls).toHaveLength(1);
	});
});
