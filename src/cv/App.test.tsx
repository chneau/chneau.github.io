import "../shared/tests/happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";

// `BUILD_DATE` is injected by Rsbuild at build time; provide it for the test.
(globalThis as Record<string, unknown>).BUILD_DATE = "";

const { App } = await import("./App");

afterEach(() => cleanup());

describe("CV app landmarks", () => {
	test("hero heading and contacts live inside the main landmark", () => {
		const { container } = render(<App />);
		const main = container.querySelector("main#main");
		expect(main).not.toBeNull();
		expect(main?.getAttribute("tabindex")).toBe("-1");
		expect(main?.querySelector("h1.cv-name")?.textContent).toBe("Charles Neau");
		expect(main?.querySelector(".cv-contact-list")).not.toBeNull();
		expect(container.querySelectorAll("h1")).toHaveLength(1);
	});

	test("the skip link targets the focusable main landmark", () => {
		const { container } = render(<App />);
		const skip = container.querySelector("a.app-skip-link");
		expect(skip?.getAttribute("href")).toBe("#main");
		expect(container.querySelector("main#main")).not.toBeNull();
	});

	test("heading levels never skip", () => {
		const { container } = render(<App />);
		const levels = Array.from(
			container.querySelectorAll("h1, h2, h3, h4, h5, h6"),
		).map((heading) => Number(heading.tagName[1]));
		expect(levels[0]).toBe(1);
		for (let i = 1; i < levels.length; i += 1) {
			const previous = levels[i - 1] ?? 0;
			const current = levels[i] ?? 0;
			expect(current).toBeGreaterThanOrEqual(1);
			expect(current - previous).toBeLessThanOrEqual(1);
		}
	});

	test("skill tags are grouped in a list", () => {
		const { container } = render(<App />);
		const groups = container.querySelectorAll("ul.cv-skill-tags");
		expect(groups.length).toBeGreaterThan(0);
		for (const group of groups) {
			expect(group.querySelectorAll(":scope > li").length).toBeGreaterThan(0);
		}
	});
});
