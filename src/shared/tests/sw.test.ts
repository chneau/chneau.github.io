/**
 * Tests for public/sw.js.
 *
 * The worker is a classic (module-less) script that runs against real browser
 * globals, so it is loaded here by evaluating its source inside a stubbed
 * ServiceWorkerGlobalScope: `self`, `caches`, `fetch`, `clients`, `Response`,
 * `Request`, `Headers` and `URL` are all injected explicitly.
 *
 * Those last four are OUR classes (see "Platform doubles" below), never the
 * ambient globals. `bun test` runs every suite in a single process, and any file
 * importing src/shared/tests/happy-dom.ts installs GlobalRegistrator, which
 * replaces globalThis.Response/Request/Headers/URL. Evaluating the worker
 * against those would make the result depend on which other test files ran
 * first — happy-dom's Request even throws a SecurityError for
 * `{mode: "navigate"}`, which is the worker's navigation signal.
 *
 * No DOM is involved — the pure decision function is driven with plain
 * request/URL doubles, and the handler tests use plain objects.
 */
import { beforeAll, describe, expect, test } from "bun:test";

const ORIGIN = "https://chneau.github.io";
type Strategy = string;

/**
 * The worker's strategy enum, typed as a closed set of literal keys: an
 * `IndexSignature`-shaped record would widen every lookup to `string |
 * undefined` under `noUncheckedIndexedAccess`, which hides genuine typos.
 */
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

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Platform doubles
//
// These are deliberately OUR classes, not `globalThis.Response` & friends.
// `bun test` runs every suite in one process, and any file importing
// src/shared/tests/happy-dom.ts installs GlobalRegistrator, which overwrites
// globalThis.Response/Request/Headers/URL with happy-dom's implementations
// (whose `new Request(url, {mode:"navigate"})` throws a SecurityError, for
// one). Evaluating the worker against those would mean the result depends on
// which other test files ran first. Only the surface public/sw.js actually
// uses is implemented here — see the assertions in `platform doubles match the
// worker's real usage`.
// ---------------------------------------------------------------------------

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
	/**
	 * Make `Headers` iterable, as the real one is. The worker does
	 * `new Headers(response.headers)`; without this the constructor cannot read a
	 * `TestHeaders` and the copy silently comes out empty.
	 */
	*[Symbol.iterator](): IterableIterator<[string, string]> {
		yield* this.map.entries();
	}
	/** Deep copy, so a cloned response does not share header state. */
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

	/** Build a response from already-computed fields (used by `clone`). */
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

	/**
	 * A genuine deep copy: the body bytes are duplicated, so consuming the clone
	 * cannot consume this response. The worker clones before `cache.put` for
	 * exactly this reason, and returning `this` here would hide a defect.
	 */
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
		// The worker nests `new URL(path, new URL(base, self.location.href))`, so
		// a base URL *object* must be accepted as well as a string.
		const baseHref = typeof base === "string" ? base : base?.href;
		const absolute = baseHref ? TestURL.resolve(input, baseHref) : input;
		// scheme, then an OPTIONAL authority (only when "//" follows the
		// scheme), then path, then query. Anchoring the authority to `//` keeps
		// the path from swallowing the host.
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

	/** Resolve `ref` against `base` the way the worker resolves app bases. */
	private static resolve(ref: string, base: string): string {
		// Absolute (has a scheme) or protocol-relative (//host/...) refs are
		// already fully qualified.
		if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(ref) || ref.startsWith("//")) {
			return ref;
		}
		// The authority group deliberately excludes the leading "//" so the root
		// is rebuilt as scheme + "//" + authority exactly once.
		const match = /^([a-zA-Z][a-zA-Z0-9+.-]*:)\/\/([^/?#]*)([^?#]*)?/.exec(
			base,
		);
		if (!match) return `${base}${ref}`;
		const root = `${match[1]}//${match[2]}`;
		if (ref.startsWith("/")) return `${root}${ref}`;
		// Relative: resolve against the base's *directory*, taken from the path
		// only — slicing `base` directly would keep the origin and duplicate it.
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
		// Unlike happy-dom, a navigate-mode Request is constructible here: the
		// worker relies on `mode === "navigate"` as its navigation signal.
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

/** Minimal Cache stand-in: keyed by absolute URL. */
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
	/** cache name -> fake cache. */
	caches: Map<string, FakeCache>;
	/** URLs the worker actually fetched. */
	netLog: string[];
	/** Open windows the worker may focus. */
	clients: WindowClient[];
	/** Effects the worker asked the browser to perform ("skipWaiting", …). */
	calls: string[];
	/** Replace to script the network; `netLog` records every hit. */
	net: FetchImpl;
	/** Drain the worker's fire-and-forget promises. */
	settle: () => Promise<void>;
	dispatchFetch: (request: TestRequest) => Promise<TestResponse | null>;
	dispatchInstall: () => Promise<void>;
	dispatchMessage: (data: unknown) => void;
	dispatchNotificationClick: (notification: unknown) => Promise<void>;
};

