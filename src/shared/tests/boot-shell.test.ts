import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { APP_META } from "../app-meta";

/**
 * The boot shell is markup in the HTML, painted before any JavaScript runs, and
 * it exists because of a measured defect rather than a preference.
 *
 * Every app is its own document, so changing page is a full navigation. Probed
 * with an init script inside each loading page: before the shell, `#root` was
 * empty for the whole load and the user got 2-5 frames of blank white page per
 * app, with nothing visible until 246-503ms. A blank page is not merely slow —
 * it reads as a dropped tap, and a tap on a blank page cannot do anything. With
 * the shell, 0 blank frames and something visible at 42-62ms.
 *
 * The property that makes this work is that the shell is a *sibling* of
 * `#root`, not a React component: `base.css` retires it with
 * `#root:not(:empty) ~ .app-boot`, so there is no mount hook to forget in
 * thirteen entry files and no window in which both are on screen.
 */
const read = (path: string) =>
	readFileSync(new URL(path, import.meta.url), "utf8");

describe("boot shell", () => {
	const base = read("../base.css");
	const config = read("../../../rsbuild.config.ts");

	test("the CSS retires the shell by CSS alone, once React has rendered", () => {
		expect(base).toContain("#root:not(:empty) ~ .app-boot");
		expect(base).toMatch(
			/#root:not\(:empty\) ~ \.app-boot \{[^}]*display: none;/,
		);
	});

	test("the shell is inert, so it can never swallow a tap", () => {
		expect(base).toMatch(/\.app-boot \{[^}]*pointer-events: none;/);
	});

	test("the shell does not animate for reduced-motion visitors", () => {
		expect(base).toContain("@media (prefers-reduced-motion: no-preference)");
		// The animation itself must live inside that query, not beside it.
		const animation = base.indexOf("@keyframes app-boot-pulse");
		const guard = base.indexOf(
			"@media (prefers-reduced-motion: no-preference)",
		);
		expect(animation).toBeGreaterThan(-1);
		expect(guard).toBeGreaterThan(-1);
		expect(base.slice(guard, animation)).toContain("app-boot-pulse");
	});

	test("every app's HTML receives the shell, injected into the body", () => {
		// The config builds one environment per `APP_META` row through
		// `environmentFor`, and the shell is added once inside that builder, so
		// a single `...bootShell,` covers every app plus the dashboard. Counting
		// literal blocks by name instead would undercount the moment an app is
		// named with a digit — and is impossible now the blocks are generated.
		const injections = config.match(/\.\.\.bootShell,/g) ?? [];
		expect(injections.length).toBe(1);
		expect(config).toMatch(/APP_META\.map\(/);
		// Every app plus the dashboard.
		expect(APP_META.length).toBeGreaterThanOrEqual(13);
	});

	test("the shell is injected after #root so the sibling rule can reach it", () => {
		// `head: false` puts it in <body>; the default `append` leaves it after
		// the mount node, which is what `#root ~ .app-boot` depends on.
		expect(config).toMatch(/tag: "div",[\s\S]*?class: "app-boot"/);
		expect(config).toMatch(/class: "app-boot"[\s\S]*?head: false/);
	});

	test("the shell is hidden from assistive tech", () => {
		expect(config).toContain('"aria-hidden": "true"');
	});

	test("base.css is a real file the rule can live in", () => {
		expect(
			statSync(new URL("../base.css", import.meta.url)).size,
		).toBeGreaterThan(0);
	});
});
