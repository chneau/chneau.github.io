import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { APP_META } from "../app-meta";

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
		const animation = base.indexOf("@keyframes app-boot-pulse");
		const guard = base.indexOf(
			"@media (prefers-reduced-motion: no-preference)",
		);
		expect(animation).toBeGreaterThan(-1);
		expect(guard).toBeGreaterThan(-1);
		expect(base.slice(guard, animation)).toContain("app-boot-pulse");
	});

	test("every app's HTML receives the shell, injected into the body", () => {
		const injections = config.match(/\.\.\.bootShell,/g) ?? [];
		expect(injections.length).toBe(1);
		expect(config).toMatch(/APP_META\.map\(/);
		expect(APP_META.length).toBeGreaterThanOrEqual(13);
	});

	test("the shell is injected after #root so the sibling rule can reach it", () => {
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
