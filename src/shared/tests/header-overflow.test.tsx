import "./happy-dom";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { BackHome } from "../components/BackHome";
import { SchemeToggle } from "../components/SchemeToggle";
import { ShortcutsHelpButton } from "../components/ShortcutsHelp";
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

/**
 * `base.css` as text, so the spacing rules can be asserted directly.
 *
 * These four declarations are CSS-only and leave no trace in the DOM, which is
 * the point of this file's existence having stopped short of them until now: the
 * menu shipped unlabelled and cramped while every behavioural test still passed.
 * The rules are read as source, the way `tokens-theme.test.ts` does it, because
 * the defect that matters is a cascade outcome — which rule wins — and that is
 * not observable without a browser.
 */
const baseCss = (
	await Bun.file(join(import.meta.dir, "..", "base.css")).text()
).replace(/\/\*[\s\S]*?\*\//g, "");

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

	/**
	 * The defect this pins: `HeaderAction` renders a visible label span only when
	 * `children` is passed, and every `iconOnly` control — back home, theme,
	 * shortcuts, palette, the GitHub links — passes only `label`, which becomes
	 * `aria-label`/`title` and no visible text. The CSS that re-shows labels
	 * inside the menu had nothing to re-show, so the menu was a column of
	 * unlabelled icons.
	 */
	test("every icon-only control names itself in the menu", () => {
		const view = render(
			provider(
				<HeaderOverflow>
					<BackHome />
					<SchemeToggle dark={false} onToggle={() => {}} />
					<ShortcutsHelpButton onClick={() => {}} />
				</HeaderOverflow>,
			),
		);

		fireEvent.click(view.getByRole("button", { name: "More actions" }));
		const menu = view.getByRole("group", { name: "More actions" });

		// Read the names off the rows themselves rather than resolving each
		// control's role: `BackHome` is a link, the other two buttons, and the
		// row wrapper sits between the control and the menu.
		const names = Array.from(
			menu.querySelectorAll(".app-header-overflow__row"),
		).map(
			(row) => row.querySelector(".app-header-action__menulabel")?.textContent,
		);

		expect(names).toEqual([
			"Back to dashboard",
			"Dark mode",
			"Keyboard shortcuts",
		]);
	});

	/**
	 * A control that already carries `children` must not gain a second name from
	 * `menuLabel` — one row, one name, whichever way it was supplied.
	 */
	test("a labelled control does not also render its menu label", () => {
		const view = render(
			provider(
				<HeaderOverflow>
					<HeaderAction label="Install" icon={<span />}>
						Install
					</HeaderAction>
				</HeaderOverflow>,
			),
		);

		fireEvent.click(view.getByRole("button", { name: "More actions" }));
		const menu = view.getByRole("group", { name: "More actions" });
		expect(menu.querySelectorAll(".app-header-action__menulabel")).toHaveLength(
			0,
		);
		expect(menu.textContent).toContain("Install");
	});

	/**
	 * The row rule, matched by shape rather than by one exact selector spelling.
	 *
	 * It has to outrank `.app-header__actions .app-header-action { padding: 0 }` in
	 * the narrow-screen media query, which also matches a menu row. Both are
	 * (0,2,0), so declaration order decides and this rule must come second — which
	 * is why it lives at the end of base.css rather than beside the other overflow
	 * rules.
	 *
	 * The selector is asserted loosely on purpose. It used to be spelled as a pair,
	 * `.app-header-action.app-header-action` plus `a.app-header-action`, to win on
	 * specificity; that was redundant (`HeaderAction` puts the same class list on its
	 * anchor as on its button) and Biome read the mixed weights as a
	 * descending-specificity cascade. These assertions pin the declarations, not the
	 * spelling, so the next person can simplify the selector without having to
	 * rewrite the suite — but a declaration disappearing still fails.
	 */
	const rowRule =
		/\.app-header-overflow__row\s*>\s*\.app-header-action\s*\{([^}]*)\}/;

	/**
	 * One control per line, filling the sheet, with room between icon and name.
	 *
	 * `.app-switcher__menu` is reused by this menu and declared earlier in the
	 * file, so its own `gap` had to be overridden by a two-class selector.
	 */
	test("the menu lays out one full-width row per control", () => {
		expect(baseCss).toMatch(
			/\.app-switcher__menu\.app-header-overflow__menu\s*\{[^}]*gap:\s*6px/,
		);
		// `block` states one control per line; the row is not a flex line that
		// could place two controls side by side.
		expect(baseCss).toMatch(
			/\.app-header-overflow__row\s*\{\s*display:\s*block;\s*\}/,
		);
		const body = baseCss.match(rowRule)?.[1];
		expect(body).toBeDefined();
		// Full width, shrinkable, and a 44px touch target.
		expect(body).toMatch(/width:\s*100%/);
		expect(body).toMatch(/min-width:\s*0/);
		expect(body).toMatch(/min-height:\s*44px/);
		// Icon and name spaced like a list entry, not the bar's 7px.
		expect(body).toMatch(/gap:\s*12px/);
		expect(body).toMatch(/padding:\s*8px 12px/);
	});

	/**
	 * The overflow this replaced: `.app-header-action` sets `white-space: nowrap`
	 * so a bar control's text stays on one line, and on narrow the menu is a
	 * fixed `left: 8px; right: 8px` sheet. A nowrap name therefore pushed the row
	 * past the sheet's edge instead of scrolling, so the row wraps instead.
	 */
	test("a long name wraps instead of overflowing the sheet", () => {
		const body = baseCss.match(rowRule)?.[1];
		expect(body).toMatch(/white-space:\s*normal/);
		// And the icon must not be the thing that shrinks to absorb the wrap.
		expect(baseCss).toMatch(
			/\.app-header-overflow__row\s*>\s*\.app-header-action\s*>\s*svg\s*\{\s*flex:\s*none;\s*\}/,
		);
	});

	test("the name is hidden in the bar and shown only inside the menu", () => {
		// Hidden by default, restored by a rule that names the menu — the same
		// shape as `.app-header-action__label`, which is why one is not enough.
		expect(baseCss).toMatch(
			/\.app-header-action__menulabel\s*\{\s*display:\s*none;\s*\}/,
		);
		expect(baseCss).toMatch(
			/\.app-header-overflow__menu\s+\.app-header-action__menulabel\s*\{\s*display:\s*inline;\s*\}/,
		);
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
