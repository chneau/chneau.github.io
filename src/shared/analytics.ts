import posthog from "posthog-js/dist/module.full";

/** Shared PostHog project key; the same across every app. */
const POSTHOG_KEY = "phc_y32qC29aZS8xjNez6YBKH6r1EdaV6mQHDJd38j9Eiun";

let initialized = false;

/**
 * Initialise product analytics once per page. Skipped on localhost so local
 * development never pollutes the shared dashboards.
 */
export const initAnalytics = () => {
	if (initialized || typeof window === "undefined") return;
	const { hostname } = window.location;
	if (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "[::1]" ||
		hostname === ""
	) {
		return;
	}
	initialized = true;
	posthog.init(POSTHOG_KEY, {
		api_host: "https://ph.celerum.online/@",
		ui_host: "https://eu.posthog.com",
		defaults: "2025-11-30",
	});
};
