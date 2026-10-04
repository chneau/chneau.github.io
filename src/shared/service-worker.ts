/**
 * Register the site-wide service worker once the page has loaded. The worker
 * (public/sw.js) serves the offline fallback for failed navigations and caches
 * build assets so an offline visit can still boot.
 *
 * Registration is a no-op when the Service Worker API is unavailable or when
 * the origin is not a secure production origin (local dev / LAN previews).
 */

/**
 * Injected by Rsbuild at build time into every environment (the top-level
 * `source.define` block in rsbuild.config.ts). It identifies the deploy, not
 * the app: see the comment there for why a per-app token breaks navigation.
 */
declare const SW_BUILD_ID: string;

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
 *
 * The token MUST be stable for the lifetime of a deploy.
 *
 * It is part of the worker script URL, so any change to it is read by the
 * browser as a *different worker*: it installs it, the worker calls
 * skipWaiting() and clients.claim(), `controllerchange` fires and the page
 * reloads — which computes the token again. A per-load component therefore
 * builds a reload loop that only ends when the tab is closed. Two deploys
 * inside the same clock minute are the trade-off here, and losing a cache
 * eviction is far cheaper than an unreloadable page.
 */
const buildToken = (): string => {
	const stamp = typeof SW_BUILD_ID === "string" ? SW_BUILD_ID.trim() : "";
	return (stamp || "dev").replace(/[^a-zA-Z0-9._-]/g, "");
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

/**
 * Whether {@link registerServiceWorker} has already run in this document.
 *
 * Every call that got past the environment gates added another `load` listener,
 * and each of those called `register()`, `update()` and attached its own
 * `controllerchange` listener — so two calls meant two registrations and two
 * possible reloads, while the code's own comment claimed "at most once per page
 * load". One flag makes that true.
 *
 * Set only after the gates pass, so a call made before the page is on https (and
 * so refused) does not consume the single attempt.
 */
let registered = false;

export const registerServiceWorker = () => {
	if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
		return;
	}
	if (typeof window === "undefined") {
		return;
	}
	if (registered) {
		return;
	}
	registered = true;

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
		// Sampled BEFORE `register()`, not inside its `then`: the worker calls
		// clients.claim(), so by the time the promise resolves the controller is
		// already set even on a first-ever visit, and a first visit needs no
		// reload — it has just fetched the new assets from the network anyway.
		const wasControlled = Boolean(navigator.serviceWorker.controller);
		// The worker this page is running under. Its script URL carries the build
		// token, so comparing it against the controller we are handed tells a new
		// deploy apart from a re-claim of the worker we already have — the latter
		// must not reload, or the page spins.
		const runningScript = navigator.serviceWorker.controller?.scriptURL ?? "";

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
				if (!wasControlled) return;
				let reloaded = false;
				navigator.serviceWorker.addEventListener("controllerchange", () => {
					// Belt and braces alongside the stable `buildToken`: reload only
					// onto a genuinely different worker, and only once.
					//
					// The `reloaded` latch is what makes "once" true in the code
					// rather than in the comment. `location.reload()` is asynchronous,
					// so a second `controllerchange` — an update landing while the
					// navigation is still being scheduled — can arrive before the
					// page goes away, and the old guard compared only script URLs and
					// would have reloaded again.
					if (reloaded) return;
					const next = navigator.serviceWorker.controller?.scriptURL ?? "";
					if (!next || next === runningScript) return;
					reloaded = true;
					window.location.reload();
				});
			})
			.catch(() => {
				// Offline support is best-effort; ignore registration failures.
			});
	});
};
