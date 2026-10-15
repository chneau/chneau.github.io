import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { FOCUSABLE_SELECTOR, useRovingFocus } from "../hooks/useRovingFocus";

type HarnessProps = {
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
		press("ArrowDown");
		expect(document.activeElement?.textContent).toBe("One");
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

	test("ArrowUp from outside the menu lands on the last control", () => {
		const view = render(
			<Harness>
				{labelled("One")}
				{labelled("Two")}
				{labelled("Three")}
			</Harness>,
		);

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
		expect(document.activeElement?.textContent).toBe("One");
	});

	test("a menu with no controls does not throw", () => {
		render(<Harness>{null}</Harness>);
		expect(() => press("ArrowDown")).not.toThrow();
		expect(() => press("Escape")).not.toThrow();
	});

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
		expect(document.activeElement?.textContent).toBe("Enabled");
	});
});
