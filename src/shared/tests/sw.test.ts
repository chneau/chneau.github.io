import { beforeAll, describe, expect, test } from "bun:test";

const ORIGIN = "https://chneau.github.io";
type Strategy = string;

type StrategyName = {
	BYPASS: Strategy;
	NETWORK_FIRST: Strategy;
	STALE_WHILE_REVALIDATE: Strategy;
};

type Internals = {
	STRATEGY: StrategyName;
	MAX_CACHE_BYTES: number;
	MAX_CACHE_ENTRIES: number;
	MAX_ENTRY_BYTES: number;
	BUILD_ID: string;
	appBaseFor: (pathname: string, bases: Iterable<string>) => string;
	decideStrategy: (
		request: { method: string; mode?: string; headers?: unknown },
		url: TestURL,
		sameOrigin: boolean,
	) => Strategy;
	normalizeBase: (value: unknown) => string | null;
	resolveBuildId: (scriptHref: string) => string;
	sanitizeCacheKey: (value: unknown) => string;
};

type HeadersInitLike = Iterable<[string, string]> | Record<string, string>;

class TestHeaders {
	private readonly map = new Map<string, string>();

	constructor(init?: HeadersInitLike) {
		if (!init) return;
		const pairs: Iterable<[string, string]> =
			typeof (init as Iterable<[string, string]>)[Symbol.iterator] ===
			"function"
				? (init as Iterable<[string, string]>)
				: Object.entries(init as Record<string, string>);
		for (const [key, value] of pairs) this.set(key, value);
	}

	get(name: string): string | null {
		return this.map.get(name.toLowerCase()) ?? null;
	}
	set(name: string, value: string): void {
		this.map.set(name.toLowerCase(), String(value));
	}
	has(name: string): boolean {
		return this.map.has(name.toLowerCase());
	}
	delete(name: string): void {
		this.map.delete(name.toLowerCase());
	}
	entries(): IterableIterator<[string, string]> {
		return this.map.entries();
	}
	*[Symbol.iterator](): IterableIterator<[string, string]> {
		yield* this.map.entries();
	}
	clone(): TestHeaders {
		const copy = new TestHeaders();
		for (const [key, value] of this.map) copy.set(key, value);
		return copy;
	}
}

type ResponseType = "default" | "error" | "opaque" | "opaqueredirect";

class TestResponse {
	readonly status: number;
	readonly statusText: string;
	readonly type: ResponseType;
	readonly headers: TestHeaders;
	readonly ok: boolean;
	private readonly bytes: Uint8Array;

	constructor(
		body?: string | Uint8Array | ArrayBuffer,
		init: {
			status?: number;
			statusText?: string;
			headers?: HeadersInitLike;
		} = {},
		type: ResponseType = "default",
	) {
		this.status = init.status ?? 200;
		this.statusText = init.statusText ?? "";
		this.type = type;
		this.headers = new TestHeaders(init.headers);
		this.bytes = TestResponse.toBytes(body);
		this.ok = this.status >= 200 && this.status < 300;
	}

	private static toBytes(body?: string | Uint8Array | ArrayBuffer): Uint8Array {
		if (body === undefined || body === null) return new Uint8Array(0);
		if (typeof body === "string") return new TextEncoder().encode(body);
		if (body instanceof Uint8Array) return body;
		return new Uint8Array(body);
	}

	private static from(parts: {
		bytes: Uint8Array;
		status: number;
		statusText: string;
		type: ResponseType;
		headers: TestHeaders;
	}): TestResponse {
		const response = new TestResponse(parts.bytes, {
			status: parts.status,
			statusText: parts.statusText,
			headers: parts.headers,
		});
		return Object.defineProperty(response, "type", {
			value: parts.type,
		}) as TestResponse;
	}

	clone(): TestResponse {
		return TestResponse.from({
			bytes: this.bytes.slice(),
			status: this.status,
			statusText: this.statusText,
			type: this.type,
			headers: this.headers.clone(),
		});
	}

	async text(): Promise<string> {
		return new TextDecoder().decode(this.bytes);
	}
	async json(): Promise<unknown> {
		return JSON.parse(await this.text());
	}
	async arrayBuffer(): Promise<ArrayBuffer> {
		return this.bytes.slice().buffer;
	}

