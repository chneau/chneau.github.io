import "./happy-dom";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { HeaderAction, HeaderOverflow } from "../index";

/**
 * The overflow ("More") menu is the narrow-screen home for header controls an
 * app cannot fit in a 56px row. Measured at 360px with touch, birthday's row was
 * 494px wide in a 360px viewport, which collapsed the brand to zero width and
 * pushed the document sideways.
 *
 * The contract these tests pin is the one the component exists to keep: above
 * the breakpoint it must be invisible (so a desktop bar is untouched), and below
 * it every control must still be reachable through a menu that behaves like the
 * app switcher beside it.
 */
const provider = (node: ReactNode) => <MantineProvider>{node}</MantineProvider>;

/** Mantine's `useMediaQuery` reads this; the component branches on `(max-width: 640px)`. */
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

const originalMatchMedia = window.matchMedia;

beforeEach(() => setViewport(true));
afterEach(() => {
	window.matchMedia = originalMatchMedia;
	cleanup();
});

describe("HeaderOverflow on a narrow screen", () => {
	test("collapses the controls behind a single trigger", () => {
		const view = render(
			provider(
				<HeaderOverflow>
					<HeaderAction label="Settings" icon={<span />} />
					<HeaderAction label="Copy a link" icon={<span />} />
				</HeaderOverflow>,
			),
		);

		// Nothing but the trigger is in the bar until it is opened.
		expect(view.queryAllByRole("button")).toHaveLength(1);
		const trigger = view.getByRole("button", { name: "More actions" });
		expect(trigger.getAttribute("aria-expanded")).toBe("false");

		fireEvent.click(trigger);
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		expect(view.getByRole("group", { name: "More actions" })).toBeDefined();
		expect(view.getByRole("button", { name: "Settings" })).toBeDefined();
		expect(view.getByRole("button", { name: "Copy a link" })).toBeDefined();
	});

	/**
	 * A control that does not take a `role` prop — Mantine's `Tooltip` renders
	 * its child, and `SchemeToggle` is its own component — must still land in the
	 * menu usable. The menu is a `group` rather than a `menu` precisely because a
	 * `menu` would require every child to be a menuitem, which those are not.
	 */
	test("keeps controls that cannot carry a menuitem role", () => {
		const view = render(
			provider(
				<HeaderOverflow>
					<HeaderAction label="Settings" icon={<span />} />
					<button type="button">A control with no role support</button>
				</HeaderOverflow>,
			),
		);

		fireEvent.click(view.getByRole("button", { name: "More actions" }));
		const menu = view.getByRole("group", { name: "More actions" });
		expect(menu.textContent).toContain("A control with no role support");
	});

	test("opening moves focus into the menu", () => {
		const view = render(
			provider(
				<HeaderOverflow>
					<HeaderAction label="Settings" icon={<span />} />
					<HeaderAction label="Copy a link" icon={<span />} />
				</HeaderOverflow>,
			),
		);

		fireEvent.click(view.getByRole("button", { name: "More actions" }));
		expect(document.activeElement?.getAttribute("aria-label")).toBe("Settings");
	});

	test("arrow keys step through the controls and wrap at both ends", () => {
		const view = render(
			provider(
				<HeaderOverflow>
					<HeaderAction label="One" icon={<span />} />
					<HeaderAction label="Two" icon={<span />} />
					<HeaderAction label="Three" icon={<span />} />
				</HeaderOverflow>,
			),
		);

		fireEvent.click(view.getByRole("button", { name: "More actions" }));
		const menu = view.getByRole("group", { name: "More actions" });

		fireEvent.keyDown(document.activeElement as HTMLElement, {
			key: "ArrowDown",
		});
		expect(document.activeElement?.getAttribute("aria-label")).toBe("Two");
		fireEvent.keyDown(document.activeElement as HTMLElement, {
			key: "ArrowDown",
		});
		expect(document.activeElement?.getAttribute("aria-label")).toBe("Three");
		// Down from the last wraps to the first.
		fireEvent.keyDown(document.activeElement as HTMLElement, {
			key: "ArrowDown",
		});
		expect(document.activeElement?.getAttribute("aria-label")).toBe("One");
		// And up from the first wraps to the last.
		fireEvent.keyDown(document.activeElement as HTMLElement, {
			key: "ArrowUp",
		});
		expect(document.activeElement?.getAttribute("aria-label")).toBe("Three");

		fireEvent.keyDown(menu, { key: "Home" });
		expect(document.activeElement?.getAttribute("aria-label")).toBe("One");
		fireEvent.keyDown(menu, { key: "End" });
		expect(document.activeElement?.getAttribute("aria-label")).toBe("Three");
	});

	test("Escape closes the menu and restores focus to the trigger", () => {
		const view = render(
			provider(
				<HeaderOverflow>
					<HeaderAction label="Settings" icon={<span />} />
				</HeaderOverflow>,
			),
		);

		const trigger = view.getByRole("button", { name: "More actions" });
		fireEvent.click(trigger);
		fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });

		expect(view.queryByRole("group", { name: "More actions" })).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	test("has no detectable axe violations when open", async () => {
		const view = render(
			provider(
				<HeaderOverflow>
					<HeaderAction label="Settings" icon={<span />} />
					<HeaderAction href="/x/" label="A link" icon={<span />} />
				</HeaderOverflow>,
			),
		);

		fireEvent.click(view.getByRole("button", { name: "More actions" }));
		const results = await axe.run(view.baseElement, {
			rules: {
				"color-contrast": { enabled: false },
				"page-has-heading-one": { enabled: false },
				"landmark-one-main": { enabled: false },
				region: { enabled: false },
				"html-has-lang": { enabled: false },
				"document-title": { enabled: false },
				bypass: { enabled: false },
				"meta-viewport": { enabled: false },
			},
		});
		expect(
			results.violations.map(
				(v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.html).join(", ")}`,
			),
		).toEqual([]);
	});
});

describe("HeaderOverflow on a wide screen", () => {
	test("renders its children inline with no trigger at all", () => {
		setViewport(false);
		const view = render(
			provider(
				<HeaderOverflow>
					<HeaderAction label="Settings" icon={<span />} />
					<HeaderAction label="Copy a link" icon={<span />} />
				</HeaderOverflow>,
			),
		);

		// A desktop bar must be untouched: every control visible, nothing added.
		expect(view.queryByRole("button", { name: "More actions" })).toBeNull();
		expect(view.getByRole("button", { name: "Settings" })).toBeDefined();
		expect(view.getByRole("button", { name: "Copy a link" })).toBeDefined();
		expect(view.container.querySelector(".app-header-overflow")).toBeNull();
	});
});
