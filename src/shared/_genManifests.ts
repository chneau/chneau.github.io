/**
 * Build-time generator for the per-app `manifests/*.json`.
 *
 * These files used to be maintained by hand — 13 near-identical documents each
 * restating a name, a description, a theme colour and a four-icon block — and
 * they had drifted from what `rsbuild.config.ts` actually shipped. They are now
 * derived from `APP_META`, so an app's manifest is one table row.
 *
 * The serialiser reproduces `deno fmt --use-tabs`'s JSON output byte for byte
 * (tabs, a short `display_override` array inline, the `icons` array expanded),
 * so a `bun run check` pass over the tree is a no-op and the committed files
 * stay exactly what this generator writes.
 *
 * Run it directly (`bun run src/shared/_genManifests.ts`) to regenerate; the
 * `build` and `build:birthday` scripts call it beside `_genIcs.ts`.
 */

import { APP_META, type AppMeta } from "./app-meta";

/** Any JSON value this generator can emit. */
type JsonValue =
	| string
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue };

/** The formatter's line budget, matching `deno fmt`'s default of 80. */
const LINE_WIDTH = 80;

/** `deno fmt --use-tabs` indents with one tab per level. */
const INDENT = "\t";

/** Render a value on a single line, whatever its size. */
const inline = (value: JsonValue): string => {
	if (typeof value === "string") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
	const entries = Object.entries(value);
	return `{ ${entries
		.map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`)
		.join(", ")} }`;
};

/**
 * Render a value the way `deno fmt` would: inline when the whole thing fits on
 * the current line, expanded (one entry per line, no trailing comma otherwise).
 * `column` is the character offset the value starts at, `level` its indent.
 */
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

/**
 * The web manifest for one app, serialised exactly as the committed file.
 *
 * Every field is derived from `APP_META`: `id`/`start_url`/`scope` are the
 * app's path, the icons are the four sizes named after its slug, and the
 * platform chrome takes its colours from the same source as the HTML.
 */
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

if (import.meta.main) {
	// Thirteen files, written together rather than one at a time. Each write
	// names its own path and reads nothing another write produces, so there is
	// no order to preserve and nothing a serial loop buys; the cost of the
	// sequential version is thirteen round-trips through the filesystem for no
	// reason at all.
	await Promise.all(
		APP_META.map((meta) =>
			Bun.write(`manifests/${meta.slug}.json`, manifestJson(meta)),
		),
	);
	console.log(`manifests/ generated (${APP_META.length} files)`);
}
