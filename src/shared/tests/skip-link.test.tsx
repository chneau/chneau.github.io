import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { SkipLink } from "../components/SkipLink";

/**
 * The skip link is the keyboard-only way past the app's chrome, and it is
 * rendered by eight apps on this site. `cv` is the one that supplies its own
 * `tabindex="-1"` on the landmark; the other seven do not, so the component has
 * to make the target focusable itself. Between them these two paths can only be
 * right if the component both injects and preserves — which is what the tests
 * below hold still.
 */

// `cleanup()` unmounts the render and removes its container. Leaving nodes behind
// would put a second `id="main"` in the document for the next file in the shared
// Bun process, and `getElementById` would return whichever it happened to find.
afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
});

/** A landmark with the attributes an app gives it, optionally pre-focusable. */
const mountMain = (tabindex?: string) => {
	document.body.innerHTML = "";
	const main = document.createElement("main");
	main.id = "main";
	if (tabindex !== undefined) main.setAttribute("tabindex", tabindex);
	document.body.append(main);
	return main;
};

describe("SkipLink", () => {
	test("clicking moves focus to the target", () => {
		// Without this the component's whole purpose fails silently: the link
		// scrolls the page but focus stays on the link, so the next Tab returns to
		// the header instead of continuing from the content.
		const main = mountMain();
		render(<SkipLink />);
		fireEvent.click(document.querySelector("a.app-skip-link") ?? main);
		expect(document.activeElement).toBe(main);
	});

	test("the injected tabindex is -1, so the landmark stays out of the tab order", () => {
		// `tabindex="0"` would make the whole of `<main>` a tab stop, which is the
		// opposite of skipping — the link would add a stop rather than remove one.
		const main = mountMain();
		render(<SkipLink />);
		fireEvent.click(document.querySelector("a") ?? main);
		expect(main.getAttribute("tabindex")).toBe("-1");
	});

	test("an existing tabindex is preserved, not clobbered", () => {
		// The cv app supplies `tabindex="-1"` itself. A component that wrote its
		// own value unconditionally would overwrite that; worse, an app that chose
		// `tabindex="0"` deliberately would silently have its choice reversed.
		for (const existing of ["-1", "0"]) {
			const main = mountMain(existing);
			render(<SkipLink />);
			fireEvent.click(document.querySelector("a") ?? main);
			expect(main.getAttribute("tabindex")).toBe(existing);
			expect(document.activeElement).toBe(main);
			cleanup();
			document.body.innerHTML = "";
		}
	});

	test("a target that does not exist is inert: no throw, focus unchanged", () => {
		// A deep link or an app still mounting may render the link before the
		// landmark. Throwing here would take down the whole page over a keyboard
		// affordance that is simply not available yet.
		document.body.innerHTML = "";
		const elsewhere = document.createElement("input");
		document.body.append(elsewhere);
		elsewhere.focus();
		render(<SkipLink targetId="not-rendered-yet" />);
		const link = document.querySelector("a.app-skip-link");
		expect(() => fireEvent.click(link ?? elsewhere)).not.toThrow();
		expect(document.activeElement).toBe(elsewhere);
	});

	test("a custom targetId is honoured in both the href and the focused element", () => {
		// Asserting the href alone is not enough: the component could render the
		// right URL and still focus a hard-coded `main`.
		document.body.innerHTML = "";
		const main = document.createElement("main");
		main.id = "main";
		const content = document.createElement("div");
		content.id = "content";
		document.body.append(main, content);
		render(<SkipLink targetId="content" />);
		const link = document.querySelector("a.app-skip-link");
		expect(link?.getAttribute("href")).toBe("#content");
		fireEvent.click(link ?? content);
		expect(document.activeElement).toBe(content);
		expect(content.getAttribute("tabindex")).toBe("-1");
	});

	test("it does not preventDefault, so the browser also scrolls to the fragment", () => {
		// Deliberate, and the reason this test exists: `preventDefault()` here
		// would kill the native fragment scroll, leaving a keyboard user who has
		// scrolled down (and so has an off-screen landmark) looking at an
		// unchanged page with focus moved to something they cannot see. Focusing
		// alone already scrolls in modern browsers; keeping the default also keeps
		// the behaviour for those where it does not.
		mountMain();
		render(<SkipLink />);
		const link = document.querySelector("a.app-skip-link");
		const event = new MouseEvent("click", { bubbles: true, cancelable: true });
		link?.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
	});

	test("the link is a real anchor with an accessible name, not a bare handler", () => {
		// Keyboard-only means it must be reachable by Tab, which requires an href;
		// the name is what a screen reader announces before the user commits.
		mountMain();
		render(<SkipLink />);
		const link = document.querySelector("a.app-skip-link");
		expect(link?.tagName).toBe("A");
		expect(link?.textContent?.trim()).toBe("Skip to content");
	});
});
