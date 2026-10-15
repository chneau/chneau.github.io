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

const idAt = (options: HTMLElement[], index: number): string | null =>
	options[index]?.id ?? null;

const NATIVE_VALUE = Object.getOwnPropertyDescriptor(
	HTMLInputElement.prototype,
	"value",
)?.set;

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

		expect(view.getByRole("option", { name: /Toggle theme/ })).toBeDefined();
		expect(view.queryByRole("option", { name: /Export calendar/ })).toBeNull();
	});

	test("ArrowDown advances and ArrowUp wraps around both ends", () => {
		const view = openPalette();
		const input = view.getByRole("combobox") as HTMLInputElement;
		const options = view.getAllByRole("option");
		expect(options.length).toBeGreaterThan(2);

		fireEvent.focusIn(input);

		expect(activeIdOf(input)).toBe(idAt(options, 0));

		fireEvent.keyDown(input, { key: "ArrowDown" });
		expect(activeIdOf(input)).toBe(idAt(options, 1));

		fireEvent.keyDown(input, { key: "ArrowUp" });
		expect(activeIdOf(input)).toBe(idAt(options, 0));

		fireEvent.keyDown(input, { key: "ArrowUp" });
		expect(activeIdOf(input)).toBe(idAt(options, options.length - 1));

		fireEvent.keyDown(input, { key: "ArrowDown" });
		expect(activeIdOf(input)).toBe(idAt(options, 0));
	});

	test("typing filters the list and clamps the selection", () => {
		const view = openPalette();
		const input = view.getByRole("combobox") as HTMLInputElement;
		fireEvent.focusIn(input);

		for (let index = 0; index < 5; index += 1) {
			fireEvent.keyDown(input, { key: "ArrowDown" });
		}
		expect(activeIdOf(input)).toBe(idAt(view.getAllByRole("option"), 5));

		typeInto(input, "Toggle theme");

		const filtered = view.getAllByRole("option");
		expect(filtered).toHaveLength(1);
		expect(activeIdOf(input)).toBe(idAt(filtered, 0));
	});

	test("has no detectable axe violations while filtered", async () => {
		const view = openPalette();
		const input = view.getByRole("combobox") as HTMLInputElement;
		typeInto(input, "contrast");
		await expectNoViolations(view.baseElement);
	});

	test("options are not tab stops", () => {
		const view = openPalette();
		for (const option of view.getAllByRole("option")) {
			expect(option.getAttribute("tabindex")).toBe("-1");
		}
	});

	test("a query that matches nothing has no listbox to be expanded over", async () => {
		const view = openPalette();
		const input = view.getByRole("combobox") as HTMLInputElement;
		typeInto(input, "zzzzzz");

		expect(view.queryAllByRole("option")).toHaveLength(0);
		expect(view.queryByRole("listbox")).toBeNull();
		expect(input.getAttribute("aria-expanded")).toBe("false");
		expect(input.getAttribute("aria-controls")).toBeNull();
		expect(view.getByRole("status").textContent).toBe("No matches.");
	});
});
