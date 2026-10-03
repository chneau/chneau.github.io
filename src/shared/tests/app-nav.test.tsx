import "./happy-dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppNav } from "../index";

/**
 * `AppNav` exists because the navbar was hand-assembled in seven apps and the
 * invariant parts had already drifted: `design` put the app switcher before the
 * back button, and the theme toggle sat in the bar in some apps and behind
 * "More" in others with no rule saying which. Ordering is now stated once.
 *
 * These tests pin the three properties that make it safe to adopt: the ordering
 * is the same everywhere, the theme source is the app's rather than inferred,
 * and a help button is never offered for a dialog that would be empty.
 */
const provider = (node: ReactNode) => <MantineProvider>{node}</MantineProvider>;

const originalMatchMedia = window.matchMedia;
const setViewport = (narrow: boolean) => {
	window.matchMedia = mock((query: string) => ({
		matches: narrow && query.includes("max-width"),
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
};

afterEach(() => {
	window.matchMedia = originalMatchMedia;
	cleanup();
});

const labels = (base: HTMLElement) =>
	[...base.querySelectorAll(".app-header-action")]
		.map((b) => b.getAttribute("aria-label"))
		.filter(Boolean);

describe("AppNav ordering", () => {
	test("the back button comes before the app switcher", () => {
		// `design` used to get this backwards, and nothing caught it.
		setViewport(false);
		const view = render(
			provider(
				<AppNav icon={<span />} title="Design System" subtitle="Shared" />,
			),
		);
		const order = labels(view.container);
		expect(order.indexOf("Back to dashboard")).toBeLessThan(
			order.indexOf("Switch app"),
		);
	});

	test("the dashboard opts out of the back button", () => {
		setViewport(false);
		const view = render(
			provider(<AppNav title="chneau.github.io" showBackHome={false} />),
		);
		expect(labels(view.container)).not.toContain("Back to dashboard");
		expect(labels(view.container)).toContain("Switch app");
	});
});

describe("AppNav theme source", () => {
	test("an explicit theme pair drives the toggle, not Mantine's scheme", () => {
		// The refactor moves where the control is rendered, never where its
		// state comes from: an app's theme behaviour cannot change as a side
		// effect of adopting AppNav.
		setViewport(false);
		let toggles = 0;
		const view = render(
			provider(
				<AppNav
					title="Birthday"
					theme={{ dark: true, onToggle: () => (toggles += 1) }}
				/>,
			),
		);
		// Dark theme means the control offers "Light mode".
		const toggle = view.getByRole("button", { name: "Light mode" });
		fireEvent.click(toggle);
		expect(toggles).toBe(1);
	});
});

describe("AppNav shortcuts help", () => {
	test("offers no help button when the dialog would be empty", () => {
		// Six save editors declare no shortcut groups and bind no palette. A
		// button opening a dialog with nothing in it is worse than no button.
		setViewport(false);
		const view = render(provider(<AppNav title="Save editor" />));
		expect(labels(view.container)).not.toContain("Keyboard shortcuts");
	});

	test("offers the help button once an app declares shortcuts", () => {
		setViewport(false);
		const view = render(
			provider(
				<AppNav
					title="Spooners"
					shortcuts={[
						{
							title: "Search",
							shortcuts: [{ keys: ["/"], description: "Search" }],
						},
					]}
				/>,
			),
		);
		expect(labels(view.container)).toContain("Keyboard shortcuts");
	});

	test("a bare palette is enough to justify the button", () => {
		setViewport(false);
		const view = render(
			provider(<AppNav title="CV" hasCommandPalette shortcuts={[]} />),
		);
		expect(labels(view.container)).toContain("Keyboard shortcuts");
	});
});

describe("AppNav brand", () => {
	test("links home by default and can opt out", () => {
		setViewport(false);
		const linked = render(provider(<AppNav title="Spooners" />));
		expect(
			linked.container.querySelector(".app-brand")?.getAttribute("href"),
		).toBe("/");

		cleanup();
		const plain = render(
			provider(<AppNav title="Save Editor" brandHref={null} />),
		);
		expect(
			plain.container.querySelector(".app-brand")?.getAttribute("href"),
		).toBeNull();
	});

	test("renders brandExtra ahead of the brand", () => {
		setViewport(false);
		const view = render(
			provider(
				<AppNav
					title="Save Editor"
					brandExtra={<button type="button" aria-label="Toggle navigation" />}
				/>,
			),
		);
		const header = view.container.querySelector(".app-header");
		expect(header?.textContent).toContain("Save Editor");
		expect(
			view.getByRole("button", { name: "Toggle navigation" }),
		).toBeDefined();
	});
});
