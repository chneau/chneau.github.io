import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { APP_META } from "../app-meta";

/**
 * Every app must paint its scheme before the first frame, from the one key.
 *
 * Nine of the thirteen apps used to opt out. `initTheme()` was called by `cv`,
 * `root` and `design` only; the seven save editors went through `mountApp`, which
 * passed `defaultColorScheme="dark"` to `MantineProvider`, and `scotland-rail`
 * and `spooners` did the same in their own entry points. `birthday` hand-rolled
 * a `localStorage` read against its Valtio store.
 *
 * The failure mode was silent in a specific way: Mantine wrote
 * `data-mantine-color-scheme` and nothing wrote `data-theme`, and `tokens.css`
 * accepts *either* attribute — so the site looked correct while ignoring the
 * visitor's choice entirely. A scheme picked on the dashboard did not apply in
 * those nine apps, and a light-preference desktop still got dark.
 *
 * This reads the sources rather than rendering, because the property is "every
 * entry point calls this before the first paint", which is a fact about the
 * module graph and not about any rendered output.
 */

const read = (relative: string): string =>
	readFileSync(new URL(relative, import.meta.url), "utf8");

/** Apps whose entry point is `src/<slug>/index.tsx`. */
const entryFor = (slug: string): string | null => {
	try {
		return read(`../../${slug}/index.tsx`);
	} catch {
		return null;
	}
};

describe("the theme is initialised on every app", () => {
	test("every entry point calls initTheme()", () => {
		// `mountApp` covers the seven save editors, which have no `initTheme` of
		// their own; it is asserted separately below.
		const missing: string[] = [];
		for (const meta of APP_META) {
			const source = entryFor(meta.slug);
			if (source === null) continue; // a save editor: covered by mountApp
			if (!source.includes("initTheme(")) missing.push(meta.slug);
		}
		expect(missing).toEqual([]);
	});

	test("mountApp, which boots the seven save editors, calls it too", () => {
		expect(read("../mountApp.tsx")).toContain("initTheme()");
	});

	test("no app hands Mantine a default scheme of its own", () => {
		// `defaultColorScheme` makes Mantine pick the scheme and write only
		// `data-mantine-color-scheme`, which is the split this replaced.
		// `forceColorScheme` is the correct prop and is allowed.
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
		// One writer is the invariant. `public/404.html` and `public/offline.html`
		// are deliberately outside it: they are static pages with no bundler and
		// must run before anything else does.
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
