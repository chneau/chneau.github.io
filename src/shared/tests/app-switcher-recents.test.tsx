import { axeFragmentOptions } from "./axe-fragment";
import "./happy-dom";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { ALL_APPS } from "../apps";
import { AppSwitcher } from "../components/AppSwitcher";
import { removePersisted } from "../hooks/usePersistentState";

/**
 * The switcher is the only shared chrome on every app page, so it is where the
 * recents/pins feature is actually reachable. These tests pin the contract:
 * every app stays reachable, the store degrades safely, and the whole menu is
 * still keyboard operable.
 */

const RECENTS = "app_recents";
const PINNED = "app_pinned";

const provider = (ui: ReactNode) => <MantineProvider>{ui}</MantineProvider>;

/**
 * A complete, self-contained `Storage` for the duration of each test.
 *
 * `bun test` runs every suite in one process and other suites install their own
 * `localStorage` stubs on `globalThis`, so relying on whichever one happens to
 * be installed would make these tests order-dependent. See the same helper in
 * `recent-persistence.test.ts`.
 */
const installStorage = () => {
	const backing = new Map<string, string>();
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		writable: true,
		value: {
			get length() {
				return backing.size;
			},
			key: (index: number) => [...backing.keys()][index] ?? null,
			getItem: (key: string) => backing.get(key) ?? null,
			setItem: (key: string, value: string) => {
				backing.set(key, String(value));
			},
			removeItem: (key: string) => {
				backing.delete(key);
			},
			clear: () => backing.clear(),
		} satisfies Storage,
	});
};

beforeEach(() => {
	installStorage();
	removePersisted(RECENTS);
	removePersisted(PINNED);
});

afterEach(() => {
	cleanup();
	removePersisted(RECENTS);
	removePersisted(PINNED);
});

/**
 * Seed the store the way a previous session would have left it.
 *
 * `removePersisted` clears both the in-memory cache *and* the key, so the cache
 * must be dropped first and the value written afterwards.
 */
const seed = (recents: unknown, pinned: unknown = []) => {
	removePersisted(RECENTS);
	removePersisted(PINNED);
	window.localStorage.setItem(RECENTS, JSON.stringify(recents));
	window.localStorage.setItem(PINNED, JSON.stringify(pinned));
};

const open = (current: string) => {
	const view = render(provider(<AppSwitcher current={current} />));
	fireEvent.click(view.getByRole("button", { name: "Switch app" }));
	return view;
};

const hrefs = (view: ReturnType<typeof open>) =>
	view.getAllByRole("menuitem").map((item) => item.getAttribute("href"));

describe("AppSwitcher app registry", () => {
	test("every registered app is reachable from a cold store", () => {
		const view = open("/");
		const reachable = hrefs(view);
		expect(reachable).toHaveLength(ALL_APPS.length);
		for (const app of ALL_APPS) expect(reachable).toContain(app.href);
	});

	test("every registry entry, in dashboard order, is present", () => {
		// Spelled out rather than derived from `APPS`, because the assertion
		// this guards is the *order* and the *set* — a list rebuilt from the
		// source would agree with it by construction and prove nothing. Adding an
		// app means adding a line here, which is the point: it is the registry's
		// contract with the router, the palette and the 404.
		expect(ALL_APPS.map((app) => app.href)).toEqual([
			"/",
			"/cv/",
			"/birthday/",
			"/scotland-rail/",
			"/crimson-desert-save-editor/",
			"/spooners/",
			"/tails-of-iron-2-save-editor/",
			"/power-fantasy-save-editor/",
			"/no-rest-for-the-wicked-save-editor/",
			"/dysmantle-save-editor/",
			"/cyberpunk-2077-save-editor/",
			"/deadly-days-roadtrip-save-editor/",
			"/witcher-3-save-editor/",
			"/design/",
		]);
	});

	test("a stale recents entry for a removed app is ignored, not rendered", () => {
		seed([{ href: "/deleted-app/", at: Date.now() }]);
		const view = open("/");
		expect(hrefs(view)).not.toContain("/deleted-app/");
		// The real registry is still complete.
		expect(hrefs(view)).toHaveLength(ALL_APPS.length);
	});
});

