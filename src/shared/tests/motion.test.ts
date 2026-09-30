import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { prefersReducedMotion } from "../motion";

/**
 * Reduced motion has to survive the cascade, not just be present in the source.
 *
 * The global `@media (prefers-reduced-motion: reduce)` reset in `base.css` uses
 * the universal selector, which has specificity (0,0,0) and therefore loses to
 * any rule that has a selector of its own - and an inline style outranks
 * everything. A single `style={{ transition: ... }}` in a shared component is
 * enough to make the whole guard decorative, and nothing in the type checker
 * notices, so we read the sources as text and assert the invariant instead.
 */

const SHARED_DIR = join(import.meta.dir, "..");
const read = (relative: string) => Bun.file(join(SHARED_DIR, relative)).text();

/**
 * Drop comments before matching: the prose around these rules legitimately
 * names the very properties being banned, and a comment is not a declaration.
 */
const stripComments = (source: string) =>
	source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*/gm, "");

const section = stripComments(await read("components/Section.tsx"));
const motion = stripComments(await read("motion.ts"));
const cleanBase = stripComments(await read("base.css"));
const cleanSectionCss = stripComments(await read("components/Section.css"));

/** Longhands that carry a duration, plus the shorthands that imply one. */
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

/** Matches `name:` only in an object-literal position, not `fooName:`. */
const declarationPattern = (name: string) =>
	new RegExp(`(?:^|[\\s{,])${name}\\s*:`, "m");

/** Swap `window` for the duration of a test, then put the old one back. */
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
		// The rotation itself is state and stays inline; the transition is the
		// part a reduced-motion override has to be able to reach, so it has to
		// be a selector. This is the hook a stylesheet rule attaches to.
		expect(section).toContain("app-section__chevron");
		expect(section).toMatch(/transform:\s*open\s*\?/);
	});

	test("the class-based transition is itself overridable under reduced motion", () => {
		// The `*` reset in `base.css` loses to any rule with a selector of its
		// own, so moving the transition out of the style attribute is not enough
		// on its own - the class needs its own media-query override too, or the
		// guard is just decoration moved one level down the cascade.
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
		// If the global reset were ever removed, the class-based transition
		// would animate unconditionally, so pin the reset's presence here too.
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
		// A module-level snapshot would answer `true` for the second call; the
		// point-in-time contract is what both call sites depend on.
		let matches = false;
		withWindow({ matchMedia: () => ({ matches }) }, () => {
			expect(prefersReducedMotion()).toBe(false);
			matches = true;
			expect(prefersReducedMotion()).toBe(true);
		});
	});

	test("the source keeps no module-level snapshot of the preference", () => {
		// Guards the contract above: a cached `const reduced = matchMedia(...)`
		// at module scope would read once, before the user's OS setting is even
		// readable in some environments, and never notice a change. The only
		// query has to live inside the exported function.
		const topLevelCalls = motion
			.split("\n")
			.filter((line) => !line.startsWith("	") && line.includes("matchMedia("));
		expect(topLevelCalls).toEqual([]);
		expect(motion).toMatch(/window\.matchMedia\(/);
	});
});
