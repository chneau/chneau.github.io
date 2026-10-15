import { describe, expect, test } from "bun:test";
import { collectUsages } from "./css-vars";

const names = (css: string): string[] =>
	collectUsages(css, "test.css").map((usage) => usage.token);

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
		expect(names("color: var(--app-a, var(--app-b, red));")).toEqual([
			"--app-a",
			"--app-b",
		]);
	});

	test("a nested read inherits its parent's fallback", () => {
		expect(covered("color: var(--app-a, var(--app-b, red));", "--app-b")).toBe(
			true,
		);
	});

	test("a nested read with no fallback anywhere is uncovered", () => {
		const css = "color: var(--app-a, var(--app-b));";
		expect(covered(css, "--app-a")).toBe(true);
		expect(covered(css, "--app-b")).toBe(true);
	});

	test("three levels of nesting all resolve", () => {
		const css = "color: var(--a, var(--b, var(--c, var(--d))));";
		expect(names(css)).toEqual(["--a", "--b", "--c", "--d"]);
		expect(covered(css, "--d")).toBe(true);
	});

	test("a sibling read after a nested one is not confused by it", () => {
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
		expect(
			names("/* var(--in-comment) */ a { content: 'var(--in-string)' }"),
		).toEqual(["--in-comment", "--in-string"]);
	});
});