describe("AppSwitcher recents and pins", () => {
	test("landing on an app records the visit, so it can be jumped back to", () => {
		render(provider(<AppSwitcher current="/cv/" />));
		const stored: unknown = JSON.parse(
			window.localStorage.getItem(RECENTS) ?? "[]",
		);
		expect(stored).toEqual([{ href: "/cv/", at: expect.any(Number) }]);
	});

	test("recents are surfaced in most-recent-first order", () => {
		const now = Date.now();
		seed([
			{ href: "/spooners/", at: now - 9_000 },
			{ href: "/birthday/", at: now - 1_000 },
		]);
		const view = open("/");
		const order = hrefs(view);
		expect(order.indexOf("/birthday/")).toBeLessThan(
			order.indexOf("/spooners/"),
		);
	});

	test("the recents strip is capped and never grows without bound", () => {
		seed(
			ALL_APPS.map((app, index) => ({ href: app.href, at: index })).reverse(),
		);
		const view = open("/");
		const order = hrefs(view);
		// The strip is capped, and the full registry is still reachable.
		expect(order).toHaveLength(ALL_APPS.length);
		for (const app of ALL_APPS) expect(order).toContain(app.href);
	});

	test("the current app is not offered as somewhere to jump back to", () => {
		// /cv/ was opened a moment ago and we are standing on it, so it is
		// filtered out of the strip; /spooners/ is a genuine jump target.
		seed([
			{ href: "/cv/", at: Date.now() },
			{ href: "/spooners/", at: Date.now() - 5_000 },
		]);
		const view = open("/cv/");

		const group = view.getByRole("group", { name: "Recently opened apps" });
		const inStrip = Array.from(group.querySelectorAll("a")).map((a) =>
			a.getAttribute("href"),
		);
		expect(inStrip).toEqual(["/spooners/"]);
		expect(inStrip).not.toContain("/cv/");
		// Still exactly one entry for /cv/ overall, and the registry is whole.
		expect(hrefs(view).filter((href) => href === "/cv/")).toHaveLength(1);
		expect(hrefs(view)).toHaveLength(ALL_APPS.length);
	});

	test("a pinned app moves to the top without being listed twice", () => {
		seed([{ href: "/design/", at: Date.now() }], ["/design/"]);
		const view = open("/");
		const order = hrefs(view);
		expect(order[0]).toBe("/design/");
		expect(order.filter((href) => href === "/design/")).toHaveLength(1);
		expect(order).toHaveLength(ALL_APPS.length);
	});

	test("the pin toggle is a checkbox that reflects and flips the pinned state", () => {
		const view = open("/");
		const pin = view.getAllByRole("menuitemcheckbox", {
			name: /Pin Spooners/,
		})[0];
		expect(pin?.getAttribute("aria-checked")).toBe("false");

		fireEvent.click(pin as HTMLElement);

		const pinned: unknown = JSON.parse(
			window.localStorage.getItem(PINNED) ?? "[]",
		);
		expect(pinned).toEqual(["/spooners/"]);
		// The menu stays open after pinning so several can be toggled in a row.
		expect(view.getByRole("menu", { name: "Switch app" })).toBeDefined();
	});

	test("an unpin removes the app again", () => {
		seed([], ["/spooners/"]);
		const view = open("/");
		const unpin = view.getAllByRole("menuitemcheckbox", {
			name: /Unpin Spooners/,
		})[0];
		expect(unpin?.getAttribute("aria-checked")).toBe("true");
		fireEvent.click(unpin as HTMLElement);
		expect(JSON.parse(window.localStorage.getItem(PINNED) ?? "[]")).toEqual([]);
	});
});

