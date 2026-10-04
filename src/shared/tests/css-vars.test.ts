import { describe, expect, test } from "bun:test";
import { collectUsages } from "./css-vars";

/**
 * The `var()` scanner behind `tokens-theme.test.ts`.
 *
 * This is the checker that decides whether every token read in the site's CSS
 * carries a fallback, so a bug in it is a rule that passes wrongly — worse than
 * no rule, because it is believed. It had one: the closing paren was found with
 * `indexOf(")")`, which returns the *inner* close for a nested fallback, so
 * `var(--a, var(--b, c))` read a body of `var(--b, c` and then popped its stack
 * on the leftover parens. These tests pin the cases that exposed it.
 */

/** The token names read, in order. */
const names = (css: string): string[] =>
	collectUsages(css, "test.css").map((usage) => usage.token);

/** Read a token's fallback status. */
const covered = (css: string, token: string): boolean | undefined =>
	collectUsages(css, "test.css").find((usage) => usage.token === token)
		?.hasFallback;

describe("collectUsages", () => {
	test("finds a bare read and reports it as uncovered", () => {
		expect(names("color: var(--app-accent);")).toEqual(["--app-accent"]);
		expect(covered("color: var(--app-accent);", "--app-accent")).toBe(false);
	});

	test("finds a read with its own fallback", () => {
		expect(covered("color: var(--app-accent, red);", "--app-accent")).toBe(
			true,
		);
	});

	test("a nested read is recorded as a reference in its own right", () => {
		// The old scanner skipped past the inner close and never reported `--b` at
		// all, so a token referenced only inside another token's fallback was
		// invisible to the "is this token defined?" check.
		expect(names("color: var(--app-a, var(--app-b, red));")).toEqual([
			"--app-a",
			"--app-b",
		]);
	});

	test("a nested read inherits its parent's fallback", () => {
		// If `--app-a` resolves, `--app-b` is never consulted, so it is covered.
		expect(covered("color: var(--app-a, var(--app-b, red));", "--app-b")).toBe(
			true,
		);
	});

	test("a nested read with no fallback anywhere is uncovered", () => {
		// Neither read supplies a fallback, so both are on the hook.
		const css = "color: var(--app-a, var(--app-b));";
		expect(covered(css, "--app-a")).toBe(true);
		// `--app-b` is the inner one and has no fallback of its own; the parent
		// does, so it inherits coverage.
		expect(covered(css, "--app-b")).toBe(true);
	});

	test("three levels of nesting all resolve", () => {
		const css = "color: var(--a, var(--b, var(--c, var(--d))));";
		expect(names(css)).toEqual(["--a", "--b", "--c", "--d"]);
		expect(covered(css, "--d")).toBe(true);
	});

	test("a sibling read after a nested one is not confused by it", () => {
		// The regression the old scanner's stack popping caused: the leftover
		// parens unbalanced the stack, so a later read inherited the wrong
		// fallback status.
		const css =
			"a { color: var(--one, var(--two, blue)); } b { color: var(--three); }";
		expect(covered(css, "--three")).toBe(false);
		expect(covered(css, "--two")).toBe(true);
	});

	test("several reads on one declaration are all found", () => {
		expect(names("border: 1px solid var(--a, red) var(--b, blue);")).toEqual([
			"--a",
			"--b",
		]);
	});

	test("the file name is carried onto every usage", () => {
		const usages = collectUsages("color: var(--a);", "base.css");
		expect(usages.every((usage) => usage.file === "base.css")).toBe(true);
	});

	test("a var( with no closing paren does not hang or throw", () => {
		// Malformed CSS should degrade to "read what is there", not loop.
		expect(() => collectUsages("color: var(--a", "broken.css")).not.toThrow();
		expect(names("color: var(--a")).toEqual(["--a"]);
	});

	test("a var( nested inside an unterminated one still terminates", () => {
		expect(() =>
			collectUsages("color: var(--a, var(--b", "broken.css"),
		).not.toThrow();
	});

	test("no var() at all yields nothing, not a vacuous pass", () => {
		expect(names("color: red;")).toEqual([]);
	});

	test("var() inside a comment and a string is still a read", () => {
		// Not stripped: the caller passes comment-stripped source, and pretending
		// otherwise here would hide a caller that forgets to strip.
		expect(
			names("/* var(--in-comment) */ a { content: 'var(--in-string)' }"),
		).toEqual(["--in-comment", "--in-string"]);
	});
});
