import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (relative: string) => Bun.file(join(ROOT, relative)).text();

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

type TokenDef = { name: string; value: string };

const normalise = (value: string) =>
	value
		.replace(/["']/g, '"')
		.replace(/\s*,\s*/g, ", ")
		.replace(/\s+/g, " ")
		.trim();

const declarationsIn = (css: string): TokenDef[] =>
	[
		...stripComments(css).matchAll(/(--app-[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g),
	].map((match) => ({
		name: match[1] ?? "",
		value: normalise(match[2] ?? ""),
	}));

const tokenMap = (block: string): Map<string, string> =>
	new Map(declarationsIn(block).map((def) => [def.name, def.value]));

const cleanTokens = stripComments(await read("src/shared/tokens.css"));

const stylesheet = {
	light: tokenMap(cleanTokens.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? ""),
	dark: tokenMap(
		cleanTokens.match(
			/:root\[data-mantine-color-scheme="dark"\][^{]*\{([\s\S]*?)\n\}/,
		)?.[1] ?? "",
	),
};

const lightBlock = (html: string) =>
	stripComments(html).match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";

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

const MIN_SHARED = 5;

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
