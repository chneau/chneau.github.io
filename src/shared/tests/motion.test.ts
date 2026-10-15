import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { prefersReducedMotion } from "../motion";

const SHARED_DIR = join(import.meta.dir, "..");
const read = (relative: string) => Bun.file(join(SHARED_DIR, relative)).text();

const stripComments = (source: string) =>
	source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*/gm, "");

const section = stripComments(await read("components/Section.tsx"));
const motion = stripComments(await read("motion.ts"));
const cleanBase = stripComments(await read("base.css"));
const cleanSectionCss = stripComments(await read("components/Section.css"));

const MOTION_DECLARATIONS = [
	"transition",
	"transitionProperty",
	"transitionDuration",
	"transitionDelay",
	"animation",
	"animationName",
	"animationDuration",
	"animationDelay",
	"animationIterationCount",
	"willChange",
];

const declarationPattern = (name: string) =>
	new RegExp(`(?:^|[\\s{,])${name}\\s*:`, "m");

const withWindow = (fake: unknown, run: () => void) => {
	const globals = globalThis as unknown as { window?: unknown };
	const had = "window" in globals;
	const previous = globals.window;
	globals.window = fake;
	try {
		run();
	} finally {
		if (had) {
			globals.window = previous;
		} else {
			delete globals.window;
		}
	}
};

describe("Section carries no inline motion", () => {
	test("no inline transition or animation declaration in the component", () => {
		const offenders = MOTION_DECLARATIONS.filter((name) =>
			declarationPattern(name).test(section),
		);
		expect(offenders).toEqual([]);
	});

	test("the chevron's duration comes from a class, not a style attribute", () => {
		expect(section).toContain("app-section__chevron");
		expect(section).toMatch(/transform:\s*open\s*\?/);
	});

	test("the class-based transition is itself overridable under reduced motion", () => {
		expect(cleanSectionCss).toMatch(
			/\.app-section__chevron\s*\{[^}]*transition:/,
		);
		const override = cleanSectionCss.match(
			/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/,
		)?.[1];
		expect(override).toBeDefined();
		expect(override ?? "").toMatch(
			/\.app-section__chevron\s*\{[^}]*transition-duration:\s*0\.001ms\s*!important/,
		);
	});

	test("the guard this depends on is load-bearing", () => {
		const override = cleanBase.match(
			/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/,
		)?.[1];
		expect(override).toBeDefined();
		expect(override ?? "").toContain("transition-duration");
	});
});

describe("prefersReducedMotion", () => {
	test("is false when there is no window, so SSR/prerender never throws", () => {
		withWindow(undefined, () => {
			expect(prefersReducedMotion()).toBe(false);
		});
	});

	test("asks the OS for the reduced-motion feature and reports the match", () => {
		const asked: string[] = [];
		const window = {
			matchMedia: (query: string) => {
				asked.push(query);
				return { matches: true };
			},
		};
		withWindow(window, () => {
			expect(prefersReducedMotion()).toBe(true);
		});
		expect(asked).toEqual(["(prefers-reduced-motion: reduce)"]);
	});

	test("is false when the preference is not set", () => {
		withWindow({ matchMedia: () => ({ matches: false }) }, () => {
			expect(prefersReducedMotion()).toBe(false);
		});
	});

	test("tolerates a window without matchMedia", () => {
		withWindow({}, () => {
			expect(prefersReducedMotion()).toBe(false);
		});
	});

	test("re-reads on every call, so a change is never missed", () => {
		let matches = false;
		withWindow({ matchMedia: () => ({ matches }) }, () => {
			expect(prefersReducedMotion()).toBe(false);
			matches = true;
			expect(prefersReducedMotion()).toBe(true);
		});
	});

	test("the source keeps no module-level snapshot of the preference", () => {
		const topLevelCalls = motion
			.split("\n")
			.filter((line) => !line.startsWith("	") && line.includes("matchMedia("));
		expect(topLevelCalls).toEqual([]);
		expect(motion).toMatch(/window\.matchMedia\(/);
	});
});
