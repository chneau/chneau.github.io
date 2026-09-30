// Site-wide service worker (served at /sw.js, default scope /).
//
// One worker controls every app on this origin: /, /cv/, /birthday/,
// /scotland-rail/, /crimson-desert-save-editor/, /spooners/ and /design/.
//
// CACHE STRATEGY (decided per request by `decideStrategy`):
// - navigations ............... network-first. A successful same-origin
//   document is cached so the app can boot offline. On a network failure we
//   serve, in order: the exact cached URL, the cached document of the app the
//   user was in (per-app fallback, not the root dashboard), then /offline.html.
// - same-origin GET assets ..... stale-while-revalidate. The cached copy is
//   returned immediately and a background request refreshes (and `cache.put`s)
//   the entry, so unhashed assets such as /spooners/data.json can never be
//   pinned across deploys.
// - anything else .............. untouched: non-GET (never replay a POST),
//   cross-origin (Wikimedia, wttr.in, PostHog — opaque responses would poison
//   the cache), `Range` requests (a 206 must never be stored) and the worker
//   script itself.
//
// BOUNDS: every cache is capped in both entry count and total bytes, and any
// single response larger than MAX_ENTRY_BYTES is never stored at all — that is
// what keeps /spooners/data.json (~24 MB) out of the cache.
//
// ⚠️ CACHE VERSION — DO NOT IGNORE
// `BUILD_ID` namespaces every cache name, so a new value evicts the previous
// deploy's caches on `activate`. It resolves in this order:
//   1. the `?v=` query string on this script's own URL, which
//      src/shared/service-worker.ts appends from the build-injected BUILD_DATE
//      (works today, no build config required);
//   2. `BUILD_ID_PLACEHOLDER` below, substituted at build time (preferred —
//      see the recommended change in rsbuild.config.ts);
//   3. `MANUAL_VERSION`.
// Until (2) is wired up you MUST keep bumping `MANUAL_VERSION` by hand on any
// deploy that changes sw.js or offline.html. Never publish this file unchanged
// and expect a stale deploy to be evicted.

const BUILD_ID_PLACEHOLDER = "__BUILD_ID__"; // substituted at build time
const UNSUBSTITUTED = "__BUILD_ID__"; // the literal text rsbuild would replace
/**
 * Bumped 1 -> 2 when `public/offline.html` was rewritten (it gained a theme
 * switch, a connectivity status and real recovery links). Without this the
 * cached copy of the old offline page would be served to anyone who had
 * already visited, because the worker's own file did not change.
 */
const MANUAL_VERSION = "2"; // fallback: bump by hand if the build cannot inject

/** Keep this in sync with the registration URL in src/shared/service-worker.ts. */
const SW_SCRIPT_PATH = "/sw.js";
const OFFLINE_URL = "/offline.html";

/** Hard ceiling on what a single cached response may weigh. */
const MAX_ENTRY_BYTES = 2 * 1024 * 1024; // 2 MB — /spooners/data.json is ~24 MB
/** Total budget for the asset cache before the oldest entries are evicted. */
const MAX_CACHE_BYTES = 32 * 1024 * 1024; // 32 MB
/** Entry-count ceiling, applied alongside the byte budget. */
const MAX_CACHE_ENTRIES = 200;
/** Only this many app bases are remembered for the per-app fallbacks. */
const MAX_KNOWN_BASES = 12;

/** Cache names are namespaced by build id, so every deploy starts empty. */
const sanitizeCacheKey = (value) =>
	String(value).replace(/[^a-zA-Z0-9._-]/g, "") || "0";

const resolveBuildId = (scriptHref) => {
	const fromQuery = new URL(scriptHref).searchParams.get("v");
	if (fromQuery) return sanitizeCacheKey(fromQuery);
	if (BUILD_ID_PLACEHOLDER === UNSUBSTITUTED) return MANUAL_VERSION;
	return sanitizeCacheKey(BUILD_ID_PLACEHOLDER);
};

const BUILD_ID = resolveBuildId(self.location.href);
const DOC_CACHE = `app-docs-${BUILD_ID}`;
const ASSET_CACHE = `app-assets-${BUILD_ID}`;
const STATE_CACHE = `sw-state-${BUILD_ID}`;
/** Synthetic URL used to persist the tiny "which apps exist" record. */
const STATE_URL = "/__sw_state__";

