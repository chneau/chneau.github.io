import { axeFragmentOptions } from "../shared/tests/axe-fragment";
import "../shared/tests/happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { App } from "./App";

afterEach(() => cleanup());

describe("design gallery a11y", () => {
	test("the living style guide has no detectable violations", async () => {
		const { baseElement } = render(<App />);
		const results = await axe.run(baseElement, {
			rules: axeFragmentOptions().rules,
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
