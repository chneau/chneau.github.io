import { axeFragmentOptions } from "./axe-fragment";
import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { type Command, CommandPalette } from "../index";

afterEach(() => cleanup());

const provider = (ui: ReactNode) => <MantineProvider>{ui}</MantineProvider>;

const expectNoViolations = async (container: HTMLElement) => {
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
};

const COMMANDS: Command[] = [
	{
		id: "theme",
		label: "Toggle theme",
		hint: "Appearance",
		keywords: "contrast dark light",
		run: () => {},
	},
	{
		id: "export-ics",
		label: "Export calendar",
		hint: "Birthday",
		keywords: "ics download invite",
		run: () => {},
	},
];

const openPalette = () =>
	render(
		provider(<CommandPalette opened onClose={() => {}} commands={COMMANDS} />),
	);

const activeIdOf = (input: HTMLElement) =>
	input.getAttribute("aria-activedescendant");

/** The DOM id of the nth option, or null so it can be compared to a query. */
const idAt = (options: HTMLElement[], index: number): string | null =>
	options[index]?.id ?? null;

const NATIVE_VALUE = Object.getOwnPropertyDescriptor(
	HTMLInputElement.prototype,
	"value",
)?.set;

/**
 * happy-dom lacks native `input` events, so React falls back to its
 * `propertychange` polyfill: it only notices a value change on
 * `keydown`/`keyup` and needs a preceding `focusin`. Emulate a keystroke so the
 * palette's real `onChange` runs deterministically.
 */
const typeInto = (input: HTMLInputElement, value: string) => {
	fireEvent.focusIn(input);
	NATIVE_VALUE?.call(input, value);
	fireEvent.keyDown(input, { key: "a" });
};

describe("CommandPalette behaviour", () => {
	test("fuzzy match finds a command by its keywords", () => {
		const view = openPalette();
		const input = view.getByRole("combobox") as HTMLInputElement;

		typeInto(input, "contrast");

		// Matched through `keywords`, which is not part of the label.
		expect(view.getByRole("option", { name: /Toggle theme/ })).toBeDefined();
		expect(view.queryByRole("option", { name: /Export calendar/ })).toBeNull();
	});

	test("ArrowDown advances and ArrowUp wraps around both ends", () => {
		const view = openPalette();
		const input = view.getByRole("combobox") as HTMLInputElement;
		const options = view.getAllByRole("option");
		expect(options.length).toBeGreaterThan(2);

		// Focusing primes React's input polyfill before any key event.
		fireEvent.focusIn(input);

		// Starts on the first row.
		expect(activeIdOf(input)).toBe(idAt(options, 0));

		fireEvent.keyDown(input, { key: "ArrowDown" });
		expect(activeIdOf(input)).toBe(idAt(options, 1));

		fireEvent.keyDown(input, { key: "ArrowUp" });
		expect(activeIdOf(input)).toBe(idAt(options, 0));

		// From the first row, ArrowUp wraps to the last one…
		fireEvent.keyDown(input, { key: "ArrowUp" });
		expect(activeIdOf(input)).toBe(idAt(options, options.length - 1));

		// …and ArrowDown from the last row wraps back to the first.
		fireEvent.keyDown(input, { key: "ArrowDown" });
		expect(activeIdOf(input)).toBe(idAt(options, 0));
	});

	test("typing filters the list and clamps the selection", () => {
		const view = openPalette();
		const input = view.getByRole("combobox") as HTMLInputElement;
		fireEvent.focusIn(input);

		// Move the highlight deep into the list first.
		for (let index = 0; index < 5; index += 1) {
			fireEvent.keyDown(input, { key: "ArrowDown" });
		}
		expect(activeIdOf(input)).toBe(idAt(view.getAllByRole("option"), 5));

		typeInto(input, "Toggle theme");

		const filtered = view.getAllByRole("option");
		expect(filtered).toHaveLength(1);
		// The stale index is no longer valid, so it resets to the first match.
		expect(activeIdOf(input)).toBe(idAt(filtered, 0));
	});

	test("has no detectable axe violations while filtered", async () => {
		const view = openPalette();
		const input = view.getByRole("combobox") as HTMLInputElement;
		typeInto(input, "contrast");
		await expectNoViolations(view.baseElement);
	});
});
