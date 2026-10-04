import type { CaptureResult, PostHog } from "posthog-js/dist/module.slim";

/** Shared PostHog project key; the same across every app. */
const POSTHOG_KEY = "phc_y32qC29aZS8xjNez6YBKH6r1EdaV6mQHDJd38j9Eiun";

/** Where the explicit analytics choice is persisted. */
const CONSENT_KEY = "analytics:consent";

/** Cap on events buffered while the PostHog SDK is still loading. */
const MAX_QUEUED_EVENTS = 20;

/**
 * PostHog hosts. The collector is self-hosted, so capture traffic never touches
 * the default `us.i.posthog.com`; the UI host is only used by the toolbar, which
 * we never load.
 */
const POSTHOG_API_HOST = "https://ph.celerum.online";
const POSTHOG_UI_HOST = "https://eu.posthog.com";

/** A stored consent decision, or `unset` when the visitor never chose. */
export type AnalyticsConsent = "granted" | "denied" | "unset";

/**
 * Every app that reports events, so each can be segmented instead of landing in
 * one undifferentiated stream. Also sent as the `app` property.
 *
 * The list is the single source and the union is derived from it. These used to
 * be two declarations — a thirteen-member union here and a seven-entry
 * `KNOWN_APPS` set further down — and the set fell behind as save editors were
 * added: the six newer ones were absent, so `appFromPath` tagged their events
 * `"root"`. Nothing failed, because `mountApp` passes the id explicitly and the
 * wrong fallback was rarely reached. Deriving the type means a new app can only
 * be added in one place, so the two cannot drift apart again.
 */
const KNOWN_APPS = [
	"root",
	"cv",
	"birthday",
	"scotland-rail",
	"spooners",
	"design",
	"crimson-desert-save-editor",
	"cyberpunk-2077-save-editor",
	"no-rest-for-the-wicked-save-editor",
	"power-fantasy-save-editor",
	"dysmantle-save-editor",
	"tails-of-iron-2-save-editor",
	"deadly-days-roadtrip-save-editor",
] as const;

type AnalyticsApp = (typeof KNOWN_APPS)[number];

/**
 * Flat, JSON-serialisable event properties. `null` / `undefined` values are
 * dropped before the event leaves the browser.
 */
export type AnalyticsProperties = Record<
	string,
	string | number | boolean | null | undefined
>;

/** Listener signature for {@link onConsentChange}. */
type AnalyticsConsentListener = (granted: boolean) => void;

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
let loadScheduled = false;

/** Which app is reporting; every event is tagged with it. */
let app: AnalyticsApp = "root";

const listeners = new Set<AnalyticsConsentListener>();

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

/**
 * Do Not Track and Global Privacy Control are treated as an opt-out request.
 *
 * These are hard signals rather than preferences: a browser exporting GPC is
 * asserting an opt-out under ePrivacy art. 5(3) and CCPA/CPRA §702(g), so we
 * honour it without asking and without loading a single byte of the SDK.
 */
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
 * servers, tests, previews over LAN and SSR (empty hostname) all bail.
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

/**
 * `true` only on an explicit opt-in. There is deliberately no "unset means yes"
 * default: an unanswered consent prompt must never lead to a network call.
 */
const hasAnalyticsConsent = (): boolean => readConsent() === "granted";

const getPostHogKey = (): string => {
	const fromEnv = env?.PUBLIC_POSTHOG_KEY;
	return typeof fromEnv === "string" && fromEnv.length > 0
		? fromEnv
		: POSTHOG_KEY;
};

/**
 * Last line of defence for anything that could carry identity. `person_profiles`
 * is already `"never"`; if a future caller reaches for `identify()` we would
 * rather drop the `$set` payload than ship a profile we never intended to build.
 */
