import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Static integrity tests for the design-token layer.
 *
 * There is no jsdom in this repo, so instead of parsing CSS in a DOM we read
 * the sources as text and assert the invariants a typechecker cannot see: an
 * undefined custom property renders as empty/initial and no compiler ever
 * complains about it.
 */

const SHARED_DIR = join(import.meta.dir, "..");
const read = (relative: string) => Bun.file(join(SHARED_DIR, relative)).text();

/** Strip block comments so commented-out tokens never count. */
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

/**
 * Tokens deliberately absent from `tokens.css` because each of the six apps
 * supplies its own value. They must therefore always be read with a
 * `var(--x, fallback)` fallback, so a site that forgets to define one degrades
 * to something sane instead of an empty declaration.
 */
const SITE_PROVIDED = [
	"--app-accent",
	"--app-accent-hover",
	"--app-accent-ink",
	"--app-accent-line",
	"--app-accent-soft",
	"--app-index",
];

/** Custom properties Mantine itself puts on the root element. */
const MANTINE_PROVIDED = [
	"--mantine-primary-color-contrast",
	"--mantine-primary-color-filled",
	"--mantine-primary-color-filled-hover",
	"--mantine-primary-color-light",
	"--mantine-primary-color-light-color",
	"--mantine-primary-color-light-hover",
];

/** Stands in for a missing token so a gap cannot silently compare equal. */
const MISSING = "<missing-token>";

/* ── token inventory ──────────────────────────────────────────────────── */

type TokenDef = { name: string; value: string };

/** Every `--x: value;` declaration, with whitespace normalised. */
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

/* ── usage inventory ──────────────────────────────────────────────────── */

type Usage = { token: string; file: string; hasFallback: boolean };

/**
 * Scans every `var()` read with a stack of currently-open `var(` calls, so a
 * read nested inside another read's fallback (`var(--a, var(--b))`) inherits
 * that fallback. Chained fallbacks are safe; a bare read is not.
 */
const collectUsages = (source: string, file: string): Usage[] => {
	const found: Usage[] = [];
	const stack: { inheritedFallback: boolean }[] = [];

	for (let i = 0; i < source.length; i += 1) {
		if (source.startsWith("var(", i)) {
			const close = source.indexOf(")", i);
			const body = source.slice(i + 4, close === -1 ? source.length : close);
			const name = body.trimStart().match(/^--[a-zA-Z0-9_-]+/)?.[0];
			// A comma followed by more text means a fallback was supplied.
			const own = /,\s*\S/.test(body);
			if (name) {
				found.push({
					token: name,
					file,
					hasFallback: own || (stack.at(-1)?.inheritedFallback ?? false),
				});
			}
			stack.push({ inheritedFallback: own });
			i += 3;
			continue;
		}
		if (source[i] === ")" && stack.length > 0) stack.pop();
	}

	return found;
};

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

/* ── helpers ──────────────────────────────────────────────────────────── */

/** Normalised value of a token declared in a given block, if any. */
const valueIn = (block: string, token: string): string =>
	definitionsIn(block).find((def) => def.name === token)?.value ?? MISSING;

/** Reduce a whitespace-wrapped CSS value so it can be compared as one string. */
const normalise = (value: string) => value.replace(/\s+/g, " ").trim();

/* ── 1. references resolve ────────────────────────────────────────────── */

describe("token references resolve", () => {
	test("every referenced custom property is defined or externally provided", () => {
		// Reported as a list so a regression names every broken token at once.
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
		// Stops the allowlists rotting into dead weight, and stops a site token
		// being wrongly excused by the allowlist.
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

/* ── 2. Mantine theme vs CSS tokens ───────────────────────────────────── */

describe("theme and tokens agree", () => {
	const themeFont = (constName: string): string => {
		// Collect every quoted segment up to the terminating `;`, concatenating
		// the implicit string joins the formatter leaves in the source.
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
		// theme.ts configures Mantine by radius *name* (`defaultRadius: "md"`)
		// and leaves geometry to Mantine, so it must not carry a second copy of
		// the `--app-radius-*` scale.
		const pxRadii = [...themeTs.matchAll(/radius[^:]*:\s*"?(\d+)px/g)].map(
			(m) => m[1],
		);
		expect(pxRadii).toEqual([]);
	});

	test("known gap: theme's neutral ramp is NOT mirrored by tokens.css", () => {
		// theme.ts claims "the shared CSS tokens mirror the same values" for its
		// `neutral` tuple, but the two sets of hexes are disjoint. The comment is
		// wrong. Locked in as a known gap: fixing it means editing theme.ts or
		// tokens.css and updating this expectation.
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

/* ── 3. naming consistency ────────────────────────────────────────────── */

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

/* ── 4. dark mode ─────────────────────────────────────────────────────── */

describe("dark mode", () => {
	/** Colour and shadow tokens that must be re-declared for the dark scheme. */
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
		// Selector lists may be comma-separated across lines, so match the whole
		// run of selectors that precedes each `{`.
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
		// The apps always toggle `data-theme` on <html>, so this is intentional,
		// but a visitor with JS disabled always gets the light scheme.
		expect(cleanTokens).not.toContain("prefers-color-scheme");
	});
});

/* ── 5. reduced motion ────────────────────────────────────────────────── */

describe("reduced motion", () => {
	const override = cleanBase.match(
		/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/,
	)?.[1];

	test("a global prefers-reduced-motion override exists in base.css", () => {
		expect(override).toBeDefined();
	});

	test("the override neutralises animation, iteration and transition for every element", () => {
		const block = override ?? "";
		// The universal selector list must be present, and each of the three
		// longhands that make motion non-terminating must be reset.
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
		// This is the assertion whose absence let a real regression through.
		//
		// `*` has specificity (0,0,0) and a media query contributes none, so a
		// reset written without `!important` loses to every class rule that
		// declares its own duration - which is most of the shared layer. The
		// block above can list all three properties and still protect nothing.
		//
		// Measured in Chromium against the design gallery, which is dense with
		// animated class rules: 14 elements still animating under
		// `prefers-reduced-motion: reduce` without `!important`, 0 with it.
		//
		// Both states of this file have existed in the tree at different times,
		// which is why it is asserted rather than assumed.
		const block = override ?? "";
		// Each property has its own reset value: durations go to 0.001ms, the
		// iteration count to 1 (an infinite animation is exactly what an
		// iteration count of 1 stops).
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
