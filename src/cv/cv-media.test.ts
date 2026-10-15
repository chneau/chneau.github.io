import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./cv.css", import.meta.url), "utf8");

const mediaBlock = (name: string): string => {
	const start = css.indexOf(`@media ${name}`);
	if (start === -1) throw new Error(`@media ${name} not found in cv.css`);
	const open = css.indexOf("{", start);
	let depth = 0;
	for (let i = open; i < css.length; i++) {
		if (css[i] === "{") depth++;
		else if (css[i] === "}") {
			depth--;
			if (depth === 0) return css.slice(open + 1, i);
		}
	}
	throw new Error(`@media ${name} block is not closed`);
};

const ANIMATED = ["[data-reveal]", ".cv-status-dot::after"];

describe("print media", () => {
	const block = mediaBlock("print");

	test("neutralises the reveal animation with a real selector", () => {
		expect(block).toMatch(/\[data-reveal\]/);
		expect(block).toMatch(/animation:\s*none\s*!important/);
		expect(block).toMatch(/opacity:\s*1\s*!important/);
	});

	test("covers the status dot's infinite ping", () => {
		expect(block).toContain(".cv-status-dot::after");
	});

	test("every animated selector is named in the print block", () => {
		for (const selector of ANIMATED) {
			expect(block).toContain(selector);
		}
	});
});

describe("prefers-reduced-motion", () => {
	const block = mediaBlock("(prefers-reduced-motion: reduce)");

	test("overrides the reveal animation, not just the universal reset", () => {
		expect(block).toMatch(/\[data-reveal\]/);
		expect(block).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
	});

	test("stops the infinite status-dot ping", () => {
		expect(block).toContain(".cv-status-dot::after");
		expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/);
	});

	test("every animated selector is named in the reduced-motion block", () => {
		for (const selector of ANIMATED) {
			expect(block).toContain(selector);
		}
	});
});

describe("the animations under test still exist", () => {
	test("[data-reveal] is still animated in the main cascade", () => {
		expect(css).toMatch(/\[data-reveal\]\s*\{[^}]*animation:\s*cv-rise/);
	});

	test("the universal reset alone is not sufficient", () => {
		const specificityOf = (selector: string): number =>
			selector === "*" ? 0 : selector.startsWith(".") ? 100 : 10;
		expect(specificityOf("*")).toBeLessThan(specificityOf("[data-reveal]"));
	});
});
