import type { CaptureResult, PostHog } from "posthog-js";

/** Shared PostHog project key; the same across every app. */
const POSTHOG_KEY = "phc_y32qC29aZS8xjNez6YBKH6r1EdaV6mQHDJd38j9Eiun";

/** Where the explicit analytics choice is persisted. */
const CONSENT_KEY = "analytics:consent";

/** Cap on events buffered while the PostHog SDK is still loading. */
const MAX_QUEUED_EVENTS = 20;

/** A stored consent decision, or `unset` when the visitor never chose. */
export type AnalyticsConsent = "granted" | "denied" | "unset";

/**
 * Flat, JSON-serialisable event properties. `null` / `undefined` values are
 * dropped before the event leaves the browser.
 */
export type AnalyticsProperties = Record<
	string,
	string | number | boolean | null | undefined
>;

type QueuedEvent = {
	event: string;
	properties?: Record<string, string | number | boolean>;
};

type AnalyticsEnv = {
	PROD?: boolean;
	PUBLIC_POSTHOG_KEY?: string;
};

/**
 * Read once so the bundler's `import.meta.env` define is a plain member
 * access (safe under optional chaining) and SSR-safe when it is absent.
 */
const env = import.meta.env as AnalyticsEnv | undefined;

let client: PostHog | null = null;
let loading: Promise<void> | null = null;
let queue: QueuedEvent[] = [];

/**
 * Keys that look like personal data. Tracked values are dropped when the key
 * matches, so a future caller cannot accidentally ship an email/PIN.
 */
const SENSITIVE_KEY =
	/(password|passwd|secret|token|authorization|cookie|email|phone|ssn|credit|card|iban|address|api[_-]?key)/i;

/** Longest string we will forward; keeps accidental blobs out of analytics. */
const MAX_STRING_LENGTH = 500;

/** Remove `null`/`undefined`, sensitive keys and oversized strings. */
const sanitize = (
	properties?: AnalyticsProperties,
): Record<string, string | number | boolean> | undefined => {
	if (!properties) return undefined;
	const clean: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(properties)) {
		if (value === null || value === undefined) continue;
		if (SENSITIVE_KEY.test(key)) continue;
		if (typeof value === "string") {
			clean[key] =
				value.length > MAX_STRING_LENGTH
					? value.slice(0, MAX_STRING_LENGTH)
					: value;
			continue;
		}
		if (typeof value === "number" || typeof value === "boolean") {
			clean[key] = value;
		}
	}
	return clean;
};

/** LAN / loopback / mDNS hosts are treated as local development. */
const isLocalHostname = (hostname: string): boolean =>
	hostname === "" ||
	hostname === "0.0.0.0" ||
	hostname === "localhost" ||
	hostname === "[::1]" ||
	hostname === "::1" ||
	hostname.endsWith(".localhost") ||
	hostname.endsWith(".local") ||
	/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);

type PrivacyNavigator = Navigator & {
	globalPrivacyControl?: boolean;
	msDoNotTrack?: string;
};

/** Do Not Track / Global Privacy Control are treated as an opt-out request. */
const hasPrivacyOptOutSignal = (): boolean => {
	if (typeof navigator === "undefined") return false;
	const nav = navigator as PrivacyNavigator;
	if (nav.globalPrivacyControl === true) return true;
	const windowDnt =
		typeof window === "undefined"
			? undefined
			: (window as { doNotTrack?: string }).doNotTrack;
	const dnt = nav.doNotTrack ?? windowDnt ?? nav.msDoNotTrack;
	return dnt === "1" || dnt === "yes";
};

/**
 * Analytics may only run on a real, production, http(s) page. Development
 * servers, tests, previews over LAN and SSR render an empty hostname all bail.
 */
const analyticsAllowed = (): boolean => {
	if (typeof window === "undefined") return false;
	if (!env?.PROD) return false;
	const { protocol, hostname } = window.location;
	if (protocol !== "http:" && protocol !== "https:") return false;
	return !isLocalHostname(hostname);
};

const readConsent = (): AnalyticsConsent => {
	if (typeof window === "undefined") return "unset";
	try {
		const raw = window.localStorage.getItem(CONSENT_KEY);
		return raw === "granted" || raw === "denied" ? raw : "unset";
	} catch {
		return "unset";
	}
};