const beforeSend = (event: CaptureResult | null): CaptureResult | null => {
	if (!event?.properties) return event;
	const url: unknown = event.properties.$current_url;
	if (typeof url === "string") {
		event.properties.$current_url = url.split(/[?#]/)[0];
	}
	delete event.properties.$el_text;
	delete event.$set;
	delete event.$set_once;
	delete event.$unset;
	return event;
};

/**
 * Deliberately conservative config.
 *
 * The `defaults: "2025-11-30"` preset expands to `autocapture: true` and a
 * `session_recording` block that is resolved from PostHog's server-side remote
 * config, so every behaviour below is written out explicitly and overrides the
 * preset rather than relying on it:
 *
 * - `autocapture: false` — no click/change/form listeners. The CV and birthday
 *   apps render real personal data, so an autocaptured click would ship element
 *   text and the CSS selectors describing it.
 * - `disable_session_recording: true` with an empty `session_recording: {}` — no
 *   rrweb DOM snapshot stream, and no remote-config block to resolve one from.
 *   This is what put ~200 kB of recorder code in the vendor chunk of every app.
 * - `advanced_disable_decide` + `advanced_disable_feature_flags: true` — no
 *   `/decide` round trip at all. Remote config is the documented way for
 *   session replay to be switched on server-side for every visitor with no code
 *   review; removing the endpoint removes the switch.
 * - `capture_exceptions`, `capture_dead_clicks`, `capture_performance` and
 *   `capture_heatmaps` all `false` — stack traces leak file paths and, in these
 *   apps, the exact values being parsed (a person's name, a save slot).
 * - `person_profiles: "never"` — anonymous event counters only. Nothing calls
 *   `identify()`, so a person profile is pure additional personal data.
 * - `opt_out_capturing_by_default: true` — the SDK itself defaults to capturing
 *   nothing; we opt in explicitly once consent is confirmed.
 * - `capture_pageview: true` is the one genuinely useful signal (which app, which
 *   page), with query strings and fragments stripped in `beforeSend`.
 * - `mask_all_text`, `mask_all_element_attributes` and `save_referrer: false` —
 *   no DOM text, no attributes, no referrer chain.
 */
const createConfig = () => ({
	api_host: POSTHOG_API_HOST,
	ui_host: POSTHOG_UI_HOST,
	defaults: "2025-11-30" as const,
	respect_dnt: true,
	opt_out_capturing_by_default: true,
	autocapture: false,
	disable_session_recording: true,
	session_recording: {},
	capture_exceptions: false,
	capture_dead_clicks: false,
	capture_performance: false,
	capture_heatmaps: false,
	capture_pageview: true,
	capture_pageleave: false,
	advanced_disable_decide: true,
	advanced_disable_feature_flags: true,
	person_profiles: "never" as const,
	disable_surveys: true,
	disable_capture_url_hashes: true,
	save_referrer: false,
	save_campaign_params: false,
	mask_all_text: true,
	mask_all_element_attributes: true,
	before_send: beforeSend,
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
 * Load the SDK on demand and initialise it with the config above.
 *
 * `posthog-js/dist/module.slim` is the lean build: autocapture, session replay
 * (rrweb), surveys, logs, web-vitals and the heatmap recorder are not compiled
 * into it at all — ~51 kB gzipped versus ~100 kB for `module` and ~202 kB for
 * `module.full`. Nothing configured above can switch those features back on
 * because the code never reaches the browser.
 *
 * Never throws: analytics is best-effort and must not break app bootstrap.
 */
const activate = (): void => {
	if (client || loading) return;
	// Consent may have been withdrawn while the lazy load was queued.
	if (!hasAnalyticsConsent()) return;
	loading = (async () => {
		try {
			const { default: posthog } = await import("posthog-js/dist/module.slim");
			posthog.init(getPostHogKey(), createConfig());
			client = posthog;
			if (hasAnalyticsConsent()) {
				client.opt_in_capturing({ captureEventName: false });
				client.capture("$pageview");
				flush();
			} else {
				client.reset();
				client.opt_out_capturing();
				queue = [];
			}
		} catch {
			client = null;
		} finally {
			loading = null;
		}
	})();
};

/** Run `fn` in a free slot so the import never competes with first paint. */
const whenIdle = (fn: () => void): void => {
	if (typeof window === "undefined") return;
	const idle = window.requestIdleCallback;
	if (typeof idle === "function") {
		idle(() => fn(), { timeout: 2000 });
		return;
	}
	window.setTimeout(fn, 1);
};

/**
 * Defer the SDK off the critical path: only after `load` has fired (or straight
 * away if the document already finished) and inside an idle callback. Nothing is
 * fetched while the page is still competing for bandwidth with its own content.
 */
const schedule = (): void => {
	if (loadScheduled || typeof window === "undefined") return;
	loadScheduled = true;
	if (document.readyState === "complete") {
		whenIdle(activate);
		return;
	}
	window.addEventListener("load", () => whenIdle(activate), { once: true });
};

/**
 * Initialise product analytics once per page.
 *
 * Nothing happens at all unless the visitor has already opted in: this is a
 * prior-consent gate, so on a first visit (or after a denial) no code is
 * downloaded and no request leaves the browser. The consent banner calls
 * {@link setAnalyticsConsent}, which starts the SDK on acceptance.
 *
 * Also skipped in development, tests, on local/LAN hosts, and whenever the
 * browser exports Do Not Track or Global Privacy Control.
 *
 * @param name the app reporting, so the stream can be segmented per app.
 *   Optional, so existing `initAnalytics()` call sites keep working; it then
 *   falls back to the first path segment of `location.pathname`.
 */
export const initAnalytics = (name?: AnalyticsApp): void => {
	try {
		if (typeof window === "undefined") return;
		app = name ?? appFromPath(window.location.pathname);
		if (!analyticsAllowed()) return;
		if (hasPrivacyOptOutSignal()) return;
		if (!hasAnalyticsConsent()) return;
		schedule();
	} catch {
		// Analytics is best-effort; never break the entry point.
	}
};

const APP_SET: ReadonlySet<string> = new Set(KNOWN_APPS);

/**
 * Derive the app id from the first path segment, so a call site that forgets to
 * pass one is still tagged (`/cv/` → `cv`, `/` → `root`).
 */
const appFromPath = (pathname: string): AnalyticsApp => {
	const segment = pathname.split("/").find((part) => part !== "");
	return segment !== undefined && APP_SET.has(segment)
		? (segment as AnalyticsApp)
		: "root";
};

/** The app currently reporting events; also used as an event property. */
export const getAnalyticsApp = (): AnalyticsApp => app;

/** The stored consent decision (`unset` until the visitor chooses). */
export const getAnalyticsConsent = (): AnalyticsConsent => readConsent();

export { hasAnalyticsConsent };

/** `true` when the browser exports Do Not Track or Global Privacy Control. */
export const hasDoNotTrack = (): boolean => hasPrivacyOptOutSignal();

/**
 * Record an explicit consent choice and apply it at runtime. Safe to call
 * before `initAnalytics()`, or when the SDK will never load (dev/SSR/tests).
 */
export const setAnalyticsConsent = (granted: boolean): void => {
	try {
		writeConsent(granted);
		for (const listener of listeners) listener(granted);
		if (!analyticsAllowed()) return;
		if (granted) {
			if (client) {
				client.opt_in_capturing({ captureEventName: false });
				flush();
			} else {
				activate();
			}
			return;
		}
		// `reset()` clears consent state, so opt out *after* resetting.
		if (client) {
			client.reset();
			client.opt_out_capturing();
		}
		queue = [];
	} catch {
		// Consent handling must never throw.
	}
};

/**
 * Subscribe to consent changes. Returns an unsubscribe function, so it can be
 * returned straight out of a `useEffect` cleanup.
 */
export const onConsentChange = (
	listener: AnalyticsConsentListener,
): (() => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

/** Explicit "Do Not Sell/Share" hook; an alias for a consent denial. */
export const optOutAnalytics = (): void => setAnalyticsConsent(false);

/**
 * Typed, no-op-safe custom event helper. Drops silently when analytics is off,
 * and never throws.
 */
export const track = (
	event: string,
	properties?: AnalyticsProperties,
): void => {
	try {
		if (!event) return;
		if (!analyticsAllowed()) return;
		if (!hasAnalyticsConsent()) return;
		if (client) {
			client.capture(event, sanitize({ ...properties, app }));
			return;
		}
		if (loading || loadScheduled) {
			queue.push({ event, properties: sanitize({ ...properties, app }) });
			if (queue.length > MAX_QUEUED_EVENTS) queue.shift();
		}
	} catch {
		// Tracking is best-effort; never break the app.
	}
};
