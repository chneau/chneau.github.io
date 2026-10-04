import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { FOCUSABLE_SELECTOR, useRovingFocus } from "../hooks/useRovingFocus";

/**
 * The keyboard contract shared by `AppSwitcher` and `HeaderOverflow`.
 *
 * Both menus used to carry their own copy of a ~25-line arrow-key handler, and
 * they had already drifted: the switcher queried `a[href], button:not([disabled])`
 * while the overflow menu queried `a, button`. So the same key press moved focus
 * differently depending on which menu was open, an anchor with no `href` and a
 * disabled button counted as focusable in one and not the other, and `ArrowUp`
 * from a position outside the menu landed on the second-to-last item rather than
 * the last — in both, because the arithmetic was copied along with the bug.
 *
 * The component tests in `app-switcher-recents.test.tsx` and
 * `header-overflow.test.tsx` cover each menu through its own DOM. This covers the
 * shared behaviour directly, including the cases only one of the two used to get
 * right.
 */

type HarnessProps = {
	/** Rendered inside the menu, so a test can choose the exact control mix. */
	children?: React.ReactNode;
};

let api: {
	onKeyDown: (event: React.KeyboardEvent<Element>) => void;
	focusFirst: () => void;
} | null = null;

const Harness = ({ children }: HarnessProps) => {
	const menu = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const hook = useRovingFocus({
		menuRef: menu,
		close: (restoreFocus = false) => {
			if (restoreFocus) trigger.current?.focus();
		},
	});
	// Published in an effect, not during render. Assigning a module-level variable
	// in the render body is a side effect React is free to run twice or discard,
	// which is exactly what a concurrent render would do with it — and
	// react-doctor flags it as a prop callback invoked during render.
	//
	// Keyed on the two stable callbacks rather than `hook`, whose object identity
	// is new on every render, so this cannot loop.
	useEffect(() => {
		api = hook;
	}, [hook.focusFirst, hook.onKeyDown]);
	return (
		<div>
			<button ref={trigger} type="button">
				trigger
			</button>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the keydown handler is the thing under test, and this is the shape both menus actually use - AppSwitcher renders a div with role="menu" and HeaderOverflow a fieldset */}
			<div
				ref={menu}
				data-testid="menu"
				tabIndex={-1}
				onKeyDown={hook.onKeyDown}
			>
				{children}
			</div>
		</div>
	);
};

/** Fire a key on the element that currently has focus, as a real key press would. */
const press = (key: string) => {
	const target = document.activeElement ?? document.body;
	act(() => {
		target.dispatchEvent(
			new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
		);
	});
};

const labelled = (label: string) => (
	<button type="button" onClick={() => {}}>
		{label}
	</button>
);

afterEach(() => {
	cleanup();
	api = null;
});