const writeConsent = (granted: boolean): void => {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
	} catch {
		// Private browsing can block storage; the in-memory decision still holds.
	}
};

/** Stored consent wins; without one, DNT / GPC act as an opt-out. */
const isOptedOut = (): boolean => {
	const consent = readConsent();
	if (consent === "denied") return true;
	if (consent === "granted") return false;
	return hasPrivacyOptOutSignal();
};

const getPostHogKey = (): string => {
	const fromEnv = env?.PUBLIC_POSTHOG_KEY;
	return typeof fromEnv === "string" && fromEnv.length > 0
		? fromEnv
		: POSTHOG_KEY;
};

/** Deliberately conservative config: no replay, masked text, scrubbed URLs. */
const createConfig = () => ({
	api_host: "https://ph.celerum.online/@",
	ui_host: "https://eu.posthog.com",
	defaults: "2025-11-30" as const,
	respect_dnt: true,
	disable_session_recording: true,
	disable_surveys: true,
	disable_capture_url_hashes: true,
	mask_all_text: true,
	mask_all_element_attributes: true,
	before_send: (event: CaptureResult | null): CaptureResult | null => {
		if (!event?.properties) return event;
		if (typeof event.properties.$current_url === "string") {
			event.properties.$current_url =
				event.properties.$current_url.split(/[?#]/)[0];
		}
		delete event.properties.$el_text;
		return event;
	},
});

const flush = (): void => {
	if (!client) return;
	const pending = queue;
	queue = [];
	for (const item of pending) {
		try {
			client.capture(item.event, item.properties);
		} catch {
			// A single bad event must not stop the rest.
		}
	}
};

/**
 * Load the SDK on demand and initialise it with privacy-preserving defaults.
 * Never throws: analytics is best-effort and must not break app bootstrap.
 */
const activate = (): void => {
	if (client || loading) return;
	loading = (async () => {
		try {
			const { default: posthog } = await import("posthog-js");
			posthog.init(getPostHogKey(), createConfig());
			client = posthog;
			// Consent may have been withdrawn while the import was in flight.
			if (isOptedOut()) {
				posthog.reset();
				posthog.opt_out_capturing();
				queue = [];
			} else {
				flush();
			}
		} catch {
			client = null;
		} finally {
			loading = null;
		}
	})();
};

/**
 * Initialise product analytics once per page. Skipped in development, tests
 * and on local/LAN hosts, and skipped entirely when the visitor opted out
 * (stored consent, Do Not Track or Global Privacy Control).
 */
export const initAnalytics = (): void => {
	try {
		if (typeof window === "undefined") return;
		if (!analyticsAllowed()) return;
		if (isOptedOut()) return;
		activate();
	} catch {
		// Analytics is best-effort; never break the entry point.
	}
};

/**
 * Record an explicit consent choice and apply it at runtime. Safe to call
 * before `initAnalytics()` or when the SDK never loaded (e.g. dev/SSR).
 */
export const setAnalyticsConsent = (granted: boolean): void => {
	try {
		writeConsent(granted);
		if (granted) {
			if (client) {
				client.opt_in_capturing();
			} else if (analyticsAllowed()) {
				activate();
			}
			return;
		}
		if (client) {
			// `reset()` clears consent state, so opt out *after* resetting.
			client.reset();
			client.opt_out_capturing();
		}
		queue = [];
	} catch {
		// Consent handling must never throw.
	}
};

/** Explicit "Do Not Sell/Share" / opt-out hook for a consent control. */
export const optOutAnalytics = (): void => {
	setAnalyticsConsent(false);
};

/** The currently stored consent decision (`unset` until the visitor chooses). */
export const getAnalyticsConsent = (): AnalyticsConsent => readConsent();

/**
 * Typed, no-op-safe custom event helper. Drops while the SDK is loading or
 * when analytics is disabled, and never throws.
 */
export const track = (
	event: string,
	properties?: AnalyticsProperties,
): void => {
	try {
		if (!event) return;
		const clean = sanitize(properties);
		if (client) {
			client.capture(event, clean);
			return;
		}
		if (loading) {
			queue.push({ event, properties: clean });
			if (queue.length > MAX_QUEUED_EVENTS) queue.shift();
		}
	} catch {
		// Tracking is best-effort; never break the app.
	}
};
