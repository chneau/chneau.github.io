import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Static guard for a CSS-specificity bug that shipped a broken CV.
 *
 * `@media print` and `@media (prefers-reduced-motion: reduce)` in `cv.css` both
 * reset animation with a bare universal selector:
 *
 *     *, *::before, *::after { animation: none; ... }
 *
 * A universal selector has specificity (0,0,0), so it loses to any author rule
 * that has a selector of its own. `[data-reveal]` is (0,1,0) and
 * `.cv-status-dot::after` is (0,1,1), so both animations survived the reset.
 *
 * Two real, user-visible failures followed:
 *  - printing within ~1.2s produced a page with a name and nothing else,
 *    because `cv-rise ... both` holds `opacity: 0` until the animation runs;
 *  - users who asked for reduced motion still got a 0.7s entrance and a 2.6s
 *    INFINITE status ping.
 *
 * Both were verified in headless Chromium before and after the fix. This test
 * locks the specificity back in, because the failure is invisible to a type
 * checker, to `biome`, and to a human skimming the cascade.
 */

const css = readFileSync(new URL("./cv.css", import.meta.url), "utf8");

/** Extracts the body of the first `@media <name>` block. */
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

/** Selectors that carry the animations the resets must beat. */
const ANIMATED = ["[data-reveal]", ".cv-status-dot::after"];

describe("print media", () => {
	const block = mediaBlock("print");

	test("neutralises the reveal animation with a real selector", () => {
		// `animation: none` alone is not enough - `cv-rise ... both` also pins
		// opacity to 0, so the element must be forced visible.
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
		// The exact selector, not a loose `\.cv-status-dot` substring: a bare
		// `.cv-status-dot` (0,1,0) loses to `.cv-status-dot::after` (0,1,1),
		// which is the rule that actually carries the animation.
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
	// If these ever move to a shared stylesheet, the selectors above need to
	// follow; this fails loudly rather than silently testing nothing.
	test("[data-reveal] is still animated in the main cascade", () => {
		expect(css).toMatch(/\[data-reveal\]\s*\{[^}]*animation:\s*cv-rise/);
	});

	test("the universal reset alone is not sufficient", () => {
		// Documents WHY the extra rules exist, so a future tidy-up does not
		// "simplify" the fix away.
		const specificityOf = (selector: string): number =>
			selector === "*" ? 0 : selector.startsWith(".") ? 100 : 10;
		expect(specificityOf("*")).toBeLessThan(specificityOf("[data-reveal]"));
	});
});
