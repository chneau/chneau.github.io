import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_META } from "../app-meta";
import { collectUsages } from "./css-vars";

const SHARED_DIR = join(import.meta.dir, "..");
const read = (relative: string) => Bun.file(join(SHARED_DIR, relative)).text();

const REPO_ROOT = join(SHARED_DIR, "..", "..");

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const tokensCss = await read("tokens.css");
const baseCss = await read("base.css");
const themeTs = await read("theme.ts");
const componentFiles = readdirSync(join(SHARED_DIR, "components"))
	.filter((name) => name.endsWith(".tsx"))
	.sort();

const components = new Map<string, string>(
	await Promise.all(
		componentFiles.map(
			async (name): Promise<[string, string]> => [
				name,
				await read(`components/${name}`),
			],
		),
	),
);

const cleanTokens = stripComments(tokensCss);
const cleanBase = stripComments(baseCss);

const SITE_PROVIDED = [
	"--app-accent",
	"--app-accent-hover",
	"--app-accent-ink",
	"--app-accent-line",
	"--app-accent-soft",
	"--app-index",
];

const MANTINE_PROVIDED = [
	"--mantine-primary-color-contrast",
	"--mantine-primary-color-filled",
	"--mantine-primary-color-filled-hover",
	"--mantine-primary-color-light",
	"--mantine-primary-color-light-color",
	"--mantine-primary-color-light-hover",
];

const MISSING = "<missing-token>";

type TokenDef = { name: string; value: string };

const definitionsIn = (css: string): TokenDef[] =>
	[...stripComments(css).matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g)].map(
		(match) => ({
			name: match[1] ?? "",
			value: (match[2] ?? "").replace(/\s+/g, " ").trim(),
		}),
	);

const allDefs = definitionsIn(cleanTokens);
const defined = new Set(allDefs.map((def) => def.name));
const tokenNames = [...defined];

