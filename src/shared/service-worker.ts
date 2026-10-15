declare const SW_BUILD_ID: string;

const appBasePath = (): string => {
	const canonical = document.querySelector<HTMLLinkElement>(
		'link[rel="canonical"]',
	)?.href;
	if (!canonical) return "/";
	const { pathname } = new URL(canonical, window.location.href);
	if (!pathname.startsWith("/")) return "/";
	return pathname.endsWith("/") ? pathname : `${pathname}/`;
};

const buildToken = (): string => {
	const stamp = typeof SW_BUILD_ID === "string" ? SW_BUILD_ID.trim() : "";
	return (stamp || "dev").replace(/[^a-zA-Z0-9._-]/g, "");
};

const announceScope = (registration: ServiceWorkerRegistration) => {
	const message = { type: "SCOPE", base: appBasePath() };
	const target =
		navigator.serviceWorker.controller ??
		registration.active ??
		registration.waiting ??
		registration.installing;
	target?.postMessage(message);
};

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
		const wasControlled = Boolean(navigator.serviceWorker.controller);
		const runningScript = navigator.serviceWorker.controller?.scriptURL ?? "";

		navigator.serviceWorker
			.register(`/sw.js?v=${encodeURIComponent(buildToken())}`, {
				scope: "/",
			})
			.then((registration) => {
				registration.update().catch(() => {});
				registration.addEventListener("updatefound", () => {
					registration.installing?.addEventListener("statechange", () => {
						if (registration.active) announceScope(registration);
					});
				});
				announceScope(registration);
				if (!wasControlled) return;
				let reloaded = false;
				navigator.serviceWorker.addEventListener("controllerchange", () => {
					if (reloaded) return;
					const next = navigator.serviceWorker.controller?.scriptURL ?? "";
					if (!next || next === runningScript) return;
					reloaded = true;
					window.location.reload();
				});
			})
			.catch(() => {});
	});
};