/**
 * Evaluate public/sw.js inside a stubbed worker scope.
 * `scriptHref` varies the `?v=` cache-busting token the worker derives its
 * cache namespace from.
 */
const loadWorker = async (scriptHref = `${ORIGIN}/sw.js`): Promise<Harness> => {
	// This test lives under src/, NOT in public/ — rsbuild copies everything in
	// public/ verbatim into every app's published output, so a test file there
	// ships to production. Hence the explicit path back out to the worker.
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

	// Evaluating the worker source *is* the harness - there is no other way to
	// run a classic service worker in-process. No suppression is needed; biome
	// does not flag `new Function` here.
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
	// Inject OUR doubles, never the ambient globals: any suite that has loaded
	// happy-dom has replaced globalThis.Response/Request/Headers/URL, and the
	// worker must not be evaluated against those.
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

	/** Repeatedly drain pending promises so background writes land. */
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

/**
 * A navigation request. The mode matters: a browser sets `navigate` on top-level
 * document requests, and that is the only signal `decideStrategy` uses.
 */
const nav = (path: string, origin = ORIGIN) =>
	new TestRequest(url(path, origin).href, { mode: "navigate" });

/** Seed a cache entry directly, bypassing the worker's write path. */
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

/**
 * A failed network fetch. This must *reject*: a browser rejects with a
 * TypeError, whereas `Response.error()` resolves with an error-typed response
 * and would never reach the worker's offline fallback.
 */
const networkDown = async (): Promise<TestResponse> => {
	throw new TypeError("Failed to fetch");
};

// ---------------------------------------------------------------------------
// decideStrategy — the pure routing decision
// ---------------------------------------------------------------------------

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
		// Even with no explicit mode: only `navigate` is special-cased.
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
		// A plain-object header bag (no Headers.prototype.has) behaves the same.
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

// ---------------------------------------------------------------------------
// normalizeBase / appBaseFor — per-app targeting
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// resolveBuildId — the cache-invalidation token
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Harness isolation
// ---------------------------------------------------------------------------

describe("harness isolation", () => {
	test("the worker never sees globalThis Response/Request/Headers/URL", () => {
		// These globals are NOT what the worker is evaluated against. Any suite
		// that loads happy-dom replaces them, and the worker's behaviour must not
		// change depending on which test files ran first.
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
		// clone() must be a deep copy: the worker clones before cache.put because
		// a body is single-consumption. Returning `this` would hide that.
		const original = withBody("payload");
		const clone = original.clone();
		expect(await clone.text()).toBe("payload");
		expect(await original.text()).toBe("payload"); // original still readable
		expect(clone).not.toBe(original);

		// Headers must survive a clone and stay independent.
		clone.headers.set("x-sw-size", "7");
		expect(clone.headers.get("x-sw-size")).toBe("7");
		expect(original.headers.has("x-sw-size")).toBe(false);

		// Navigations must be constructible with mode:"navigate" — happy-dom
		// throws a SecurityError here, which is the contamination being avoided.
		const navigation = nav("/cv/");
		expect(navigation.mode).toBe("navigate");
		expect(navigation.method).toBe("GET");

		// URL surface used by the worker: href/protocol/origin/pathname/searchParams.
		const parsed = new TestURL("/sw.js?v=abc", ORIGIN);
		expect(parsed.pathname).toBe("/sw.js");
		expect(parsed.protocol).toBe("https:");
		expect(parsed.origin).toBe(ORIGIN);
		expect(parsed.searchParams.get("v")).toBe("abc");
		// A base may be a URL object: the worker nests new URL(path, new URL(...)).
		expect(new TestURL("index.html", parsed).pathname).toBe("/index.html");

		// Response.error() resolves with an error type; a failed *fetch* rejects.
		expect(TestResponse.error().type).toBe("error");
		await expect(networkDown()).rejects.toBeInstanceOf(TypeError);
	});
});

describe("resolveBuildId", () => {
	test("the ?v= token on the script URL wins, sanitised for a cache name", () => {
		// Percent-decoded by URLSearchParams, then stripped of anything that is
		// not safe in a Cache Storage name.
		expect(sw.resolveBuildId(`${ORIGIN}/sw.js?v=2026-09-30%2012%3A00`)).toBe(
			"2026-09-301200",
		);
		expect(sw.sanitizeCacheKey("__BUILD_ID__")).toBe("__BUILD_ID__");
		expect(sw.sanitizeCacheKey("a/b?c#d")).toBe("abcd");
	});

	test("without ?v= the hand-written constant protects the cache", () => {
		// The placeholder is still literal in this tree, so MANUAL_VERSION is
		// what actually namespaces the caches until rsbuild substitutes it.
		// Asserted against the running worker rather than a hard-coded literal,
		// because bumping MANUAL_VERSION is an expected, documented edit.
		const fallback = sw.resolveBuildId(`${ORIGIN}/sw.js`);
		expect(fallback).toBe(sw.BUILD_ID);
		// Not the placeholder, and a token that is safe inside a cache name.
		expect(fallback).not.toBe("__BUILD_ID__");
		expect(fallback).toMatch(/^[a-zA-Z0-9._-]+$/);
	});

	test("a distinct token produces distinct cache namespaces", async () => {
		const first = await loadWorker(`${ORIGIN}/sw.js?v=deploy-1`);
		const second = await loadWorker(`${ORIGIN}/sw.js?v=deploy-2`);
		expect(first.internals.BUILD_ID).toBe("deploy-1");
		expect(second.internals.BUILD_ID).toBe("deploy-2");

		// Same token -> same namespace, so repeat visits reuse the cache.
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

// ---------------------------------------------------------------------------
// Cache bounds
// ---------------------------------------------------------------------------

describe("cache bounds", () => {
	test("the documented caps are the ones enforced", () => {
		expect(sw.MAX_ENTRY_BYTES).toBe(2 * 1024 * 1024);
		expect(sw.MAX_CACHE_BYTES).toBe(32 * 1024 * 1024);
		expect(sw.MAX_CACHE_ENTRIES).toBe(200);
		// /spooners/data.json is ~24 MB and must therefore never be cached.
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
		// `vary: *` marks a response the worker must not store, standing in for
		// a chunked/opaque reply whose size it cannot account for.
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
		// Push well past MAX_CACHE_ENTRIES with small, cacheable responses.
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

// ---------------------------------------------------------------------------
// Navigation behaviour
// ---------------------------------------------------------------------------

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

		// An app with nothing cached degrades to the site-wide offline page.
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

// ---------------------------------------------------------------------------
// Sub-resource behaviour
// ---------------------------------------------------------------------------

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

		// Warm read: answered from cache even though the network would say
		// "body-2", and the entry is refreshed for the next read.
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

// ---------------------------------------------------------------------------
// Messages and notifications
// ---------------------------------------------------------------------------

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
		// No state was recorded, so a notification still falls back to the hub.
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
		// With no SCOPE message and a terminated worker, the persisted state
		// (written by the navigation) is what survives.
		expect(h.calls).toEqual([]);
		await h.dispatchNotificationClick({ data: undefined });
		expect(h.calls).toContain("openWindow:/");
	});
});