const STRATEGY = {
	/** Do not call respondWith at all. */
	BYPASS: "bypass",
	/** Network, falling back to a cached document. */
	NETWORK_FIRST: "network-first",
	/** Cached copy now, refresh in the background. */
	STALE_WHILE_REVALIDATE: "stale-while-revalidate",
};

/**
 * Header lookup that works with a real `Headers`, a Map or a plain object so
 * the decision function can be unit-tested with request doubles. Plain-object
 * keys are matched case-insensitively, like `Headers` does.
 */
const hasHeader = (headers, name) => {
	if (!headers) return false;
	if (typeof headers.has === "function") return headers.has(name);
	if (typeof headers.get === "function") return headers.get(name) != null;
	const wanted = name.toLowerCase();
	for (const key of Object.keys(headers)) {
		if (key.toLowerCase() === wanted) return true;
	}
	return false;
};

/**
 * Pure routing decision for one fetch event. Returns a STRATEGY value; only
 * the non-BYPASS strategies may be passed to `respondWith`.
 */
const decideStrategy = (request, url, sameOrigin) => {
	// Never replay a write from cache.
	if (request.method !== "GET") return STRATEGY.BYPASS;
	// Cross-origin traffic (tiles, APIs, analytics) is left entirely alone.
	if (!sameOrigin) return STRATEGY.BYPASS;
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		return STRATEGY.BYPASS;
	}
	// A partial response cannot be cached, and storing a 206 would corrupt
	// later full reads — let it hit the network every time.
	if (hasHeader(request.headers, "range")) return STRATEGY.BYPASS;
	// The worker script itself must never be served from a cache.
	if (url.pathname === SW_SCRIPT_PATH) return STRATEGY.BYPASS;
	if (request.mode === "navigate") return STRATEGY.NETWORK_FIRST;
	return STRATEGY.STALE_WHILE_REVALIDATE;
};

/**
 * Normalise a client-supplied app base to a same-origin path with a trailing
 * slash. Anything that is not a plain path (absolute URL, protocol-relative
 * host, `javascript:`) is rejected, so a hostile or buggy client cannot make
 * the worker open a window on another origin.
 */
