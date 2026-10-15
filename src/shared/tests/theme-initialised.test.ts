import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { APP_META } from "../app-meta";

const read = (relative: string): string =>
	readFileSync(new URL(relative, import.meta.url), "utf8");

const entryFor = (slug: string): string | null => {
	try {
		return read(`../../${slug}/index.tsx`);
	} catch {
		return null;
	}
};

describe("the theme is initialised on every app", () => {
	test("every entry point calls initTheme()", () => {
		const missing: string[] = [];
		for (const meta of APP_META) {
			const source = entryFor(meta.slug);
			if (source === null) continue;
			if (!source.includes("initTheme(")) missing.push(meta.slug);
		}
		expect(missing).toEqual([]);
	});

	test("mountApp, which boots the seven save editors, calls it too", () => {
		expect(read("../mountApp.tsx")).toContain("initTheme()");
	});

	test("no app hands Mantine a default scheme of its own", () => {
		const offenders: string[] = [];
		for (const meta of APP_META) {
			for (const file of [
				`../../${meta.slug}/index.tsx`,
				"../../shared/mountApp.tsx",
			]) {
				let source: string;
				try {
					source = read(file);
				} catch {
					continue;
				}
				if (source.includes("defaultColorScheme")) offenders.push(file);
			}
		}
		expect(offenders).toEqual([]);
	});

	test("applyColorMode is the only writer of the scheme attributes in src/", () => {
		const writers: string[] = [];
		for (const meta of APP_META) {
			let source: string;
			try {
				source = read(`../../${meta.slug}/index.tsx`);
			} catch {
				continue;
			}
			if (source.includes("dataset.theme")) writers.push(meta.slug);
		}
		expect(writers).toEqual([]);
	});
});
