import { axeFragmentOptions } from "./axe-fragment";
import "./happy-dom";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { BackHome } from "../components/BackHome";
import { SchemeToggle } from "../components/SchemeToggle";
import { ShortcutsHelpButton } from "../components/ShortcutsHelp";
import { HeaderAction, HeaderOverflow } from "../index";

const provider = (node: ReactNode) => <MantineProvider>{node}</MantineProvider>;

const setViewportWidth = (width: number | undefined) => {
	window.matchMedia = mock((query: string) => {
		const maxWidth = /\(\s*max-width:\s*(\d+)px\s*\)/.exec(query);
		const minWidth = /\(\s*min-width:\s*(\d+)px\s*\)/.exec(query);
		const matches =
			width === undefined
				? false
				: (maxWidth === null || width <= Number(maxWidth[1])) &&
					(minWidth === null || width >= Number(minWidth[1]));
		return {
			matches,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		};
	}) as unknown as typeof window.matchMedia;
};

const NARROW = 800;
const WIDE = 1280;

const setNarrow = () => setViewportWidth(NARROW);
const setWide = () => setViewportWidth(WIDE);

const originalMatchMedia = window.matchMedia;

const baseCss = (
	await Bun.file(join(import.meta.dir, "..", "base.css")).text()
).replace(/\/\*[\s\S]*?\*\//g, "");

beforeEach(() => setNarrow());
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

		expect(view.queryAllByRole("button")).toHaveLength(1);
		const trigger = view.getByRole("button", { name: "More actions" });
		expect(trigger.getAttribute("aria-expanded")).toBe("false");

		fireEvent.click(trigger);
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		expect(view.getByRole("group", { name: "More actions" })).toBeDefined();
		expect(view.getByRole("button", { name: "Settings" })).toBeDefined();
		expect(view.getByRole("button", { name: "Copy a link" })).toBeDefined();
	});

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
		fireEvent.keyDown(document.activeElement as HTMLElement, {
			key: "ArrowDown",
		});
		expect(document.activeElement?.getAttribute("aria-label")).toBe("One");
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

	const rowRule =
		/\.app-header-overflow__row\s*>\s*\.app-header-action\s*\{([^}]*)\}/;

	test("the menu lays out one full-width row per control", () => {
		expect(baseCss).toMatch(
			/\.app-switcher__menu\.app-header-overflow__menu\s*\{[^}]*gap:\s*6px/,
		);
		expect(baseCss).toMatch(
			/\.app-header-overflow__row\s*\{\s*display:\s*block;\s*\}/,
		);
		const body = baseCss.match(rowRule)?.[1];
		expect(body).toBeDefined();
		expect(body).toMatch(/width:\s*100%/);
		expect(body).toMatch(/min-width:\s*0/);
		expect(body).toMatch(/min-height:\s*44px/);
		expect(body).toMatch(/gap:\s*12px/);
		expect(body).toMatch(/padding:\s*8px 12px/);
	});

	test("a long name wraps instead of overflowing the sheet", () => {
		const body = baseCss.match(rowRule)?.[1];
		expect(body).toMatch(/white-space:\s*normal/);
		expect(baseCss).toMatch(
			/\.app-header-overflow__row\s*>\s*\.app-header-action\s*>\s*svg\s*\{\s*flex:\s*none;\s*\}/,
		);
	});

	test("the name is hidden in the bar and shown only inside the menu", () => {
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
			rules: axeFragmentOptions().rules,
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
		setWide();
		const view = render(
			provider(
				<HeaderOverflow>
					<HeaderAction label="Settings" icon={<span />} />
					<HeaderAction label="Copy a link" icon={<span />} />
				</HeaderOverflow>,
			),
		);

		expect(view.queryByRole("button", { name: "More actions" })).toBeNull();
		expect(view.getByRole("button", { name: "Settings" })).toBeDefined();
		expect(view.getByRole("button", { name: "Copy a link" })).toBeDefined();
		expect(view.container.querySelector(".app-header-overflow")).toBeNull();
	});

	test("a narrow viewport paints the trigger, not the overflowing bar", () => {
		setNarrow();
		const html = renderToString(
			provider(
				<HeaderOverflow>
					<HeaderAction label="Settings" icon={<span />} />
				</HeaderOverflow>,
			),
		);

		expect(html).toContain("More actions");
		expect(html).not.toContain("Settings");
	});

	test("a wide viewport paints its children inline, not the trigger", () => {
		setWide();
		const html = renderToString(
			provider(
				<HeaderOverflow>
					<HeaderAction label="Settings" icon={<span />} />
				</HeaderOverflow>,
			),
		);

		expect(html).toContain("Settings");
		expect(html).not.toContain("More actions");
	});

	test("the breakpoint is 1100px", () => {
		setViewportWidth(1101);
		const wide = render(
			provider(
				<HeaderOverflow>
					<HeaderAction label="Settings" icon={<span />} />
				</HeaderOverflow>,
			),
		);
		expect(wide.queryByRole("button", { name: "More actions" })).toBeNull();
		cleanup();

		setViewportWidth(1099);
		const narrow = render(
			provider(
				<HeaderOverflow>
					<HeaderAction label="Settings" icon={<span />} />
				</HeaderOverflow>,
			),
		);
		expect(
			narrow.queryByRole("button", { name: "More actions" }),
		).toBeDefined();
	});
});
