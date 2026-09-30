import "../shared/tests/happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { App } from "./App";

afterEach(() => cleanup());

/**
 * Page-level and layout-dependent rules don't apply to a rendered fragment in
 * a headless DOM, so we silence them and assert on the component-level rules.
 */
const DISABLED_RULES = [
	"color-contrast",
	"page-has-heading-one",
	"landmark-one-main",
	"region",
	"html-has-lang",
	"document-title",
	"bypass",
	"meta-viewport",
];

describe("design gallery a11y", () => {
	test("the living style guide has no detectable violations", async () => {
		const { baseElement } = render(<App />);
		const results = await axe.run(baseElement, {
			rules: Object.fromEntries(
				DISABLED_RULES.map((id) => [id, { enabled: false }]),
			),
		});
		const summary = results.violations.map(
			(violation) =>
				`${violation.id}: ${violation.help} -> ${violation.nodes
					.map((node) => `${node.target.join(" ")} | ${node.html}`)
					.join(", ")}`,
		);
		expect(summary).toEqual([]);
	});
});
