import "./happy-dom";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	type AnalyticsConsent,
	type AnalyticsProperties,
	getAnalyticsConsent,
	initAnalytics,
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
	test("starts unset", () => {
		const expected: AnalyticsConsent = "unset";
		expect(getAnalyticsConsent()).toBe(expected);
	});

	test("persists an explicit granted/denied choice", () => {
		setAnalyticsConsent(true);
		expect(getAnalyticsConsent()).toBe("granted");
		setAnalyticsConsent(false);
		expect(getAnalyticsConsent()).toBe("denied");
	});

	test("optOutAnalytics is an alias for denial", () => {
		optOutAnalytics();
		expect(getAnalyticsConsent()).toBe("denied");
	});

	test("ignores tampered storage values", () => {
		window.localStorage.setItem(CONSENT_KEY, "maybe");
		expect(getAnalyticsConsent()).toBe("unset");
	});
});

describe("analytics is a safe no-op", () => {
	test("initAnalytics never throws and does not load the SDK", () => {
		expect(() => initAnalytics()).not.toThrow();
		expect((globalThis as { posthog?: unknown }).posthog).toBeUndefined();
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

	test("consent changes never throw without the SDK", () => {
		expect(() => setAnalyticsConsent(true)).not.toThrow();
		expect(() => setAnalyticsConsent(false)).not.toThrow();
		expect(() => optOutAnalytics()).not.toThrow();
	});
});