const rootBlock = cleanTokens.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const darkBlock =
	cleanTokens.match(
		/:root\[data-mantine-color-scheme="dark"\][^{]*\{([\s\S]*?)\n\}/,
	)?.[1] ?? "";

const sources: [string, string][] = [
	["tokens.css", cleanTokens],
	["base.css", cleanBase],
	...components,
];

const usages = sources.flatMap(([file, source]) => collectUsages(source, file));
const referenced = [...new Set(usages.map((usage) => usage.token))].sort();
const external = new Set<string>([...SITE_PROVIDED, ...MANTINE_PROVIDED]);
const undefinedTokens = referenced.filter(
	(token) => !defined.has(token) && !external.has(token),
);

const valueIn = (block: string, token: string): string =>
	definitionsIn(block).find((def) => def.name === token)?.value ?? MISSING;

const normalise = (value: string) => value.replace(/\s+/g, " ").trim();

describe("token references resolve", () => {
	test("every referenced custom property is defined or externally provided", () => {
		expect(
			undefinedTokens.map(
				(token) =>
					`${token} (used in ${[
						...new Set(
							usages.filter((u) => u.token === token).map((u) => u.file),
						),
					].join(", ")})`,
			),
		).toEqual([]);
	});

	test("externally provided tokens are always read with a fallback", () => {
		const withoutFallback = usages
			.filter((usage) => external.has(usage.token) && !usage.hasFallback)
			.map((usage) => `${usage.token} in ${usage.file}`);
		expect(withoutFallback).toEqual([]);
	});

	test("no token is declared twice inside the same block", () => {
		const duplicates = (block: string) => {
			const seen = new Set<string>();
			const dupes = new Set<string>();
			for (const { name } of definitionsIn(block)) {
				if (seen.has(name)) dupes.add(name);
				seen.add(name);
			}
			return [...dupes];
		};
		expect({
			light: duplicates(rootBlock),
			dark: duplicates(darkBlock),
		}).toEqual({ light: [], dark: [] });
	});

	test("every externally provided token really is used and really is undefined here", () => {
		const declared = [...external].filter((token) => defined.has(token));
		expect(declared).toEqual([]);
		const unused = [...external].filter((token) => !referenced.includes(token));
		expect(unused).toEqual([]);
	});

	test("the inventory actually found tokens, so the checks above are not vacuous", () => {
		expect(allDefs.length).toBeGreaterThan(20);
		expect(usages.length).toBeGreaterThan(80);
		expect(components.size).toBeGreaterThan(5);
		expect(rootBlock.length).toBeGreaterThan(100);
		expect(darkBlock.length).toBeGreaterThan(100);
	});
});

describe("theme and tokens agree", () => {
	const themeFont = (constName: string): string => {
		const declaration = themeTs.match(
			new RegExp(`const ${constName}\\s*=([\\s\\S]*?);`),
		)?.[1];
		if (!declaration) {
			throw new Error(`could not read ${constName} from theme.ts`);
		}
		const parts = [...declaration.matchAll(/'([^']*)'|"([^"]*)"/g)].map(
			(match) => match[1] ?? match[2] ?? "",
		);
		if (parts.length === 0) throw new Error(`${constName} holds no font stack`);
		return parts.join("");
	};

	test("the three font stacks are identical in theme.ts and tokens.css", () => {
		const pairs = [
			["FONT_SANS", "--app-font-sans"],
			["FONT_DISPLAY", "--app-font-display"],
			["FONT_MONO", "--app-font-mono"],
		] as const;

		const drifted = pairs
			.filter(
				([name, token]) =>
					themeFont(name) !== normalise(valueIn(rootBlock, token)),
			)
			.map(([name, token]) => `${name} != ${token}`);

		expect(drifted).toEqual([]);
	});

	test("theme radii do not hardcode pixel values that tokens also own", () => {
		const pxRadii = [...themeTs.matchAll(/radius[^:]*:\s*"?(\d+)px/g)].map(
			(m) => m[1],
		);
		expect(pxRadii).toEqual([]);
	});

	test("known gap: theme's neutral ramp is NOT mirrored by tokens.css", () => {
		const ramp = [...themeTs.matchAll(/#[0-9a-f]{6}/gi)].map((m) =>
			(m[0] ?? "").toLowerCase(),
		);
		const cssValues = allDefs.map((def) => def.value.toLowerCase());
		expect(ramp.length).toBeGreaterThan(9);
		expect(
			ramp.filter((hex) => cssValues.some((v) => v.includes(hex))),
		).toEqual([]);
	});
});

describe("token naming is consistent", () => {
	test("all token names are kebab-case and prefixed with --app-", () => {
		const malformed = tokenNames.filter(
			(name) => !/^--app-[a-z0-9]+(-[a-z0-9]+)*$/.test(name),
		);
		expect(malformed).toEqual([]);
	});

	test("no unprefixed or non-app custom properties leak into tokens.css", () => {
		const foreign = tokenNames.filter((name) => !name.startsWith("--app-"));
		expect(foreign).toEqual([]);
	});

	test("no near-duplicate names differing only by case, dashes or a color- prefix", () => {
		const canonical = (name: string) =>
			name
				.replace(/^--/, "")
				.replace(/-/g, "")
				.replace(/^color/, "")
				.toLowerCase();

		const buckets = new Map<string, string[]>();
		for (const name of tokenNames) {
			const key = canonical(name);
			buckets.set(key, [...(buckets.get(key) ?? []), name]);
		}

		expect(
			[...buckets]
				.filter(([, names]) => names.length > 1)
				.map(([, names]) => names),
		).toEqual([]);
	});

	test("site-provided accent tokens follow the same --app- kebab-case scheme", () => {
		expect(
			SITE_PROVIDED.filter(
				(name) => !/^--app-[a-z0-9]+(-[a-z0-9]+)*$/.test(name),
			),
		).toEqual([]);
	});
});

describe("dark mode", () => {
	const SCHEME_TOKENS = [
		"--app-bg",
		"--app-bg-deep",
		"--app-surface",
		"--app-surface-2",
		"--app-surface-3",
		"--app-border",
		"--app-border-strong",
		"--app-text",
		"--app-text-muted",
		"--app-text-faint",
		"--app-danger",
		"--app-warn",
		"--app-glass",
		"--app-shadow-sm",
		"--app-shadow",
		"--app-shadow-lg",
	];

	test("the dark block is keyed on both data-theme and Mantine's colour scheme", () => {
		expect(cleanTokens).toContain(':root[data-mantine-color-scheme="dark"]');
		expect(cleanTokens).toContain(':root[data-theme="dark"]');
	});

	test("a representative set of tokens has a light and a dark value", () => {
		const missing = SCHEME_TOKENS.filter(
			(token) =>
				valueIn(rootBlock, token) === MISSING ||
				valueIn(darkBlock, token) === MISSING,
		);
		expect(missing).toEqual([]);
	});

	test("dark values actually differ from light values", () => {
		const identical = SCHEME_TOKENS.filter(
			(token) => valueIn(rootBlock, token) === valueIn(darkBlock, token),
		);
		expect(identical).toEqual([]);
	});

	test("scheme-invariant tokens (fonts, radii, motion) are not duplicated in the dark block", () => {
		const invariant = [
			"--app-font-sans",
			"--app-font-display",
			"--app-font-mono",
			"--app-radius-xs",
			"--app-radius-sm",
			"--app-radius-md",
			"--app-radius-lg",
			"--app-radius-pill",
			"--app-ease",
			"--app-speed",
		];
		const redefined = invariant.filter(
			(token) => valueIn(darkBlock, token) !== MISSING,
		);
		expect(redefined).toEqual([]);
	});

	test("every :root dark rule in base.css also targets data-theme", () => {
		const groups = [
			...cleanBase.matchAll(/([^{}]+:root\[[^\]]*\][^{}]*)\{/g),
		].map((match) => match[1] ?? "");
		expect(groups.length).toBeGreaterThan(0);
		for (const group of groups) {
			expect(group).toContain('data-mantine-color-scheme="dark"');
			expect(group).toContain('data-theme="dark"');
		}
	});

	test("known gap: tokens.css does not follow the OS prefers-color-scheme", () => {
		expect(cleanTokens).not.toContain("prefers-color-scheme");
	});
});

describe("reduced motion", () => {
	const override = cleanBase.match(
		/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/,
	)?.[1];

	test("a global prefers-reduced-motion override exists in base.css", () => {
		expect(override).toBeDefined();
	});

	test("the override neutralises animation, iteration and transition for every element", () => {
		const block = override ?? "";
		expect(block).toMatch(/\*,\s*\*::before,\s*\*::after/);
		for (const property of [
			"animation-duration",
			"animation-iteration-count",
			"transition-duration",
		]) {
			expect(block).toContain(property);
		}
	});

	test("each reset carries !important, or the override is inert", () => {
		const block = override ?? "";
		for (const [property, value] of [
			["animation-duration", "0\\.001ms"],
			["animation-iteration-count", "1"],
			["transition-duration", "0\\.001ms"],
		]) {
			expect(block).toMatch(
				new RegExp(`${property}\\s*:\\s*${value}\\s*!important`),
			);
		}
	});

	test("the shared layer really does animate, so the override is load-bearing", () => {
		expect(cleanBase).toContain("animation: app-shimmer");
		expect(cleanBase).toContain("animation: app-breathe");
		expect(cleanBase).toContain("animation: app-rise");
		expect(cleanBase).toContain("transition:");
	});

	test("animations stay inside the .app-* utility convention", () => {
		const offenders = [
			...cleanBase.matchAll(/(?:^|\n)\s*([.#][a-zA-Z0-9_-]+)\s*\{([^}]*)\}/g),
		]
			.filter(([, , body]) => (body ?? "").includes("animation:"))
			.map(([, selector]) => selector ?? "")
			.filter((selector) => !selector.startsWith(".app-"));
		expect(offenders).toEqual([]);
	});
});

describe("Mantine's dimmed colour", () => {
	test("is repointed at the checked text token, in both schemes", () => {
		const declaration = cleanBase.match(
			/([^{}]*:root\[[^\]]*\][^{}]*)\{([^}]*--mantine-color-dimmed:\s*var\(--app-text-muted\)[^}]*)\}/,
		);
		expect(declaration).not.toBeNull();
		const [, selector = ""] = declaration ?? [];
		expect(selector).toContain('data-mantine-color-scheme="light"');
		expect(selector).toContain('data-mantine-color-scheme="dark"');
		expect(selector).toContain('data-theme="light"');
		expect(selector).toContain('data-theme="dark"');
	});

	test("points at a token this file defines for both schemes", () => {
		expect(defined.has("--app-text-muted")).toBe(true);
		expect(valueIn(darkBlock, "--app-text-muted")).not.toBe(MISSING);
	});

	test("every entry imports Mantine's stylesheet before base.css", () => {
		const entries = APP_META.map((meta) => ({
			slug: meta.slug,
			imports: [
				...readFileSync(
					join(REPO_ROOT, meta.entry.replace(/^\.\//, "")),
					"utf8",
				).matchAll(/import\s+"([^"]+)";/g),
			].map((match) => match[1] ?? ""),
		}));
		const wrongOrder = entries
			.filter(({ imports }) => {
				const mantine = imports.findIndex((path) =>
					path.includes("@mantine/core/styles.css"),
				);
				const base = imports.findIndex((path) => path.endsWith("base.css"));
				return mantine === -1 || base === -1 || mantine > base;
			})
			.map(({ slug }) => slug);
		expect(wrongOrder).toEqual([]);
	});
});

describe("Mantine's placeholder colour", () => {
	test("is repointed, in both schemes, at a token defined for both", () => {
		const declaration = cleanBase.match(
			/([^{}]*:root\[[^\]]*\][^{}]*)\{([^}]*--mantine-color-placeholder:\s*var\(--app-text-faint\)[^}]*)\}/,
		);
		expect(declaration).not.toBeNull();
		const [, selector = ""] = declaration ?? [];
		expect(selector).toContain('data-mantine-color-scheme="light"');
		expect(selector).toContain('data-mantine-color-scheme="dark"');
		expect(defined.has("--app-text-faint")).toBe(true);
		expect(valueIn(darkBlock, "--app-text-faint")).not.toBe(MISSING);
	});
});

describe("autoContrast's threshold", () => {
	test("sits in the band where one of black or white clears 4.5:1", () => {
		const threshold = Number(
			themeTs.match(/luminanceThreshold:\s*([\d.]+)/)?.[1] ?? Number.NaN,
		);
		expect(threshold).not.toBeNaN();
		const blackClears = threshold >= 0.175;
		const whiteClears = threshold <= 0.1833;
		expect(blackClears && whiteClears).toBe(true);
	});

	test("autoContrast is on, or the threshold decides nothing", () => {
		expect(themeTs).toContain("autoContrast: true");
	});
});
