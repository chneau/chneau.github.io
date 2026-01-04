const CACHE_NAME = "birthday-tracker-v2";

self.addEventListener("install", (event) => {
	self.skipWaiting(); // Activate worker immediately
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.addAll(["/", "/index.html"]);
		}),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		Promise.all([
			self.clients.claim(), // Take control of all clients immediately
			caches.keys().then((cacheNames) => {
				return Promise.all(
					cacheNames.map((cacheName) => {
						if (cacheName !== CACHE_NAME) {
							return caches.delete(cacheName);
						}
						return null;
					}),
				);
			}),
		]),
	);
});

self.addEventListener("fetch", (event) => {
	// Network-first for HTML documents to ensure we always have the latest version
	if (event.request.mode === "navigate") {
		event.respondWith(
			fetch(event.request)
				.then((response) => {
					const responseToCache = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(event.request, responseToCache);
					});
					return response;
				})
				.catch(() => {
					return caches.match(event.request);
				}),
		);
		return;
	}

	event.respondWith(
		caches.match(event.request).then((response) => {
			return response || fetch(event.request);
		}),
	);
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
