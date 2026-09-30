import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOKEN_DEFS } from "./tokens";

/**
 * Drift guard for the Design System gallery.
 *
 * The page itself reads every value at runtime; this test pins the *inventory*
 * (and a couple of representative values) against `tokens.css` so adding,
 * renaming or re-valuing a token fails loudly instead of leaving the guide
 * quietly out of date.
 */

const tokensCss = readFileSync(
	join(import.meta.dir, "..", "shared", "tokens.css"),
	"utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

const definitionsIn = (css: string): Map<string, string> => {
	const map = new Map<string, string>();
	for (const match of css.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g)) {
		map.set(match[1] ?? "", (match[2] ?? "").replace(/\s+/g, " ").trim());
	}
	return map;
};

const rootBlock = tokensCss.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const darkBlock =
	tokensCss.match(
		/:root\[data-mantine-color-scheme="dark"\][^{]*\{([\s\S]*?)\n\}/,
	)?.[1] ?? "";

const allTokens = definitionsIn(tokensCss);
const lightTokens = definitionsIn(rootBlock);
const darkTokens = definitionsIn(darkBlock);

/** The guide's own tokens; accent is provided by Mantine, not tokens.css. */
const guideTokens = TOKEN_DEFS.filter((token) => token.category !== "accent")
	.map((token) => token.name)
	.sort();

describe("design gallery token inventory", () => {
	test("the guide lists exactly the tokens declared in tokens.css", () => {
		expect(guideTokens).toEqual([...allTokens.keys()].sort());
	});

	test("every scheme token is declared in both the light and dark layers", () => {
		const schemeTokens = TOKEN_DEFS.filter((token) => token.scheme).map(
			(token) => token.name,
		);
		expect(schemeTokens.length).toBeGreaterThan(10);
		expect(
			schemeTokens.filter(
				(name) => !lightTokens.has(name) || !darkTokens.has(name),
			),
		).toEqual([]);
		expect(
			schemeTokens.filter(
				(name) => lightTokens.get(name) === darkTokens.get(name),
			),
		).toEqual([]);
	});

	test("the guide does not invent tokens tokens.css does not declare", () => {
		expect(guideTokens.filter((name) => !allTokens.has(name))).toEqual([]);
	});

	test("representative token values match tokens.css", () => {
		expect(lightTokens.get("--app-radius-md")).toBe("14px");
		expect(lightTokens.get("--app-speed")).toBe("0.28s");
		expect(lightTokens.get("--app-glass")).toBe("rgba(255, 255, 255, 0.72)");
		expect(darkTokens.get("--app-glass")).toBe("rgba(18, 18, 21, 0.86)");
	});
});
