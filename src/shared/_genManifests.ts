import { APP_META, type AppMeta } from "./app-meta";

type JsonValue =
	| string
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue };

const LINE_WIDTH = 80;

const INDENT = "\t";

const SITE_URL = "https://chneau.github.io";

const inline = (value: JsonValue): string => {
	if (typeof value === "string") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
	const entries = Object.entries(value);
	return `{ ${entries
		.map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`)
		.join(", ")} }`;
};

const render = (value: JsonValue, column: number, level: number): string => {
	if (typeof value === "string") return JSON.stringify(value);
	const pad = INDENT.repeat(level);
	const childPad = INDENT.repeat(level + 1);
	const flat = inline(value);
	if (column + flat.length <= LINE_WIDTH) return flat;
	if (Array.isArray(value)) {
		const body = value
			.map((item) => `${childPad}${render(item, childPad.length, level + 1)}`)
			.join(",\n");
		return `[\n${body}\n${pad}]`;
	}
	const body = Object.entries(value)
		.map(([key, item]) => {
			const head = `${childPad}${JSON.stringify(key)}: `;
			return `${head}${render(item, head.length, level + 1)}`;
		})
		.join(",\n");
	return `{\n${body}\n${pad}}`;
};

export const manifestJson = (meta: AppMeta): string => {
	const icons = [
		{
			src: `/icons/${meta.slug}-32.png`,
			sizes: "32x32",
			type: "image/png",
			purpose: "any",
		},
		{
			src: `/icons/${meta.slug}-192.png`,
			sizes: "192x192",
			type: "image/png",
			purpose: "any",
		},
		{
			src: `/icons/${meta.slug}-512.png`,
			sizes: "512x512",
			type: "image/png",
			purpose: "any",
		},
		{
			src: `/icons/${meta.slug}-maskable-512.png`,
			sizes: "512x512",
			type: "image/png",
			purpose: "maskable",
		},
	];
	const manifest: JsonValue = {
		id: meta.path,
		name: meta.manifestName,
		short_name: meta.manifestShortName,
		description: meta.description,
		start_url: meta.path,
		scope: meta.path,
		display: "standalone",
		display_override: ["standalone", "minimal-ui"],
		background_color: meta.backgroundColor,
		theme_color: meta.themeColor,
		lang: "en",
		icons,
	};
	return `${render(manifest, 0, 0)}\n`;
};

export const sitemapXml = (): string => {
	const urls = APP_META.map((meta) =>
		[
			`${INDENT}<url>`,
			`${INDENT}${INDENT}<loc>${SITE_URL}${meta.path}</loc>`,
			`${INDENT}${INDENT}<changefreq>${meta.sitemap.changefreq}</changefreq>`,
			`${INDENT}${INDENT}<priority>${meta.sitemap.priority.toFixed(1)}</priority>`,
			`${INDENT}</url>`,
		].join("\n"),
	).join("\n");
	return [
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
		urls,
		"</urlset>",
		"",
	].join("\n");
};

if (import.meta.main) {
	await Promise.all([
		...APP_META.map((meta) =>
			Bun.write(`manifests/${meta.slug}.json`, manifestJson(meta)),
		),
		Bun.write("public/sitemap.xml", sitemapXml()),
	]);
	console.log(`manifests/ generated (${APP_META.length} files)`);
	console.log(`public/sitemap.xml generated (${APP_META.length} urls)`);
}
