import { describe, expect, test } from "bun:test";
import { join } from "node:path";

/**
 * Drift guard for the design tokens inlined into the static fallback pages.
 *
 * `public/404.html` and `public/offline.html` are served by GitHub Pages (and
 * by the service worker) without the app bundle, so they carry their own copy
 * of the `--app-*` tokens. Nothing type-checks that copy, so it drifts silently
 * from `src/shared/tokens.css`. This test pins each inlined declaration to the
 * value the same token has in the stylesheet, comparing light against light and
 * dark against dark (the pages carry both schemes).
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (relative: string) => Bun.file(join(ROOT, relative)).text();

/** Strip block comments so a commented-out declaration never counts. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

type TokenDef = { name: string; value: string };

/**
 * Collapse quote and whitespace noise so a font stack wrapped over several
 * lines compares as the single value it renders as.
 */
const normalise = (value: string) =>
	value
		.replace(/["']/g, '"')
		.replace(/\s*,\s*/g, ", ")
		.replace(/\s+/g, " ")
		.trim();

/** Every `--app-*: value;` declaration in a block, value normalised. */
const declarationsIn = (css: string): TokenDef[] =>
	[
		...stripComments(css).matchAll(/(--app-[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g),
	].map((match) => ({
		name: match[1] ?? "",
		value: normalise(match[2] ?? ""),
	}));

/** Value of each `--app-*` token declared in a block, keyed by name. */
const tokenMap = (block: string): Map<string, string> =>
	new Map(declarationsIn(block).map((def) => [def.name, def.value]));

/* ── tokens.css expectations ──────────────────────────────────────────── */

const cleanTokens = stripComments(await read("src/shared/tokens.css"));

const stylesheet = {
	light: tokenMap(cleanTokens.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? ""),
	dark: tokenMap(
		cleanTokens.match(
			/:root\[data-mantine-color-scheme="dark"\][^{]*\{([\s\S]*?)\n\}/,
		)?.[1] ?? "",
	),
};

/* ── page expectations ────────────────────────────────────────────────── */

/**
 * The plain `:root { … }` block (light scheme). The dark blocks start with
 * `:root:`/`:root[`, so anchoring on `:root {` skips them.
 */
const lightBlock = (html: string) =>
	stripComments(html).match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";

/**
 * The two dark blocks per page (OS media query and explicit attribute toggle).
 * Their declarations collapse into one map, which also pins the duplicate copy.
 */
const darkMap = (html: string): Map<string, string> => {
	const blocks = [
		...stripComments(html).matchAll(
			/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}|:root\[data-theme="dark"\]\s*\{([^}]*)\}/g,
		),
	];
	return tokenMap(blocks.flatMap((m) => [m[1] ?? m[2] ?? ""]).join("\n"));
};

const pages = [
	{ file: "public/404.html", source: await read("public/404.html") },
	{ file: "public/offline.html", source: await read("public/offline.html") },
];

/** The minimum number of shared tokens that proves the comparison is real. */
const MIN_SHARED = 5;

/** Every page declaration whose normalised value disagrees with tokens.css. */
const driftIn = (file: string, source: string) => {
	const found: {
		file: string;
		line: number;
		scheme: "light" | "dark";
		token: string;
		pageValue: string;
		cssValue: string;
	}[] = [];
	const check = (
		scheme: "light" | "dark",
		decls: Map<string, string>,
		expected: Map<string, string>,
	) => {
		for (const [token, pageValue] of decls) {
			const cssValue = expected.get(token);
			if (cssValue === undefined || cssValue === pageValue) continue;
			const line =
				source.split("\n").findIndex((text) => text.includes(`${token}:`)) + 1;
			found.push({ file, line, scheme, token, pageValue, cssValue });
		}
	};
	check("light", tokenMap(lightBlock(source)), stylesheet.light);
	check("dark", darkMap(source), stylesheet.dark);
	return found;
};

describe("static fallback pages mirror the design tokens", () => {
	for (const { file, source } of pages) {
		test(`${file} declares tokens that also exist in tokens.css`, () => {
			// A missing block or a changed prefix would otherwise compare nothing
			// and pass vacuously.
			const shared = [
				...tokenMap(lightBlock(source)).keys(),
				...darkMap(source).keys(),
			].filter(
				(name) => stylesheet.light.has(name) || stylesheet.dark.has(name),
			);
			expect(shared.length).toBeGreaterThan(MIN_SHARED);
		});

		test(`${file} inlined values match tokens.css`, () => {
			expect(
				driftIn(file, source).map(
					(drift) =>
						`${drift.file}:${drift.line} ${drift.scheme} ${drift.token} = ` +
						`"${drift.pageValue}" but tokens.css says "${drift.cssValue}"`,
				),
			).toEqual([]);
		});
	}
});
