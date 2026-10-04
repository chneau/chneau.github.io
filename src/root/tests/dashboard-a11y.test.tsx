import { axeFragmentOptions } from "../../shared/tests/axe-fragment";
import "../../shared/tests/happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import axe from "axe-core";

// Root's `App.tsx` reads the build timestamp from a compile-time global.
(globalThis as unknown as { BUILD_DATE: string }).BUILD_DATE = "30 Sep 2026";

/** React 19 needs the native value setter to see input changes in happy-dom. */
const NATIVE_VALUE = Object.getOwnPropertyDescriptor(
	HTMLInputElement.prototype,
	"value",
)?.set;

afterEach(cleanup);

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

const type = (input: HTMLInputElement, value: string) => {
	fireEvent.focusIn(input);
	NATIVE_VALUE?.call(input, value);
	fireEvent.keyDown(input, { key: "z" });
};

describe("dashboard a11y", () => {
	test("default launcher has no detectable violations", async () => {
		const { App } = await import("../App");
		const view = render(<App />);
		await expectNoViolations(view.baseElement);
	});

	test("empty search state keeps a valid heading order", async () => {
		const { App } = await import("../App");
		const view = render(<App />);
		const input = view.getByLabelText("Search apps") as HTMLInputElement;
		type(input, "zzzzzz");
		// The "Results" section is an `<h2>`, so the EmptyState `<h3>` is valid.
		expect(view.container.querySelector("h2.app-section-title")).not.toBeNull();
		await expectNoViolations(view.baseElement);
	});
});
