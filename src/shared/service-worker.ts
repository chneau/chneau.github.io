/**
 * Register the site-wide service worker once the page has loaded. The worker
 * (public/sw.js) serves the offline fallback for failed navigations.
 */
export const registerServiceWorker = () => {
	if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
		return;
	}
	if (typeof window !== "undefined") {
		const { hostname } = window.location;
		if (hostname === "localhost" || hostname === "127.0.0.1") return;
		window.addEventListener("load", () => {
			navigator.serviceWorker.register("/sw.js").catch(() => {
				// Offline support is best-effort; ignore registration failures.
			});
		});
	}
};