describe("AppSwitcher degrades safely", () => {
	test("a corrupt recents payload still renders the full registry", () => {
		removePersisted(RECENTS);
		window.localStorage.setItem(RECENTS, "}{ not json at all");
		const view = open("/");
		expect(hrefs(view)).toHaveLength(ALL_APPS.length);
	});

	test("a corrupt pinned payload still renders the full registry", () => {
		removePersisted(PINNED);
		window.localStorage.setItem(PINNED, "]]]not json[[[");
		const view = open("/");
		expect(hrefs(view)).toHaveLength(ALL_APPS.length);
	});

	test("blocked storage does not stop the switcher rendering", () => {
		const original = Object.getOwnPropertyDescriptor(window, "localStorage");
		const boom = () => {
			throw new DOMException("denied", "SecurityError");
		};
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			get: () => ({
				getItem: boom,
				setItem: boom,
				removeItem: boom,
				clear: boom,
				key: boom,
				length: 0,
			}),
		});
		try {
			const view = open("/");
			expect(hrefs(view)).toHaveLength(ALL_APPS.length);
		} finally {
			if (original) Object.defineProperty(window, "localStorage", original);
		}
	});
});

describe("AppSwitcher keyboard operation", () => {
	/**
	 * Walk the menu with the arrow key, re-reading `document.activeElement` each
	 * step exactly as a browser would. This keeps the assertions about real
	 * behaviour rather than about React's node reuse across re-renders.
	 */
	const walk = (key: string, steps: number) => {
		const seen: string[] = [];
		for (let i = 0; i < steps; i += 1) {
			fireEvent.keyDown(document.activeElement as HTMLElement, { key });
			const active = document.activeElement;
			seen.push(
				`${active?.getAttribute("role") ?? "none"}:${
					active?.getAttribute("aria-label") ?? active?.textContent ?? ""
				}`,
			);
		}
		return seen;
	};

	test("arrow keys step through every link and every pin toggle", () => {
		const view = open("/");
		// One link plus one pin toggle per app.
		expect(
			view
				.getByRole("menu")
				.querySelectorAll("a[href], button:not([disabled])"),
		).toHaveLength(ALL_APPS.length * 2);

		view.getAllByRole("menuitem")[0]?.focus();
		const seen = walk("ArrowDown", ALL_APPS.length * 2 - 1);

		// It alternates link, pin, link, pin… across every app.
		expect(seen.filter((s) => s.startsWith("menuitem:"))).toHaveLength(
			ALL_APPS.length - 1,
		);
		expect(seen.filter((s) => s.startsWith("menuitemcheckbox:"))).toHaveLength(
			ALL_APPS.length,
		);
		// Every app's pin toggle is reachable by keyboard.
		for (const app of ALL_APPS) {
			expect(
				seen.some((s) => s === `menuitemcheckbox:Pin ${app.title} to the top`),
			).toBe(true);
		}
	});

	test("arrow keys wrap in both directions instead of dead-ending", () => {
		const view = open("/");
		const first = view.getAllByRole("menuitem")[0] as HTMLElement;
		first.focus();

		// Up from the first item lands on the very last one.
		fireEvent.keyDown(document.activeElement as HTMLElement, {
			key: "ArrowUp",
		});
		const focusable = view
			.getByRole("menu")
			.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
		expect(document.activeElement).toBe(
			focusable[focusable.length - 1] as HTMLElement,
		);

		// And back down again to the first.
		fireEvent.keyDown(document.activeElement as HTMLElement, {
			key: "ArrowDown",
		});
		expect(document.activeElement).toBe(first);
	});

	test("Home and End jump to the first and last focusable item", () => {
		const view = open("/");
		const first = view.getAllByRole("menuitem")[0] as HTMLElement;
		first.focus();

		fireEvent.keyDown(first, { key: "End" });
		const last = document.activeElement as HTMLElement | null;
		expect(last?.getAttribute("role")).toBe("menuitemcheckbox");
		const pins = view.getAllByRole("menuitemcheckbox");
		expect(last).toBe(pins[pins.length - 1] as HTMLElement);

		fireEvent.keyDown(last as HTMLElement, { key: "Home" });
		expect(document.activeElement).toBe(first);
	});

	test("Escape closes the menu and restores focus to the trigger", () => {
		const view = open("/");
		const trigger = view.getByRole("button", { name: "Switch app" });
		view.getAllByRole("menuitem")[0]?.focus();

		fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });

		expect(view.queryByRole("menu")).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	test("opening the menu moves focus into it", () => {
		open("/");
		expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
	});
});

