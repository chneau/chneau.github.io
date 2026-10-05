/**
 * The committed `manifests/*.json` are generated, so the guard is that they
 * still equal the generator's output byte for byte. This is the same shape as
 * `src/birthday/tests/ics.test.ts`: the generator is pure and side-effect free
 * when imported, and the test reads the files that are actually shipped.
 *
 * `_genManifests.ts` writes its output only under `import.meta.main`, so
 * importing `manifestJson` here never touches the tree.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { manifestJson } from "../_genManifests";
import { APP_META } from "../app-meta";

const MANIFEST_DIR = fileURLToPath(
	new URL("../../../manifests/", import.meta.url),
);

const ICON_DIR = fileURLToPath(
	new URL("../../../public/icons/", import.meta.url),
);

const readManifest = (slug: string): string =>
	readFileSync(`${MANIFEST_DIR}${slug}.json`, "utf8");

describe("manifests/*.json", () => {
	test("every committed manifest is exactly the generator's output", () => {
		for (const meta of APP_META) {
			expect(readManifest(meta.slug), meta.slug).toBe(manifestJson(meta));
		}
	});

	test("the directory holds one manifest per app and nothing else", () => {
		const files = readdirSync(MANIFEST_DIR)
			.filter((name) => name.endsWith(".json"))
			.sort();
		const expected = APP_META.map((meta) => `${meta.slug}.json`).sort();
		expect(files).toEqual(expected);
	});

	test("id, start_url and scope are the app path, and the icons are its slug", () => {
		// A hand-edit that reworded an id or repointed an icon would be lost on
		// the next generation; pin the relationships that make that obvious.
		for (const meta of APP_META) {
			const manifest = readManifest(meta.slug);
			expect(manifest).toContain(`"id": ${JSON.stringify(meta.path)}`);
			expect(manifest).toContain(`"start_url": ${JSON.stringify(meta.path)}`);
			expect(manifest).toContain(`"scope": ${JSON.stringify(meta.path)}`);
			expect(manifest).toContain(`/icons/${meta.slug}-192.png`);
			expect(manifest).toContain(`/icons/${meta.slug}-maskable-512.png`);
		}
	});

	/**
	 * The icons the manifests name actually exist.
	 *
	 * The test above proves each manifest *says* `/icons/<slug>-192.png`; it says
	 * nothing about the file being there. Adding an `APP_META` row generates a
	 * manifest naming four icons nobody has drawn, and every other assertion in
	 * this file still passes — the manifest is internally consistent and points
	 * at nothing. `rsbuild.config.ts` hard-codes an `apple-touch-icon` at the
	 * 192 for every app on the same unchecked assumption.
	 *
	 * A missing icon is not cosmetic: the browser rejects the install prompt and
	 * the home-screen shortcut falls back to a default glyph.
	 */
	test("every icon a manifest names is present in public/icons", () => {
		const icons = new Set(readdirSync(ICON_DIR));
		const missing: string[] = [];

		for (const meta of APP_META) {
			for (const name of [
				`${meta.slug}-32.png`,
				`${meta.slug}-192.png`,
				`${meta.slug}-512.png`,
				`${meta.slug}-maskable-512.png`,
			]) {
				if (!icons.has(name)) missing.push(`${meta.slug}: ${name}`);
			}
		}

		expect(missing).toEqual([]);
	});
});
