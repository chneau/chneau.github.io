/**
 * Register the site-wide service worker once the page has loaded. The worker
 * (public/sw.js) serves the offline fallback for failed navigations and caches
 * build assets so an offline visit can still boot.
 *
 * Registration is a no-op when the Service Worker API is unavailable or when
 * the origin is not a secure production origin (local dev / LAN previews).
 */

/** Injected by Rsbuild at build time (the `define` block in rsbuild.config.ts). */
declare const BUILD_DATE: string;

/**
 * The base path of the app this bundle belongs to, e.g. "/" or "/cv/".
 *
 * Every app emits a `<link rel="canonical">` built from the same constant that
 * drives its `assetPrefix`, so the canonical URL is the one place on the page
 * that already knows where the app is mounted.
 */
const appBasePath = (): string => {
	const canonical = document.querySelector<HTMLLinkElement>(
		'link[rel="canonical"]',
	)?.href;
	if (!canonical) return "/";
	const { pathname } = new URL(canonical, window.location.href);
	if (!pathname.startsWith("/")) return "/";
	return pathname.endsWith("/") ? pathname : `${pathname}/`;
};

/**
 * Cache-busting token for `/sw.js`. A different script URL is what makes the
 * browser install a new worker, which in turn evicts the previous deploy's
 * caches — without it, unhashed assets such as `/spooners/data.json` stay
 * pinned for the lifetime of the browser profile.
 */
const buildToken = (): string => {
	const stamp = typeof BUILD_DATE === "string" ? BUILD_DATE.trim() : "";
	// A same-minute rebuild is indistinguishable on the clock alone, so the
	// token always carries a millisecond component: the worker is reinstalled
	// at least once per deploy either way.
	const token = `${stamp || "dev"}-${Date.now()}`;
	return token.replace(/[^a-zA-Z0-9._-]/g, "");
};

/** Tell the worker which app we are so its fallbacks stay per-app. */
const announceScope = (registration: ServiceWorkerRegistration) => {
	const message = { type: "SCOPE", base: appBasePath() };
	const target =
		navigator.serviceWorker.controller ??
		registration.active ??
		registration.waiting ??
		registration.installing;
	target?.postMessage(message);
};

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
			// `scope: "/"` is the default and is what makes this one worker cover
			// every app on the origin; the query string only varies the script.
			.register(`/sw.js?v=${encodeURIComponent(buildToken())}`, {
				scope: "/",
			})
			.then((registration) => {
				// Proactively check for a newer worker on each load. The worker
				// calls skipWaiting()/clients.claim(), so once it takes over an
				// already-controlled page we reload to pick up the new assets.
				registration.update().catch(() => {});
				// `update()` may have started an install: re-announce once the new
				// worker is active so it inherits this app's base.
				registration.addEventListener("updatefound", () => {
					registration.installing?.addEventListener("statechange", () => {
						if (registration.active) announceScope(registration);
					});
				});
				announceScope(registration);
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
