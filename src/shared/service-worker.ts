/**
 * Register the site-wide service worker once the page has loaded. The worker
 * (public/sw.js) serves the offline fallback for failed navigations and caches
 * hashed build assets so an offline visit can still boot.
 *
 * Registration is a no-op when the Service Worker API is unavailable or when
 * the origin is not a secure production origin (local dev / LAN previews).
 */
export const registerServiceWorker = () => {
	if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
		return;
	}
	if (typeof window === "undefined") {
		return;
	}

	const { hostname, protocol } = window.location;
	// Workers require a secure context; skip local dev hosts and LAN previews.
	const isLocalHost =
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1" ||
		hostname === "[::1]" ||
		hostname.endsWith(".local");
	if (protocol !== "https:" || isLocalHost) {
		return;
	}

	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register("/sw.js", { scope: "/" })
			.then((registration) => {
				// Proactively check for a newer worker on each load. The worker
				// calls skipWaiting()/clients.claim(), so once it takes over an
				// already-controlled page we reload to pick up the new assets.
				registration.update().catch(() => {});
				if (!navigator.serviceWorker.controller) return;
				navigator.serviceWorker.addEventListener("controllerchange", () => {
					window.location.reload();
				});
			})
			.catch(() => {
				// Offline support is best-effort; ignore registration failures.
			});
	});
};
