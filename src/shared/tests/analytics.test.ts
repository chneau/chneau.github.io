import "./happy-dom";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	type AnalyticsConsent,
	type AnalyticsProperties,
	getAnalyticsApp,
	getAnalyticsConsent,
	hasAnalyticsConsent,
	hasDoNotTrack,
	initAnalytics,
	onConsentChange,
	optOutAnalytics,
	setAnalyticsConsent,
	track,
} from "../analytics";

const CONSENT_KEY = "analytics:consent";

beforeEach(() => {
	window.localStorage.removeItem(CONSENT_KEY);
});

afterEach(() => {
	window.localStorage.removeItem(CONSENT_KEY);
});

describe("analytics consent", () => {
	test("starts unset and is not granted", () => {
		const expected: AnalyticsConsent = "unset";
		expect(getAnalyticsConsent()).toBe(expected);
		expect(hasAnalyticsConsent()).toBe(false);
	});

	test("persists an explicit granted/denied choice", () => {
		setAnalyticsConsent(true);
		expect(getAnalyticsConsent()).toBe("granted");
		expect(hasAnalyticsConsent()).toBe(true);
		setAnalyticsConsent(false);
		expect(getAnalyticsConsent()).toBe("denied");
		expect(hasAnalyticsConsent()).toBe(false);
	});

	test("optOutAnalytics is an alias for denial", () => {
		optOutAnalytics();
		expect(getAnalyticsConsent()).toBe("denied");
	});

	test("ignores tampered storage values", () => {
		window.localStorage.setItem(CONSENT_KEY, "maybe");
		expect(getAnalyticsConsent()).toBe("unset");
		// A tampered value must not be treated as an opt-in.
		expect(hasAnalyticsConsent()).toBe(false);
	});

	test("notifies subscribers and supports unsubscribe", () => {
		const seen: boolean[] = [];
		const unsubscribe = onConsentChange((granted) => seen.push(granted));
		setAnalyticsConsent(true);
		setAnalyticsConsent(false);
		unsubscribe();
		setAnalyticsConsent(true);
		expect(seen).toEqual([true, false]);
	});

	test("reports no Do Not Track signal under happy-dom", () => {
		expect(hasDoNotTrack()).toBe(false);
	});
});

describe("analytics is a safe no-op", () => {
	test("initAnalytics never throws and does not load the SDK", () => {
		expect(() => initAnalytics("cv")).not.toThrow();
		expect((globalThis as { posthog?: unknown }).posthog).toBeUndefined();
	});

	test("tags the reporting app", () => {
		initAnalytics("spooners");
		expect(getAnalyticsApp()).toBe("spooners");
	});

	test("track never throws, even with sensitive properties", () => {
		const properties: AnalyticsProperties = {
			app: "root",
			email: "someone@example.com",
			count: 1,
			ok: true,
			missing: undefined,
		};
		expect(() => track("app_opened", properties)).not.toThrow();
		expect(() => track("no_properties")).not.toThrow();
	});

	test("track drops events before consent is granted", () => {
		expect(() => track("before_consent")).not.toThrow();
		setAnalyticsConsent(true);
		expect(() => track("after_consent")).not.toThrow();
	});

	test("consent changes never throw without the SDK", () => {
		expect(() => setAnalyticsConsent(true)).not.toThrow();
		expect(() => setAnalyticsConsent(false)).not.toThrow();
		expect(() => optOutAnalytics()).not.toThrow();
	});
});