	static error(): TestResponse {
		return new TestResponse(undefined, { status: 0 }, "error");
	}
	static redirect(url: string, status = 302): TestResponse {
		return new TestResponse(undefined, {
			status,
			headers: { location: url },
		});
	}
}

class TestURL {
	readonly href: string;
	readonly protocol: string;
	readonly origin: string;
	readonly pathname: string;
	readonly searchParams: { get: (key: string) => string | null };

	constructor(input: string, base?: string | TestURL) {
		const baseHref = typeof base === "string" ? base : base?.href;
		const absolute = baseHref ? TestURL.resolve(input, baseHref) : input;
		const match =
			/^([a-zA-Z][a-zA-Z0-9+.-]*:)(?:\/\/([^/?#]*))?([^?#]*)(\?[^#]*)?/.exec(
				absolute,
			);
		if (!match) throw new TypeError(`Invalid URL: ${input}`);
		this.protocol = match[1] ?? "";
		const authority = match[2] ?? "";
		this.origin = authority ? `${this.protocol}//${authority}` : "null";
		const path = match[3] ?? "";
		this.pathname = path === "" ? "/" : path;
		const query = match[4] ?? "";
		const params = new Map<string, string>();
		for (const pair of query.replace(/^\?/, "").split("&")) {
			if (!pair) continue;
			const eq = pair.indexOf("=");
			const key = eq === -1 ? pair : pair.slice(0, eq);
			const value = eq === -1 ? "" : pair.slice(eq + 1);
			params.set(TestURL.decode(key), TestURL.decode(value));
		}
		this.searchParams = { get: (key) => params.get(key) ?? null };
		this.href = authority
			? `${this.protocol}//${authority}${this.pathname}${query}`
			: `${absolute}`;
	}

	private static resolve(ref: string, base: string): string {
		if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(ref) || ref.startsWith("//")) {
			return ref;
		}
		const match = /^([a-zA-Z][a-zA-Z0-9+.-]*:)\/\/([^/?#]*)([^?#]*)?/.exec(
			base,
		);
		if (!match) return `${base}${ref}`;
		const root = `${match[1]}//${match[2]}`;
		if (ref.startsWith("/")) return `${root}${ref}`;
		const basePath = match[3] ?? "/";
		const dir = basePath.slice(0, basePath.lastIndexOf("/") + 1) || "/";
		return `${root}${dir}${ref}`;
	}

	private static decode(value: string): string {
		return decodeURIComponent(value.replace(/\+/g, " "));
	}
}

class TestRequest {
	readonly url: string;
	readonly method: string;
	readonly mode: string;
	readonly headers: TestHeaders;

	constructor(
		input: string | TestRequest,
		init: { method?: string; mode?: string; headers?: HeadersInitLike } = {},
	) {
		this.url = typeof input === "string" ? input : input.url;
		this.method = (init.method ?? "GET").toUpperCase();
		this.mode = init.mode ?? "cors";
		this.headers = new TestHeaders(init.headers);
	}

	clone(): TestRequest {
		return new TestRequest(this.url, {
			method: this.method,
			mode: this.mode,
			headers: this.headers,
		});
	}
}

type FetchImpl = (request: TestRequest) => Promise<TestResponse>;

class FakeCache {
	entries = new Map<string, TestResponse>();

	constructor(private readonly net: FetchImpl) {}

	private keyOf(request: unknown): string {
		return typeof request === "string"
			? new TestURL(request, ORIGIN).href
			: (request as TestRequest).url;
	}

	async match(request: unknown): Promise<TestResponse | undefined> {
		return this.entries.get(this.keyOf(request))?.clone();
	}
	async put(request: unknown, response: TestResponse): Promise<void> {
		this.entries.set(this.keyOf(request), response);
	}
	async add(url: string): Promise<void> {
		const response = await this.net(
			new TestRequest(new TestURL(url, ORIGIN).href),
		);
		if (!response.ok) throw new Error(`add failed: ${url}`);
		this.entries.set(new TestURL(url, ORIGIN).href, response);
	}
	async delete(request: unknown): Promise<boolean> {
		return this.entries.delete(this.keyOf(request));
	}
	async keys(): Promise<TestRequest[]> {
		return [...this.entries.keys()].map((href) => new TestRequest(href));
	}
}

type WindowClient = {
	url: string;
	focused: boolean;
	focus: () => Promise<void>;
};

type Harness = {
	internals: Internals;
	caches: Map<string, FakeCache>;
	netLog: string[];
	clients: WindowClient[];
	calls: string[];
	net: FetchImpl;
	settle: () => Promise<void>;
	dispatchFetch: (request: TestRequest) => Promise<TestResponse | null>;
	dispatchInstall: () => Promise<void>;
	dispatchMessage: (data: unknown) => void;
	dispatchNotificationClick: (notification: unknown) => Promise<void>;
};

const loadWorker = async (scriptHref = `${ORIGIN}/sw.js`): Promise<Harness> => {
	const source = await Bun.file(
		new URL("../../../public/sw.js", import.meta.url),
	).text();

	const listeners = new Map<string, (event: never) => void>();
	const cachesByName = new Map<string, FakeCache>();
	const netLog: string[] = [];
	const calls: string[] = [];
	const clients: WindowClient[] = [];
	const pending: Promise<unknown>[] = [];
	let net: FetchImpl = async () => networkDown();

	const fetchImpl: FetchImpl = async (request) => {
		netLog.push(request.url);
		return net(request);
	};

	const caches = {
		async open(name: string) {
			let cache = cachesByName.get(name);
			if (!cache) {
				cache = new FakeCache(fetchImpl);
				cachesByName.set(name, cache);
			}
			return cache;
		},
		async keys() {
			return [...cachesByName.keys()];
		},
		async delete(name: string) {
			return cachesByName.delete(name);
		},
	};

	const scope = {
		location: new TestURL(scriptHref),
		addEventListener: (type: string, fn: (event: never) => void) => {
			listeners.set(type, fn);
		},
		skipWaiting: () => calls.push("skipWaiting"),
		clients: {
			claim: async () => undefined,
			matchAll: async () => clients,
			openWindow: async (url: string) => {
				calls.push(`openWindow:${url}`);
				return { url };
			},
		},
	};

	const factory = new Function(
		"self",
		"caches",
		"fetch",
		"clients",
		"Response",
		"Request",
		"Headers",
		"URL",
		source,
	);
	factory(
		scope,
		caches,
		fetchImpl,
		scope.clients,
		TestResponse,
		TestRequest,
		TestHeaders,
		TestURL,
	);

	const emit = (type: string, event: unknown) => {
		(listeners.get(type) as ((e: unknown) => void) | undefined)?.(event);
	};

	const settle = async () => {
		for (let i = 0; i < 4; i += 1) {
			await Promise.all(pending.splice(0, pending.length));
			await Bun.sleep(1);
		}
	};

	const harness: Harness = {
		internals: (scope as unknown as { __swInternals: Internals }).__swInternals,
		caches: cachesByName,
		netLog,
		calls,
		clients,
		get net() {
			return net;
		},
		set net(impl: FetchImpl) {
			net = impl;
		},
		settle,
		dispatchFetch: async (request: TestRequest) => {
			let responded: Promise<TestResponse> | null = null;
			emit("fetch", {
				request,
				respondWith: (value: Promise<TestResponse>) => {
					responded = value;
				},
				waitUntil: (value: Promise<unknown>) => {
					pending.push(value);
				},
			});
			return responded ? await responded : null;
		},
		dispatchInstall: async () => {
			emit("install", {
				waitUntil: (value: Promise<unknown>) => {
					pending.push(value);
				},
			});
			await settle();
		},
		dispatchMessage: (data: unknown) => {
			emit("message", { data });
		},
		dispatchNotificationClick: async (notification: unknown) => {
			emit("notificationclick", {
				notification: {
					close: () => calls.push("close"),
					data: undefined,
					...(notification as Record<string, unknown>),
				},
				waitUntil: (value: Promise<unknown>) => {
					pending.push(value);
				},
			});
			await settle();
		},
	};

	return harness;
};

let sw: Internals;

beforeAll(async () => {
	sw = (await loadWorker()).internals;
});

const url = (path: string, origin = ORIGIN) => new TestURL(path, origin);

const req = (
	path: string,
	init: { method?: string; mode?: string; headers?: HeadersInitLike } = {},
	origin = ORIGIN,
) => new TestRequest(url(path, origin).href, init);

const nav = (path: string, origin = ORIGIN) =>
	new TestRequest(url(path, origin).href, { mode: "navigate" });

const seed = (
	h: Harness,
	cacheName: string,
	path: string,
	body: string,
	headers: HeadersInitLike = {},
) => {
	const existing = h.caches.get(cacheName);
	const cache = existing ?? new FakeCache(async () => networkDown());
	cache.entries.set(
		new TestURL(path, ORIGIN).href,
		new TestResponse(body, { headers }),
	);
	h.caches.set(cacheName, cache);
};

const withBody = (body: string, size = body.length) =>
	new TestResponse(body, { headers: { "content-length": String(size) } });

const networkDown = async (): Promise<TestResponse> => {
	throw new TypeError("Failed to fetch");
};

describe("decideStrategy", () => {
	test("navigations are network-first", () => {
		for (const path of ["/", "/cv/", "/spooners/", "/cv/?x=1", "/birthday/"]) {
			expect(
				sw.decideStrategy({ method: "GET", mode: "navigate" }, url(path), true),
			).toBe(sw.STRATEGY.NETWORK_FIRST);
		}
	});

	test("same-origin sub-resources are stale-while-revalidate", () => {
		const paths = [
			"/static/js/index.js",
			"/cv/static/css/index.css",
			"/spooners/data.json",
			"/offline.html",
			"/icons/root-192.png",
			"/manifest.json",
			"/crimson-desert-save-editor/image-archive/a.webp",
		];
		for (const path of paths) {
			expect(
				sw.decideStrategy({ method: "GET", mode: "cors" }, url(path), true),
			).toBe(sw.STRATEGY.STALE_WHILE_REVALIDATE);
		}
		expect(sw.decideStrategy({ method: "GET" }, url("/cv/x.js"), true)).toBe(
			sw.STRATEGY.STALE_WHILE_REVALIDATE,
		);
	});

	test("cross-origin requests are bypassed, whatever they look like", () => {
		const foreign = [
			"https://commons.wikimedia.org/w/api.php?action=query",
			"https://wttr.in/Edinburgh?format=j1",
			"https://us.i.posthog.com/capture/",
			"http://chneau.github.io/cv/",
		];
		for (const href of foreign) {
			const foreignUrl = new TestURL(href);
			const sameOrigin = foreignUrl.origin === ORIGIN;
			expect(
				sw.decideStrategy(
					{ method: "GET", mode: "cors" },
					foreignUrl,
					sameOrigin,
				),
			).toBe(sw.STRATEGY.BYPASS);
			expect(
				sw.decideStrategy(
					{ method: "GET", mode: "navigate" },
					foreignUrl,
					sameOrigin,
				),
			).toBe(sw.STRATEGY.BYPASS);
		}
	});

	test("non-GET methods are bypassed so a POST is never replayed from cache", () => {
		for (const method of [
			"POST",
			"PUT",
			"PATCH",
			"DELETE",
			"HEAD",
			"OPTIONS",
		]) {
			expect(
				sw.decideStrategy(
					{ method, mode: "cors" },
					url("/spooners/data.json"),
					true,
				),
			).toBe(sw.STRATEGY.BYPASS);
			expect(
				sw.decideStrategy({ method, mode: "navigate" }, url("/cv/"), true),
			).toBe(sw.STRATEGY.BYPASS);
		}
	});

	test("Range requests are bypassed: a 206 must never enter the cache", () => {
		const path = "/crimson-desert-save-editor/image-archive/a.webp";
		const ranged = new TestRequest(url(path).href, {
			headers: { range: "bytes=0-1023" },
		});
		expect(sw.decideStrategy(ranged, url(path), true)).toBe(sw.STRATEGY.BYPASS);
		expect(
			sw.decideStrategy(
				{ method: "GET", mode: "cors", headers: { Range: "bytes=10-" } },
				url("/icons/root-192.png"),
				true,
			),
		).toBe(sw.STRATEGY.BYPASS);
		expect(
			sw.decideStrategy(
				{ method: "GET", mode: "cors", headers: new TestHeaders() },
				url("/icons/root-192.png"),
				true,
			),
		).toBe(sw.STRATEGY.STALE_WHILE_REVALIDATE);
		expect(
			sw.decideStrategy(
				{ method: "GET", mode: "cors", headers: undefined },
				url("/icons/root-192.png"),
				true,
			),
		).toBe(sw.STRATEGY.STALE_WHILE_REVALIDATE);
	});

	test("the worker script itself is never served from a cache", () => {
		expect(
			sw.decideStrategy(
				{ method: "GET", mode: "no-cors" },
				url("/sw.js"),
				true,
			),
		).toBe(sw.STRATEGY.BYPASS);
		expect(
			sw.decideStrategy(
				{ method: "GET", mode: "cors" },
				url("/sw.js?v=2026-09-30"),
				true,
			),
		).toBe(sw.STRATEGY.BYPASS);
	});

	test("non-http(s) schemes are bypassed", () => {
		expect(
			sw.decideStrategy(
				{ method: "GET" },
				new TestURL("data:text/plain,hi"),
				true,
			),
		).toBe(sw.STRATEGY.BYPASS);
		expect(
			sw.decideStrategy({ method: "GET" }, new TestURL("blob:/x"), true),
		).toBe(sw.STRATEGY.BYPASS);
	});
});

describe("normalizeBase", () => {
	test("normalises app bases to trailing-slash paths", () => {
		expect(sw.normalizeBase("/cv")).toBe("/cv/");
		expect(sw.normalizeBase("/cv/")).toBe("/cv/");
		expect(sw.normalizeBase("/")).toBe("/");
		expect(sw.normalizeBase("/birthday/?a=b#c")).toBe("/birthday/");
		expect(sw.normalizeBase("  /spooners/  ")).toBe("/spooners/");
	});

	test("rejects anything that is not a same-origin path", () => {
		for (const bad of [
			"",
			"cv/",
			"//evil.example/",
			"https://evil.example/cv/",
			"javascript:alert(1)",
			'/cv/"onload=x',
			"/cv/ a",
			undefined,
			null,
			42,
			{},
			["/cv/"],
		]) {
			expect(sw.normalizeBase(bad)).toBeNull();
		}
	});
});

describe("appBaseFor", () => {
	test("picks the longest known base", () => {
		const bases = new Set(["/", "/cv/", "/crimson-desert-save-editor/"]);
		expect(sw.appBaseFor("/cv/", bases)).toBe("/cv/");
		expect(sw.appBaseFor("/cv/experience/2026", bases)).toBe("/cv/");
		expect(sw.appBaseFor("/crimson-desert-save-editor/", bases)).toBe(
			"/crimson-desert-save-editor/",
		);
		expect(sw.appBaseFor("/birthday/", bases)).toBe("/");
		expect(sw.appBaseFor("/", bases)).toBe("/");
		expect(sw.appBaseFor("/cvv/", bases)).toBe("/");
	});

	test("the root base never beats a sub-app", () => {
		expect(sw.appBaseFor("/spooners/", new Set(["/"]))).toBe("/");
		expect(sw.appBaseFor("/spooners/x", new Set(["/", "/spooners/"]))).toBe(
			"/spooners/",
		);
		expect(sw.appBaseFor("/cv/", [])).toBe("/");
	});
});

describe("harness isolation", () => {
	test("the worker never sees globalThis Response/Request/Headers/URL", () => {
		const ambient = ["Response", "Request", "Headers", "URL"] as const;
		for (const name of ambient) {
			expect((globalThis as unknown as Record<string, unknown>)[name]).not.toBe(
				{
					Response: TestResponse,
					Request: TestRequest,
					Headers: TestHeaders,
					URL: TestURL,
				}[name],
			);
		}
	});

	test("the doubles cover exactly what public/sw.js uses, and clone deeply", async () => {
		const original = withBody("payload");
		const clone = original.clone();
		expect(await clone.text()).toBe("payload");
		expect(await original.text()).toBe("payload");
		expect(clone).not.toBe(original);

		clone.headers.set("x-sw-size", "7");
		expect(clone.headers.get("x-sw-size")).toBe("7");
		expect(original.headers.has("x-sw-size")).toBe(false);

		const navigation = nav("/cv/");
		expect(navigation.mode).toBe("navigate");
		expect(navigation.method).toBe("GET");

		const parsed = new TestURL("/sw.js?v=abc", ORIGIN);
		expect(parsed.pathname).toBe("/sw.js");
		expect(parsed.protocol).toBe("https:");
		expect(parsed.origin).toBe(ORIGIN);
		expect(parsed.searchParams.get("v")).toBe("abc");
		expect(new TestURL("index.html", parsed).pathname).toBe("/index.html");

		expect(TestResponse.error().type).toBe("error");
		await expect(networkDown()).rejects.toBeInstanceOf(TypeError);
	});
});

describe("resolveBuildId", () => {
	test("the ?v= token on the script URL wins, sanitised for a cache name", () => {
		expect(sw.resolveBuildId(`${ORIGIN}/sw.js?v=2026-09-30%2012%3A00`)).toBe(
			"2026-09-301200",
		);
		expect(sw.sanitizeCacheKey("__BUILD_ID__")).toBe("__BUILD_ID__");
		expect(sw.sanitizeCacheKey("a/b?c#d")).toBe("abcd");
	});

	test("without ?v= the hand-written constant protects the cache", () => {
		const fallback = sw.resolveBuildId(`${ORIGIN}/sw.js`);
		expect(fallback).toBe(sw.BUILD_ID);
		expect(fallback).not.toBe("__BUILD_ID__");
		expect(fallback).toMatch(/^[a-zA-Z0-9._-]+$/);
	});

	test("a distinct token produces distinct cache namespaces", async () => {
		const first = await loadWorker(`${ORIGIN}/sw.js?v=deploy-1`);
		const second = await loadWorker(`${ORIGIN}/sw.js?v=deploy-2`);
		expect(first.internals.BUILD_ID).toBe("deploy-1");
		expect(second.internals.BUILD_ID).toBe("deploy-2");

		first.net = async () => withBody("<html>cv</html>");
		await first.dispatchFetch(nav("/cv/"));
		await first.settle();
		expect(first.caches.has("app-docs-deploy-1")).toBe(true);

		second.net = async () => withBody("<html>cv</html>");
		await second.dispatchFetch(nav("/cv/"));
		await second.settle();
		expect(second.caches.has("app-docs-deploy-2")).toBe(true);
		expect(second.caches.has("app-docs-deploy-1")).toBe(false);
	});
});

describe("cache bounds", () => {
	test("the documented caps are the ones enforced", () => {
		expect(sw.MAX_ENTRY_BYTES).toBe(2 * 1024 * 1024);
		expect(sw.MAX_CACHE_BYTES).toBe(32 * 1024 * 1024);
		expect(sw.MAX_CACHE_ENTRIES).toBe(200);
		expect(24 * 1024 * 1024).toBeGreaterThan(sw.MAX_ENTRY_BYTES);
	});

	test("an oversized response is fetched but not stored", async () => {
		const h = await loadWorker();
		h.net = async () => withBody("{}", 24 * 1024 * 1024);
		const response = await h.dispatchFetch(req("/spooners/data.json"));
		expect(response).not.toBeNull();
		await h.settle();
		expect(h.netLog).toEqual([`${ORIGIN}/spooners/data.json`]);
		for (const cache of h.caches.values()) {
			expect(cache.entries.size).toBe(0);
		}
	});

	test("an unknown Content-Length is refused rather than uncounted", async () => {
		const h = await loadWorker();
		h.net = async () => new TestResponse("body", { headers: { vary: "*" } });
		await h.dispatchFetch(req("/static/js/index.js"));
		await h.settle();
		for (const cache of h.caches.values()) {
			expect(cache.entries.size).toBe(0);
		}
	});

	test("the oldest entries are evicted once the count budget is exceeded", async () => {
		const h = await loadWorker();
		h.net = async (request) =>
			withBody(`body:${new TestURL(request.url).pathname}`);
		for (let i = 0; i < 230; i += 1) {
			await h.dispatchFetch(req(`/static/js/chunk-${i}.js`));
			await Bun.sleep(0.4);
		}
		await h.settle();
		const cache = h.caches.get(`app-assets-${h.internals.BUILD_ID}`);
		expect(cache).toBeDefined();
		expect(cache?.entries.size).toBeLessThanOrEqual(
			h.internals.MAX_CACHE_ENTRIES,
		);
		expect(cache?.entries.size).toBeGreaterThan(0);
	});
});

describe("navigations", () => {
	test("are served from the network and cached for offline", async () => {
		const h = await loadWorker();
		h.net = async () => withBody("<html>cv</html>");
		const response = await h.dispatchFetch(nav("/cv/"));
		expect(await response?.text()).toBe("<html>cv</html>");
		await h.settle();

		const cache = h.caches.get(`app-docs-${h.internals.BUILD_ID}`);
		expect(cache?.entries.has(`${ORIGIN}/cv/`)).toBe(true);
		const stored = await cache?.match(`${ORIGIN}/cv/`);
		expect(Number(stored?.headers.get("x-sw-size"))).toBe(
			"<html>cv</html>".length,
		);
		expect(Number(stored?.headers.get("x-sw-stored-at"))).toBeGreaterThan(0);
	});

	test("an offline navigation falls back to the app, not the root", async () => {
		const h = await loadWorker();
		h.net = async () => networkDown();
		const docs = `app-docs-${h.internals.BUILD_ID}`;
		seed(h, docs, "/cv/", "<html>cached cv</html>");
		seed(h, docs, "/offline.html", "<html>offline</html>");
		h.dispatchMessage({ type: "SCOPE", base: "/cv/" });
		await h.settle();

		const deep = await h.dispatchFetch(nav("/cv/experience/2026"));
		expect(await deep?.text()).toBe("<html>cached cv</html>");

		const unknown = await h.dispatchFetch(nav("/spooners/"));
		expect(await unknown?.text()).toBe("<html>offline</html>");
	});

	test("an exact cached URL wins over the app shell", async () => {
		const h = await loadWorker();
		h.net = async () => networkDown();
		const docs = `app-docs-${h.internals.BUILD_ID}`;
		seed(h, docs, "/cv/", "<html>app shell</html>");
		seed(h, docs, "/cv/experience/2026", "<html>deep link</html>");
		h.dispatchMessage({ type: "SCOPE", base: "/cv/" });
		const deep = await h.dispatchFetch(nav("/cv/experience/2026"));
		expect(await deep?.text()).toBe("<html>deep link</html>");
	});

	test("install precaches the offline page and skips waiting", async () => {
		const h = await loadWorker();
		h.net = async () => withBody("<html>offline</html>");
		await h.dispatchInstall();
		expect(h.calls).toContain("skipWaiting");
		const cache = h.caches.get(`app-docs-${h.internals.BUILD_ID}`);
		expect(cache?.entries.has(`${ORIGIN}/offline.html`)).toBe(true);
	});
});

describe("sub-resources", () => {
	test("stale-while-revalidate serves cache and refreshes in the background", async () => {
		const h = await loadWorker();
		let calls = 0;
		h.net = async () => {
			calls += 1;
			return withBody(`body-${calls}`);
		};
		const request = req("/static/js/index.js");

		const cold = await h.dispatchFetch(request.clone());
		expect(await cold?.text()).toBe("body-1");
		await h.settle();

		const warm = await h.dispatchFetch(request.clone());
		expect(await warm?.text()).toBe("body-1");
		await h.settle();
		expect(calls).toBe(2);

		const cache = h.caches.get(`app-assets-${h.internals.BUILD_ID}`);
		const refreshed = await cache?.match(request.clone());
		expect(await refreshed?.text()).toBe("body-2");
	});

	test("hashed assets under every app's /static/ are cached", async () => {
		const h = await loadWorker();
		h.net = async (request) =>
			withBody(`css:${new TestURL(request.url).pathname}`);
		const paths = [
			"/static/js/index.js",
			"/cv/static/js/index.js",
			"/birthday/static/css/index.css",
			"/spooners/static/js/index.js",
			"/design/static/css/index.css",
		];
		for (const path of paths) {
			const response = await h.dispatchFetch(req(path));
			expect(response).not.toBeNull();
			await h.settle();
		}
		const cache = h.caches.get(`app-assets-${h.internals.BUILD_ID}`);
		expect(cache?.entries.size).toBe(paths.length);
	});

	test("cross-origin, POST, Range and /sw.js are never intercepted", async () => {
		const h = await loadWorker();
		h.net = async () => withBody("{}");
		expect(
			await h.dispatchFetch(req("/spooners/data.json", { method: "POST" })),
		).toBeNull();
		expect(
			await h.dispatchFetch(
				req("/commons/x.json", {}, "https://commons.wikimedia.org"),
			),
		).toBeNull();
		expect(
			await h.dispatchFetch(
				req("/icons/root-192.png", { headers: { range: "bytes=0-99" } }),
			),
		).toBeNull();
		expect(await h.dispatchFetch(req("/sw.js"))).toBeNull();
		expect(await h.dispatchFetch(req("/sw.js?v=1"))).toBeNull();
		expect(h.netLog).toEqual([]);
		expect(h.caches.size).toBe(0);
	});

	test("a failing revalidation still serves the cached copy", async () => {
		const h = await loadWorker();
		h.net = async () => withBody("fresh");
		await h.dispatchFetch(req("/static/js/index.js"));
		await h.settle();

		h.net = async () => networkDown();
		const offline = await h.dispatchFetch(req("/static/js/index.js"));
		expect(await offline?.text()).toBe("fresh");
		await h.settle();
	});

	test("a cold offline asset request errors instead of hanging", async () => {
		const h = await loadWorker();
		h.net = async () => networkDown();
		const response = await h.dispatchFetch(req("/static/js/index.js"));
		expect(response?.type).toBe("error");
	});
});

describe("messages and notifications", () => {
	test("SKIP_WAITING still triggers skipWaiting()", async () => {
		const h = await loadWorker();
		h.dispatchMessage({ type: "SKIP_WAITING" });
		expect(h.calls).toContain("skipWaiting");
	});

	test("malformed or hostile messages are ignored", async () => {
		const h = await loadWorker();
		for (const data of [
			undefined,
			null,
			"SCOPE",
			42,
			{ type: "NOPE" },
			{ type: "SCOPE", base: "//evil.example/" },
			{ type: "SCOPE", base: "https://evil.example/" },
			{ type: "SCOPE", base: 7 },
		]) {
			h.dispatchMessage(data);
		}
		await h.settle();
		expect(h.calls).toEqual([]);
		await h.dispatchNotificationClick({ data: undefined });
		expect(h.calls).toContain("openWindow:/");
	});

	test("a notification click opens the app that raised it", async () => {
		const h = await loadWorker();
		h.dispatchMessage({ type: "SCOPE", base: "/cv/" });
		h.dispatchMessage({ type: "SCOPE", base: "/birthday/" });
		await h.settle();
		await h.dispatchNotificationClick({ data: undefined });
		expect(h.calls).toContain("close");
		expect(h.calls).toContain("openWindow:/birthday/");
	});

	test("an explicit notification target wins over the remembered scope", async () => {
		const h = await loadWorker();
		h.dispatchMessage({ type: "SCOPE", base: "/birthday/" });
		await h.settle();
		await h.dispatchNotificationClick({ data: { url: "/spooners/" } });
		expect(h.calls).toContain("openWindow:/spooners/");
	});

	test("a hostile notification target cannot leave the origin", async () => {
		const h = await loadWorker();
		for (const url of [
			"https://evil.example/pwn",
			"//evil.example/pwn",
			"javascript:alert(1)",
			42,
		]) {
			h.calls.length = 0;
			await h.dispatchNotificationClick({ data: { url } });
			expect(h.calls).toContain("openWindow:/");
		}
	});

	test("an open window already showing the app is focused, not duplicated", async () => {
		const h = await loadWorker();
		h.dispatchMessage({ type: "SCOPE", base: "/birthday/" });
		await h.settle();
		let focused = 0;
		h.clients.push(
			{
				url: `${ORIGIN}/`,
				focused: false,
				focus: async () => {
					focused += 1;
				},
			},
			{
				url: `${ORIGIN}/birthday/`,
				focused: false,
				focus: async () => {
					focused += 1;
				},
			},
		);
		await h.dispatchNotificationClick({ data: undefined });
		expect(focused).toBe(1);
		expect(h.calls).not.toContain("openWindow:/birthday/");
	});

	test("a focused window wins when no window matches the app", async () => {
		const h = await loadWorker();
		h.dispatchMessage({ type: "SCOPE", base: "/birthday/" });
		await h.settle();
		const focusedUrls: string[] = [];
		h.clients.push(
			{
				url: `${ORIGIN}/cv/`,
				focused: false,
				focus: async () => {
					focusedUrls.push(`${ORIGIN}/cv/`);
				},
			},
			{
				url: `${ORIGIN}/design/`,
				focused: true,
				focus: async () => {
					focusedUrls.push(`${ORIGIN}/design/`);
				},
			},
		);
		await h.dispatchNotificationClick({ data: undefined });
		expect(focusedUrls).toEqual([`${ORIGIN}/design/`]);
	});

	test("a navigation also teaches the worker which apps exist", async () => {
		const h = await loadWorker();
		h.net = async () => withBody("<html>spooners</html>");
		await h.dispatchFetch(nav("/spooners/"));
		await h.settle();
		expect(h.calls).toEqual([]);
		await h.dispatchNotificationClick({ data: undefined });
		expect(h.calls).toContain("openWindow:/");
	});
});