const normalizeBase = (value) => {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
	if (/[\s"'\\]/.test(trimmed)) return null;
	const [path] = trimmed.split(/[?#]/);
	if (!path) return null;
	return path.endsWith("/") ? path : `${path}/`;
};

/** `/cv/anything/deep` -> the longest known base it lives under. */
const appBaseFor = (pathname, bases) => {
	let best = "/";
	for (const base of bases) {
		if (base === "/" || !pathname.startsWith(base)) continue;
		if (base.length > best.length) best = base;
	}
	return best;
};

const joinBase = (base, path) =>
	new URL(path, new URL(base, self.location.href)).href;

// ---------------------------------------------------------------------------
// Cached-response bookkeeping
// ---------------------------------------------------------------------------

/**
 * The size a response will occupy in the cache, or null when it must not be
 * stored at all: a non-200, an opaque/opaqueredirect (cross-origin) reply, a
 * `Vary: *` response, or one whose size is unknown. Refusing unknown sizes is
 * what stops the byte budget below from being silently bypassed.
 */
const storableSize = (response) => {
	if (!response?.ok) return null;
	if (response.type === "opaque" || response.type === "opaqueredirect") {
		return null;
	}
	if (response.status !== 200) return null;
	const vary = response.headers.get("vary") || "";
	if (vary.split(",").some((part) => part.trim() === "*")) return null;
	const declared = Number(response.headers.get("content-length"));
	if (!Number.isFinite(declared) || declared < 0) return null;
	return declared;
};

/**
 * Store a copy of `response` under `cacheName` and return the bytes written
 * (0 when skipped). The clone is taken synchronously: the caller hands the
 * original to the page immediately, so cloning later would throw and cache
 * nothing.
 */
const storeResponse = (cacheName, request, response) => {
	const size = storableSize(response);
	if (size === null || size > MAX_ENTRY_BYTES) return Promise.resolve(0);
	const copy = response.clone();
	return caches
		.open(cacheName)
		.then((cache) =>
			copy
				.arrayBuffer()
				.then((body) => {
					const headers = new Headers(response.headers);
					headers.set("x-sw-size", String(size));
					headers.set("x-sw-stored-at", String(Date.now()));
					return cache.put(
						request,
						new Response(body, {
							status: response.status,
							statusText: response.statusText,
							headers,
						}),
					);
				})
				.then(() => size),
		)
		.catch(() => 0);
};

/**
 * Enforce the entry-count and byte budgets by evicting oldest-first, using the
 * `x-sw-stored-at` header we stamp on write.
 */
const trimCache = (cacheName) =>
	caches
		.open(cacheName)
		.then(async (cache) => {
			const entries = [];
			for (const request of await cache.keys()) {
				const response = await cache.match(request);
				entries.push({
					request,
					size: Number(response?.headers.get("x-sw-size")) || 0,
					at: Number(response?.headers.get("x-sw-stored-at")) || 0,
				});
			}
			let total = entries.reduce((sum, entry) => sum + entry.size, 0);
			entries.sort((a, b) => a.at - b.at);
			let kept = entries.length;
			for (const entry of entries) {
				if (kept <= MAX_CACHE_ENTRIES && total <= MAX_CACHE_BYTES) break;
				await cache.delete(entry.request);
				total -= entry.size;
				kept -= 1;
			}
		})
		.catch(() => undefined);

/** Serialise trims so a burst of puts only walks the cache once. */
let trimQueue = Promise.resolve();
const scheduleTrim = (cacheName) => {
	trimQueue = trimQueue.then(() => trimCache(cacheName)).catch(() => undefined);
	return trimQueue;
};

/** Fetch, best-effort cache, and hand the response back to the caller. */
const fetchAndStore = (cacheName, request) =>
	fetch(request)
		.then(async (response) => {
			const size = await storeResponse(cacheName, request, response);
			if (size > 0) await scheduleTrim(cacheName);
			return response;
		})
		.catch(() => null);

// ---------------------------------------------------------------------------
// Per-app state (which apps exist, and which was used last)
// ---------------------------------------------------------------------------

/** In-memory mirror of the persisted record; survives nothing but a restart. */
const liveBases = new Map(); // base -> recency counter

/**
 * Ordering token for "which app was used last". A monotonic counter rather
 * than `Date.now()`: two apps touched in the same millisecond would otherwise
 * sort unpredictably and pick the wrong notification target.
 */
let recency = 0;
const nextRecency = () => {
	recency += 1;
	return recency;
};

const loadState = () =>
	caches
		.open(STATE_CACHE)
		.then((cache) => cache.match(STATE_URL))
		.then((response) => (response ? response.json() : null))
		.catch(() => null);

let stateQueue = Promise.resolve();
const saveState = () => {
	stateQueue = stateQueue
		.then(async () => {
			const bases = [...liveBases.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, MAX_KNOWN_BASES);
			const cache = await caches.open(STATE_CACHE);
			await cache.put(
				STATE_URL,
				new Response(JSON.stringify({ bases }), {
					headers: {
						"content-type": "application/json",
						"x-sw-stored-at": String(Date.now()),
					},
				}),
			);
			await trimCache(STATE_CACHE);
		})
		.catch(() => undefined);
	return stateQueue;
};

const rememberBase = (base) => {
	if (!base) return;
	liveBases.set(base, nextRecency());
	if (liveBases.size > MAX_KNOWN_BASES) {
		const oldest = [...liveBases.entries()].sort((a, b) => a[1] - b[1])[0];
		if (oldest) liveBases.delete(oldest[0]);
	}
	saveState();
};

const knownBases = () => new Set(["/", ...liveBases.keys()]);

/**
 * Where a notification click should land. A producer-supplied `data.url` wins;
 * otherwise the most recently used sub-app — the hub is only the last resort,
 * never the preferred answer, because it would drop the user out of the app
 * that raised the notification.
 */
const notificationTarget = async (notification) => {
	const data = notification?.data;
	if (data && typeof data === "object") {
		const fromNotification =
			normalizeBase(data.url) ?? normalizeBase(data.base);
		if (fromNotification) return fromNotification;
	}
	const pickFrom = (entries) => {
		const bases = [...entries]
			.sort((a, b) => b[1] - a[1])
			.map(([base]) => base);
		return bases.find((base) => base !== "/") ?? bases[0] ?? null;
	};
	const fromMemory = pickFrom(liveBases.entries());
	if (fromMemory) return fromMemory;
	// The worker may have been terminated since the app announced itself.
	const state = await loadState();
	const stored = Array.isArray(state?.bases) ? state.bases : [];
	if (stored.length === 0) return "/";
	return normalizeBase(pickFrom(stored) || "/") || "/";
};

// ---------------------------------------------------------------------------
// Fetch strategies
// ---------------------------------------------------------------------------

const handleNavigation = (event) => {
	const { request } = event;
	const url = new URL(request.url);
	// Navigations also teach the worker which apps exist, which is what makes
	// the offline and notification fallbacks per-app.
	rememberBase(appBaseFor(url.pathname, knownBases()));

	return fetch(request)
		.then((response) => {
			storeResponse(DOC_CACHE, request, response).then((stored) => {
				if (stored > 0) scheduleTrim(DOC_CACHE);
			});
			return response;
		})
		.catch(async () => {
			const cache = await caches.open(DOC_CACHE);
			const base = appBaseFor(url.pathname, knownBases());
			// 1. the exact URL, 2. the app shell of the app we were in,
			// 3. its index.html, 4. the site-wide offline page.
			for (const candidate of [
				request.url,
				joinBase(base, base),
				joinBase(base, "index.html"),
				OFFLINE_URL,
			]) {
				const cached = await cache.match(candidate);
				if (cached) return cached;
			}
			return Response.error();
		});
};

const handleAsset = (event) => {
	const { request } = event;
	// Start (and own) the refresh before the first await so `waitUntil` is
	// still legal, then answer from cache when we have a copy.
	const revalidate = fetchAndStore(ASSET_CACHE, request);
	event.waitUntil(revalidate);
	return caches
		.open(ASSET_CACHE)
		.then((cache) => cache.match(request))
		.then((cached) => cached ?? revalidate)
		.then((response) => response ?? Response.error());
};

self.addEventListener("install", (event) => {
	self.skipWaiting(); // Activate worker immediately
	// Precache the offline page through the normal capped write path.
	event.waitUntil(
		caches
			.open(DOC_CACHE)
			.then((cache) => cache.add(OFFLINE_URL))
			.then(() => scheduleTrim(DOC_CACHE))
			.catch(() => undefined),
	);
});

self.addEventListener("activate", (event) => {
	const keep = [DOC_CACHE, ASSET_CACHE];
	event.waitUntil(
		Promise.all([
			self.clients.claim(), // Take control of all clients immediately
			caches
				.keys()
				.then((cacheNames) =>
					Promise.all(
						cacheNames.map((cacheName) =>
							keep.includes(cacheName) ? null : caches.delete(cacheName),
						),
					),
				),
		]),
	);
});

self.addEventListener("message", (event) => {
	const data = event.data;
	if (!data || typeof data !== "object") return;
	if (data.type === "SKIP_WAITING") {
		self.skipWaiting();
		return;
	}
	// The client tells us which app it is, so the navigation and notification
	// fallbacks can stay inside that app instead of dropping out to "/".
	if (data.type === "SCOPE") {
		const base = normalizeBase(data.base);
		if (base) rememberBase(base);
	}
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	const url = new URL(request.url);
	const strategy = decideStrategy(
		request,
		url,
		url.origin === self.location.origin,
	);

	if (strategy === STRATEGY.NETWORK_FIRST) {
		event.respondWith(handleNavigation(event));
		return;
	}
	if (strategy === STRATEGY.STALE_WHILE_REVALIDATE) {
		event.respondWith(handleAsset(event));
	}
	// STRATEGY.BYPASS: no respondWith, the browser handles the request.
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	event.waitUntil(
		notificationTarget(event.notification).then((target) =>
			clients
				.matchAll({ type: "window", includeUncontrolled: true })
				.then((clientList) => {
					if (clientList.length === 0) return clients.openWindow(target);
					// Prefer a window already showing the app, then the focused one.
					const matching = clientList.find((client) =>
						(new URL(client.url).pathname || "/").startsWith(target),
					);
					const focused = clientList.find((client) => client.focused);
					return (matching ?? focused ?? clientList[0]).focus();
				}),
		),
	);
});

// Read by src/shared/tests/sw.test.ts: this is a classic (module-less) worker,
// so the pure helpers are handed to the test harness instead of exported.
self.__swInternals = {
	STRATEGY,
	MAX_CACHE_BYTES,
	MAX_CACHE_ENTRIES,
	MAX_ENTRY_BYTES,
	BUILD_ID,
	appBaseFor,
	decideStrategy,
	normalizeBase,
	resolveBuildId,
	sanitizeCacheKey,
};
