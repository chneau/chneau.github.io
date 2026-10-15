import type { CaptureResult, PostHog } from "posthog-js/dist/module.slim";
import { APP_META } from "./app-meta";

const POSTHOG_KEY = "phc_y32qC29aZS8xjNez6YBKH6r1EdaV6mQHDJd38j9Eiun";

const CONSENT_KEY = "analytics:consent";

const MAX_QUEUED_EVENTS = 20;

const POSTHOG_API_HOST = "https://ph.celerum.online";
const POSTHOG_UI_HOST = "https://eu.posthog.com";

export type AnalyticsConsent = "granted" | "denied" | "unset";

type AppSlug = (typeof APP_META)[number]["slug"];

const KNOWN_APPS: readonly AppSlug[] = APP_META.map((meta) => meta.slug);

type AnalyticsApp = AppSlug;

export type AnalyticsProperties = Record<
	string,
	string | number | boolean | null | undefined
>;

type AnalyticsConsentListener = (granted: boolean) => void;

type QueuedEvent = {
	event: string;
	properties?: Record<string, string | number | boolean>;
};

type AnalyticsEnv = {
	PROD?: boolean;
	PUBLIC_POSTHOG_KEY?: string;
};

const env = import.meta.env as AnalyticsEnv | undefined;

let client: PostHog | null = null;
let loading: Promise<void> | null = null;
let queue: QueuedEvent[] = [];
let loadScheduled = false;

let app: AnalyticsApp = "root";

const listeners = new Set<AnalyticsConsentListener>();

const SENSITIVE_KEY =
	/(password|passwd|secret|token|authorization|cookie|email|phone|ssn|credit|card|iban|address|api[_-]?key)/i;

const MAX_STRING_LENGTH = 500;

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
	} catch {}
};

const hasAnalyticsConsent = (): boolean => readConsent() === "granted";

const getPostHogKey = (): string => {
	const fromEnv = env?.PUBLIC_POSTHOG_KEY;
	return typeof fromEnv === "string" && fromEnv.length > 0
		? fromEnv
		: POSTHOG_KEY;
};

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
		} catch {}
	}
};

const activate = (): void => {
	if (client || loading) return;
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

const whenIdle = (fn: () => void): void => {
	if (typeof window === "undefined") return;
	const idle = window.requestIdleCallback;
	if (typeof idle === "function") {
		idle(() => fn(), { timeout: 2000 });
		return;
	}
	window.setTimeout(fn, 1);
};

const schedule = (): void => {
	if (loadScheduled || typeof window === "undefined") return;
	loadScheduled = true;
	if (document.readyState === "complete") {
		whenIdle(activate);
		return;
	}
	window.addEventListener("load", () => whenIdle(activate), { once: true });
};

export const initAnalytics = (name?: AnalyticsApp): void => {
	try {
		if (typeof window === "undefined") return;
		app = name ?? appFromPath(window.location.pathname);
		if (!analyticsAllowed()) return;
		if (hasPrivacyOptOutSignal()) return;
		if (!hasAnalyticsConsent()) return;
		schedule();
	} catch {}
};

const APP_SET: ReadonlySet<string> = new Set(KNOWN_APPS);

const appFromPath = (pathname: string): AnalyticsApp => {
	const segment = pathname.split("/").find((part) => part !== "");
	return segment !== undefined && APP_SET.has(segment)
		? (segment as AnalyticsApp)
		: "root";
};

export const getAnalyticsApp = (): AnalyticsApp => app;

export const getAnalyticsConsent = (): AnalyticsConsent => readConsent();

export { hasAnalyticsConsent };

export const hasDoNotTrack = (): boolean => hasPrivacyOptOutSignal();

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
		if (client) {
			client.reset();
			client.opt_out_capturing();
		}
		queue = [];
	} catch {}
};

export const onConsentChange = (
	listener: AnalyticsConsentListener,
): (() => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export const optOutAnalytics = (): void => setAnalyticsConsent(false);

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
	} catch {}
};