describe("useRovingFocus", () => {
	test("arrow keys step through the controls and wrap at both ends", () => {
		render(
			<Harness>
				{labelled("One")}
				{labelled("Two")}
				{labelled("Three")}
			</Harness>,
		);
		act(() => api?.focusFirst());
		expect(document.activeElement?.textContent).toBe("One");

		press("ArrowDown");
		expect(document.activeElement?.textContent).toBe("Two");
		press("ArrowDown");
		expect(document.activeElement?.textContent).toBe("Three");
		// Down from the last wraps to the first.
		press("ArrowDown");
		expect(document.activeElement?.textContent).toBe("One");
		// And up from the first wraps to the last.
		press("ArrowUp");
		expect(document.activeElement?.textContent).toBe("Three");
	});

	test("Home and End reach the first and last control", () => {
		render(
			<Harness>
				{labelled("One")}
				{labelled("Two")}
				{labelled("Three")}
			</Harness>,
		);
		act(() => api?.focusFirst());

		press("End");
		expect(document.activeElement?.textContent).toBe("Three");
		press("Home");
		expect(document.activeElement?.textContent).toBe("One");
	});

	/**
	 * PROVE IT FAILS WITHOUT THE `at < 0` GUARD.
	 *
	 * `indexOf` answers −1 when focus is outside the menu, which is what happens on
	 * the first key press after a menu reopens. The old arithmetic used that −1
	 * directly, so `ArrowUp` computed `items[-2 + length]` and focused the
	 * *second-to-last* item — skipping the last one entirely.
	 */
	test("ArrowUp from outside the menu lands on the last control", () => {
		const view = render(
			<Harness>
				{labelled("One")}
				{labelled("Two")}
				{labelled("Three")}
			</Harness>,
		);

		// Focus is on the menu container rather than on any of its controls, so
		// `indexOf` answers −1. This is the reachable case: the handler is on the
		// menu, so a key press from outside it would never arrive here at all.
		const menu = view.getByTestId("menu");
		act(() => menu.focus());
		expect(document.activeElement).toBe(menu);

		press("ArrowUp");
		expect(document.activeElement?.textContent).toBe("Three");
	});

	test("ArrowDown from outside the menu lands on the first control", () => {
		const view = render(
			<Harness>
				{labelled("One")}
				{labelled("Two")}
			</Harness>,
		);
		act(() => view.getByTestId("menu").focus());
		press("ArrowDown");
		expect(document.activeElement?.textContent).toBe("One");
	});

	test("Escape restores focus to the trigger", () => {
		render(<Harness>{labelled("One")}</Harness>);
		act(() => api?.focusFirst());
		expect(document.activeElement?.textContent).toBe("One");

		press("Escape");
		expect(document.activeElement?.textContent).toBe("trigger");
	});

	test("Tab closes without stealing focus", () => {
		// Tab must be allowed to do what Tab does. The handler closes the menu and
		// does not preventDefault, so the browser moves focus on its own.
		render(<Harness>{labelled("One")}</Harness>);
		act(() => api?.focusFirst());

		const event = new KeyboardEvent("keydown", {
			key: "Tab",
			bubbles: true,
			cancelable: true,
		});
		act(() => {
			document.activeElement?.dispatchEvent(event);
		});
		expect(event.defaultPrevented).toBe(false);
	});

	test("a key it does not handle is left entirely alone", () => {
		render(
			<Harness>
				{labelled("One")}
				{labelled("Two")}
			</Harness>,
		);
		act(() => api?.focusFirst());

		for (const key of ["Enter", " ", "a", "PageDown"]) {
			const event = new KeyboardEvent("keydown", {
				key,
				bubbles: true,
				cancelable: true,
			});
			act(() => {
				document.activeElement?.dispatchEvent(event);
			});
			expect(event.defaultPrevented, key).toBe(false);
		}
		// Focus did not move for any of them.
		expect(document.activeElement?.textContent).toBe("One");
	});

	test("a menu with no controls does not throw", () => {
		render(<Harness>{null}</Harness>);
		expect(() => press("ArrowDown")).not.toThrow();
		expect(() => press("Escape")).not.toThrow();
	});

	/**
	 * The selector is the divergence this hook exists to end.
	 *
	 * `HeaderOverflow` used `a, button`, which counts an anchor with no `href` (not
	 * focusable, not a link) and a disabled button (not focusable) as places focus
	 * can go. Asserted directly so the query cannot drift back to tag names.
	 */
	test("FOCUSABLE_SELECTOR skips anchors without href and disabled buttons", () => {
		const view = render(
			<Harness>
				<a href="/one/">One</a>
				{/* biome-ignore lint/a11y/useValidAnchor: an hrefless anchor is exactly what the selector is under test against */}
				<a>No href</a>
				<button type="button" disabled>
					Disabled
				</button>
				{labelled("Enabled")}
			</Harness>,
		);

		const focusable = Array.from(
			view
				.getByTestId("menu")
				.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
		);
		expect(focusable.map((node) => node.textContent)).toEqual([
			"One",
			"Enabled",
		]);
	});

	test("roving focus visits exactly the focusable controls", () => {
		render(
			<Harness>
				<a href="/one/">One</a>
				{/* biome-ignore lint/a11y/useValidAnchor: an hrefless anchor is exactly what the selector is under test against */}
				<a>No href</a>
				<button type="button" disabled>
					Disabled
				</button>
				{labelled("Enabled")}
			</Harness>,
		);

		act(() => api?.focusFirst());
		expect(document.activeElement?.textContent).toBe("One");
		press("ArrowDown");
		// Skips the hrefless anchor and the disabled button entirely.
		expect(document.activeElement?.textContent).toBe("Enabled");
	});
});
