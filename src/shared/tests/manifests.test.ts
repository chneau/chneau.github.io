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
});