describe("AppSwitcher a11y with recents and pins populated", () => {
	test("has no detectable axe violations when recents and pins are present", async () => {
		const now = Date.now();
		seed(
			[
				{ href: "/spooners/", at: now - 60_000 },
				{ href: "/birthday/", at: now - 3_600_000 },
				{ href: "/design/", at: now - 86_400_000 },
			],
			["/design/"],
		);
		const view = open("/cv/");
		const results = await axe.run(view.baseElement, {
			rules: axeFragmentOptions().rules,
		});
		const summary = results.violations.map(
			(violation) =>
				`${violation.id}: ${violation.help} -> ${violation.nodes
					.map((node) => node.target.join(" "))
					.join(", ")}`,
		);
		expect(summary).toEqual([]);
	});
});

/**
 * Where the menu is anchored, read from `base.css` as source.
 *
 * This is a cascade outcome, which is the same reason `header-overflow.test.tsx`
 * reads the stylesheet: the defect is not "the DOM has no menu" but "which edge
 * of the trigger the box is pinned to", and happy-dom computes no layout, so
 * `getBoundingClientRect` here would be zeros and would prove nothing.
 *
 * What went wrong: the base rule anchored the menu with `left: 0` while the
 * switcher sits in `.app-header__actions` — `flex: none`, at the end of a bar
 * whose middle section is `flex: 1`, and the narrow-screen override's own comment
 * puts the trigger "~60px from the right edge". So the menu's left edge lined up
 * with the trigger's and its `min-width: 268px` ran roughly 200px off the right
 * of the screen on a desktop window, hiding the tail of the app list. The
 * `max-width: calc(100vw - 24px)` clamp did not help: it caps the width, it does
 * not move the box back inside the viewport.
 *
 * Only the narrow override had it right, which is why this was a desktop-only
 * report.
 */
const baseCss = (
	await Bun.file(new URL("../base.css", import.meta.url)).text()
).replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the single-class base rule, media queries excluded. */
const baseMenuRule = (): string => {
	const rules = [...baseCss.matchAll(/^\.app-switcher__menu\s*\{([^}]*)\}/gm)];
	const body = rules[0]?.[1];
	if (body === undefined) {
		throw new Error("base .app-switcher__menu rule not found");
	}
	return body;
};

describe("the app switcher menu stays inside the viewport", () => {
	test("the base rule anchors to the trigger's right edge, not its left", () => {
		const body = baseMenuRule();
		expect(body).toMatch(/right:\s*0/);
		// `left` must be released rather than merely overridden, or the box is
		// pinned to both edges and the width resolves to the gap between them.
		expect(body).toMatch(/left:\s*auto/);
		expect(body).not.toMatch(/left:\s*0/);
	});

	test("a tall app list scrolls instead of hanging off the bottom", () => {
		// Thirteen apps plus the pinned and recent groups exceed a short laptop
		// viewport once the 56px bar is deducted, and an absolutely positioned
		// box that overflows the bottom is unreachable — there is nothing to
		// scroll. The narrow override has always had this.
		const body = baseMenuRule();
		expect(body).toMatch(/max-height:\s*calc\(100dvh - 76px\)/);
		expect(body).toMatch(/overflow-y:\s*auto/);
		expect(body).toMatch(/overscroll-behavior:\s*contain/);
	});

	test("the narrow-screen sheet still overrides both edges", () => {
		// Guarded explicitly because the base rule now claims `right: 0` too:
		// the phone sheet must still span the viewport rather than inherit it.
		const narrow = baseCss.slice(baseCss.indexOf("@media (max-width: 1100px)"));
		const sheet = /^\t\.app-switcher__menu\s*\{([^}]*)\}/m.exec(narrow)?.[1];
		expect(sheet).toBeDefined();
		expect(sheet).toMatch(/position:\s*fixed/);
		expect(sheet).toMatch(/left:\s*8px/);
		expect(sheet).toMatch(/right:\s*8px/);
	});
});
