import { axeFragmentOptions } from "./axe-fragment";
import "./happy-dom";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import { act, cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { ConsentBanner, useAnalyticsConsent } from "../consent";

const CONSENT_KEY = "analytics:consent";

beforeEach(() => {
	window.localStorage.removeItem(CONSENT_KEY);
});

afterEach(() => {
	cleanup();
	window.localStorage.removeItem(CONSENT_KEY);
});

const provider = (ui: ReactNode) => <MantineProvider>{ui}</MantineProvider>;

/**
 * MantineProvider injects `<style>` tags into the container, so emptiness is
 * asserted on the banner itself rather than on `textContent`.
 */
const banner = (container: HTMLElement) =>
	container.querySelector<HTMLElement>(".app-consent");

const bannerText = (container: HTMLElement) =>
	banner(container)?.textContent ?? "";

describe("consent banner", () => {
	test("prompts until the visitor has answered", () => {
		const { container } = render(provider(<ConsentBanner />));
		expect(bannerText(container)).toContain("No thanks");
		expect(bannerText(container)).toContain("Allow");
	});

	test("states that declining stops all collection", () => {
		const { container } = render(provider(<ConsentBanner />));
		expect(bannerText(container)).toMatch(/nothing is ever sent/i);
	});

	test("stays hidden once consent is granted", () => {
		window.localStorage.setItem(CONSENT_KEY, "granted");
		const { container } = render(provider(<ConsentBanner />));
		expect(banner(container)).toBeNull();
	});

	test("stays hidden once consent is denied", () => {
		window.localStorage.setItem(CONSENT_KEY, "denied");
		const { container } = render(provider(<ConsentBanner />));
		expect(banner(container)).toBeNull();
	});

	test("accepting persists an opt-in and dismisses the banner", () => {
		const { container } = render(provider(<ConsentBanner />));
		const accept = container.querySelector<HTMLButtonElement>(
			'[data-analytics-consent="accept"]',
		);
		expect(accept).not.toBeNull();
		act(() => accept?.click());
		expect(window.localStorage.getItem(CONSENT_KEY)).toBe("granted");
		expect(banner(container)).toBeNull();
	});

	test("declining persists an opt-out and dismisses the banner", () => {
		const { container } = render(provider(<ConsentBanner />));
		const decline = container.querySelector<HTMLButtonElement>(
			'[data-analytics-consent="decline"]',
		);
		expect(decline).not.toBeNull();
		act(() => decline?.click());
		expect(window.localStorage.getItem(CONSENT_KEY)).toBe("denied");
		expect(banner(container)).toBeNull();
	});

	test("has no detectable accessibility violations", async () => {
		const { container } = render(provider(<ConsentBanner />));
		const results = await axe.run(container, {
			rules: axeFragmentOptions().rules,
		});
		const summary = results.violations.map(
			(violation) =>
				`${violation.id}: ${violation.help} -> ${violation.nodes
					.map((node) => `${node.target.join(" ")} | ${node.html}`)
					.join(", ")}`,
		);
		expect(summary).toEqual([]);
	});
});

describe("useAnalyticsConsent", () => {
	test("is undecided and not granted before any answer", () => {
		const { result } = renderHookState();
		expect(result.current?.granted).toBe(false);
		expect(result.current?.undecided).toBe(true);
		expect(result.current?.forcedOff).toBe(false);
	});

	test("decide(false) persists a denial and settles the prompt", () => {
		const { result } = renderHookState();
		act(() => result.current?.decide(false));
		expect(window.localStorage.getItem(CONSENT_KEY)).toBe("denied");
		expect(result.current?.granted).toBe(false);
		expect(result.current?.undecided).toBe(false);
	});

	test("decide(true) persists an opt-in", () => {
		const { result } = renderHookState();
		act(() => result.current?.decide(true));
		expect(window.localStorage.getItem(CONSENT_KEY)).toBe("granted");
		expect(result.current?.granted).toBe(true);
	});
});

/**
 * Minimal hook harness: this repo has no `@testing-library/react-hooks`, so we
 * capture the latest hook return value from a probe component.
 */
const renderHookState = () => {
	const box: { current: ReturnType<typeof useAnalyticsConsent> | undefined } = {
		current: undefined,
	};
	const Probe = () => {
		box.current = useAnalyticsConsent();
		return null;
	};
	render(provider(<Probe />));
	return { result: box };
};
