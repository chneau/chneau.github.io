import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { manifestJson, sitemapXml } from "../_genManifests";
import { APP_META } from "../app-meta";

const MANIFEST_DIR = fileURLToPath(
	new URL("../../../manifests/", import.meta.url),
);

const ICON_DIR = fileURLToPath(
	new URL("../../../public/icons/", import.meta.url),
);

const SITEMAP_FILE = fileURLToPath(
	new URL("../../../public/sitemap.xml", import.meta.url),
);

const SITE_URL = "https://chneau.github.io";

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
		for (const meta of APP_META) {
			const manifest = readManifest(meta.slug);
			expect(manifest).toContain(`"id": ${JSON.stringify(meta.path)}`);
			expect(manifest).toContain(`"start_url": ${JSON.stringify(meta.path)}`);
			expect(manifest).toContain(`"scope": ${JSON.stringify(meta.path)}`);
			expect(manifest).toContain(`/icons/${meta.slug}-192.png`);
			expect(manifest).toContain(`/icons/${meta.slug}-maskable-512.png`);
		}
	});

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

describe("public/sitemap.xml", () => {
	const sitemap = readFileSync(SITEMAP_FILE, "utf8");

	test("the committed file is exactly the generator's output", () => {
		expect(sitemap).toBe(sitemapXml());
	});

	test("there is one <loc> per app and none the table does not declare", () => {
		const locs = sitemap.match(/<loc>[^<]*<\/loc>/g) ?? [];
		expect(locs.length).toBe(APP_META.length);
		expect([...locs].sort()).toEqual(
			APP_META.map((meta) => `<loc>${SITE_URL}${meta.path}</loc>`).sort(),
		);
	});

	test("each url block carries that app's changefreq and priority", () => {
		for (const meta of APP_META) {
			const block = [
				"\t<url>",
				`\t\t<loc>${SITE_URL}${meta.path}</loc>`,
				`\t\t<changefreq>${meta.sitemap.changefreq}</changefreq>`,
				`\t\t<priority>${meta.sitemap.priority.toFixed(1)}</priority>`,
				"\t</url>",
			].join("\n");
			expect(sitemap, meta.slug).toContain(block);
		}
	});
});
