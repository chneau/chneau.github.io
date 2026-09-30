// Site-wide service worker (served at /sw.js, default scope /).
//
// Offline strategy:
// - Navigations: network-first. A successful same-origin document is cached so a
//   previously visited page can still boot offline. When the network fails and
//   there is no cached copy of that exact URL, we serve `offline.html` — never a
//   generic cached app shell.
// - Build assets: cache-first. Rsbuild emits immutable, content-hashed files
//   under `/static/`, so they are safe to serve from cache and let the cached
//   document boot offline.
//
// Bump CACHE_VERSION whenever this file or `offline.html` changes content, so
// the old caches are discarded on activation.
const CACHE_VERSION = "v4";
const SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `asset-cache-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

/** Content-hashed build output lives under `/static/` for every app. */
const isImmutableAsset = (url) => url.pathname.includes("/static/");

/** Persist a same-origin response only when it is a real, complete document. */
const cacheResponse = (cacheName, request, response) => {
	if (!response.ok || response.type !== "basic") return;
	// Clone synchronously: the page starts consuming `response`'s body as soon
	// as we return it, so cloning inside the async `caches.open` callback would
	// throw (and silently cache nothing).
	const copy = response.clone();
	caches
		.open(cacheName)
		.then((cache) => cache.put(request, copy))
		.catch(() => {
			// Caching is best-effort; a failed write must not break the response.
		});
};

self.addEventListener("install", (event) => {
	self.skipWaiting(); // Activate worker immediately
	event.waitUntil(
		caches.open(SHELL_CACHE).then((cache) => cache.add(OFFLINE_URL)),
	);
});

self.addEventListener("activate", (event) => {
	const keep = [SHELL_CACHE, ASSET_CACHE];
	event.waitUntil(
		Promise.all([
			self.clients.claim(), // Take control of all clients immediately
			caches.keys().then((cacheNames) =>
				Promise.all(
					cacheNames.map((cacheName) =>
						keep.includes(cacheName) ? null : caches.delete(cacheName),
					),
				),
			),
		]),
	);
});

self.addEventListener("fetch", (event) => {
	const { request } = event;

	// Never interfere with non-GET or cross-origin traffic (analytics, tiles…).
	if (request.method !== "GET") return;
	if (new URL(request.url).origin !== self.location.origin) return;

	// Network-first for HTML documents, falling back to the offline page.
	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request)
				.then((response) => {
					cacheResponse(SHELL_CACHE, request, response);
					return response;
				})
				.catch(async () => {
					// Only an exact cached copy is served; otherwise show offline.html.
					const cached = await caches.match(request);
					if (cached) return cached;
					return (await caches.match(OFFLINE_URL)) || Response.error();
				}),
		);
		return;
	}

	// Cache-first for immutable build assets (content-hashed JS/CSS/fonts/media).
	if (isImmutableAsset(new URL(request.url))) {
		event.respondWith(
			caches.match(request).then((cached) => {
				if (cached) return cached;
				return fetch(request).then((response) => {
					cacheResponse(ASSET_CACHE, request, response);
					return response;
				});
			}),
		);
	}
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	event.waitUntil(
		clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((clientList) => {
				if (clientList.length > 0) {
					let client = clientList[0];
					for (let i = 0; i < clientList.length; i++) {
						if (clientList[i].focused) {
							client = clientList[i];
						}
					}
					return client.focus();
				}
				return clients.openWindow("/");
			}),
	);
});
