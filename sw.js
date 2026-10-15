const BUILD_ID_PLACEHOLDER = "__BUILD_ID__";
const UNSUBSTITUTED = "__BUILD_ID__";
const MANUAL_VERSION = "2";

const SW_SCRIPT_PATH = "/sw.js";
const OFFLINE_URL = "/offline.html";

const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 200;
const MAX_KNOWN_BASES = 12;

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
const STATE_URL = "/__sw_state__";

const STRATEGY = {
	BYPASS: "bypass",
	NETWORK_FIRST: "network-first",
	STALE_WHILE_REVALIDATE: "stale-while-revalidate",
};

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

const decideStrategy = (request, url, sameOrigin) => {
	if (request.method !== "GET") return STRATEGY.BYPASS;
	if (!sameOrigin) return STRATEGY.BYPASS;
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		return STRATEGY.BYPASS;
	}
	if (hasHeader(request.headers, "range")) return STRATEGY.BYPASS;
	if (url.pathname === SW_SCRIPT_PATH) return STRATEGY.BYPASS;
	if (request.mode === "navigate") return STRATEGY.NETWORK_FIRST;
	return STRATEGY.STALE_WHILE_REVALIDATE;
};

const normalizeBase = (value) => {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
	if (/[\s"'\\]/.test(trimmed)) return null;
	const [path] = trimmed.split(/[?#]/);
	if (!path) return null;
	return path.endsWith("/") ? path : `${path}/`;
};

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

const trimCache = (cacheName) =>
	caches
		.open(cacheName)
		.then(async (cache) => {
			const requests = await cache.keys();
			const responses = await Promise.all(
				requests.map((request) => cache.match(request)),
			);
			const entries = requests.map((request, index) => {
				const response = responses[index];
				return {
					request,
					size: Number(response?.headers.get("x-sw-size")) || 0,
					at: Number(response?.headers.get("x-sw-stored-at")) || 0,
				};
			});
			let total = entries.reduce((sum, entry) => sum + entry.size, 0);
			entries.sort((a, b) => a.at - b.at);
			let kept = entries.length;
			const evicted = [];
			for (const entry of entries) {
				if (kept <= MAX_CACHE_ENTRIES && total <= MAX_CACHE_BYTES) break;
				evicted.push(entry.request);
				total -= entry.size;
				kept -= 1;
			}
			await Promise.all(evicted.map((request) => cache.delete(request)));
		})
		.catch(() => undefined);

let trimQueue = Promise.resolve();
const scheduleTrim = (cacheName) => {
	trimQueue = trimQueue.then(() => trimCache(cacheName)).catch(() => undefined);
	return trimQueue;
};

const fetchAndStore = (cacheName, request) =>
	fetch(request)
		.then(async (response) => {
			const size = await storeResponse(cacheName, request, response);
			if (size > 0) await scheduleTrim(cacheName);
			return response;
		})
		.catch(() => null);

const liveBases = new Map();

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
	const state = await loadState();
	const stored = Array.isArray(state?.bases) ? state.bases : [];
	if (stored.length === 0) return "/";
	return normalizeBase(pickFrom(stored) || "/") || "/";
};

const handleNavigation = (event) => {
	const { request } = event;
	const url = new URL(request.url);
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
	const revalidate = fetchAndStore(ASSET_CACHE, request);
	event.waitUntil(revalidate);
	return caches
		.open(ASSET_CACHE)
		.then((cache) => cache.match(request))
		.then((cached) => cached ?? revalidate)
		.then((response) => response ?? Response.error());
};

self.addEventListener("install", (event) => {
	self.skipWaiting();
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
			self.clients.claim(),
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
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	event.waitUntil(
		notificationTarget(event.notification).then((target) =>
			clients
				.matchAll({ type: "window", includeUncontrolled: true })
				.then((clientList) => {
					if (clientList.length === 0) return clients.openWindow(target);
					const matching = clientList.find((client) =>
						(new URL(client.url).pathname || "/").startsWith(target),
					);
					const focused = clientList.find((client) => client.focused);
					return (matching ?? focused ?? clientList[0]).focus();
				}),
		),
	);
});

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
