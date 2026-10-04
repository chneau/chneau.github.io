import { defineConfig, type EnvironmentConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import dayjs from "dayjs";
import { APP_META, type AppMeta } from "./src/shared/app-meta";

/**
 * Injected into the four environments whose UI surfaces a build stamp:
 * root, cv, birthday and scotland-rail. Environments without a consumer
 * must NOT declare it — an unused define is dead config.
 */
const nowStr = dayjs().format("MMM D, HH:mm");

const SITE_URL = "https://chneau.github.io";

/** Single 1200×630 PNG committed to public/ and copied to the site root. */
const OG_IMAGE = `${SITE_URL}/og.png`;

const emojiIcon = (emoji: string) =>
	`data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${emoji}</text></svg>`;

const shortcutIcon = (href: string) => ({
	tag: "link" as const,
	attrs: { rel: "shortcut icon", href },
});

const manifestLink = {
	tag: "link" as const,
	attrs: { rel: "manifest", href: "manifest.json" },
};

/** iOS ignores web-manifest icons; it needs an explicit touch icon link. */
const appleTouchIcon = (slug: string) => ({
	tag: "link" as const,
	attrs: { rel: "apple-touch-icon", href: `/icons/${slug}-192.png` },
});

type Meta = {
	title: string;
	description: string;
	path: string;
	themeColor: string;
	/** Per-app share image; defaults to the branded site-wide card. */
	image?: string;
	locale?: string;
	alternateLocales?: string[];
	type?: "website" | "profile";
};

/**
 * The static shell every app paints before its JavaScript runs.
 *
 * Each app is its own document, so changing page is a full navigation, and
 * measured from a real tap the gap between the document arriving and the app
 * rendering its first pixel is 400ms on most apps and 850ms on spooners, which
 * also pulls a 24MB dataset. `#root` is empty for all of it, so the user gets a
 * blank white screen — and a blank screen reads as "my tap was ignored", which
 * is worse than being slow, because tapping a blank page cannot do anything.
 *
 * This is markup in the HTML rather than a React component on purpose: it is
 * painted as soon as the render-blocking CSS lands, hundreds of milliseconds
 * before the bundle has parsed. Nothing here needs to know which app it is on.
 *
 * `head: false` puts it in `<body>` and `append` leaves it after `#root`, which
 * is what lets `base.css` retire it with a pure CSS sibling rule the moment
 * React renders — no mount hook in thirteen entry files, and no window in which
 * the shell and the app are both on screen.
 */
const bootShell = [
	{
		tag: "div",
		attrs: { class: "app-boot", "aria-hidden": "true" },
		head: false,
		children:
			'<div class="app-boot__bar"><span class="app-boot__mark"></span>' +
			'<span class="app-boot__title"></span></div>' +
			'<div class="app-boot__body"><span class="app-boot__line"></span>' +
			'<span class="app-boot__line app-boot__line--short"></span></div>',
	},
];

/** Shared canonical / description / social tags for every app. */
const metaTags = ({
	title,
	description,
	path,
	themeColor,
	image = OG_IMAGE,
	locale = "en_GB",
	alternateLocales = [],
	type = "website",
}: Meta) => {
	const url = `${SITE_URL}${path}`;
	return [
		{ tag: "meta", attrs: { name: "description", content: description } },
		{ tag: "meta", attrs: { name: "theme-color", content: themeColor } },
		{ tag: "link", attrs: { rel: "canonical", href: url } },
		// Open Graph
		{ tag: "meta", attrs: { property: "og:type", content: type } },
		{
			tag: "meta",
			attrs: { property: "og:site_name", content: "chneau.github.io" },
		},
		{ tag: "meta", attrs: { property: "og:title", content: title } },
		{
			tag: "meta",
			attrs: { property: "og:description", content: description },
		},
		{ tag: "meta", attrs: { property: "og:url", content: url } },
		{ tag: "meta", attrs: { property: "og:locale", content: locale } },
		...alternateLocales.map((alternate) => ({
			tag: "meta",
			attrs: { property: "og:locale:alternate", content: alternate },
		})),
		{ tag: "meta", attrs: { property: "og:image", content: image } },
		{ tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
		{ tag: "meta", attrs: { property: "og:image:height", content: "630" } },
		{ tag: "meta", attrs: { property: "og:image:alt", content: title } },
		// Twitter
		{
			tag: "meta",
			attrs: {
				name: "twitter:card",
				content: image ? "summary_large_image" : "summary",
			},
		},
		{ tag: "meta", attrs: { name: "twitter:title", content: title } },
		{
			tag: "meta",
			attrs: { name: "twitter:description", content: description },
		},
		...(image
			? [
					{ tag: "meta", attrs: { name: "twitter:image", content: image } },
					{
						tag: "meta",
						attrs: { name: "twitter:image:alt", content: title },
					},
				]
			: []),
	];
};

const jsonLd = (data: unknown) => ({
	tag: "script" as const,
	attrs: { type: "application/ld+json" },
	children: JSON.stringify(data),
});

const personLd = {
	"@context": "https://schema.org",
	"@type": "Person",
	name: "Charles Neau",
	jobTitle: "Senior Full-Stack & Systems Engineer",
	url: SITE_URL,
	email: "mailto:charles63500@gmail.com",
	address: {
		"@type": "PostalAddress",
		addressLocality: "Edinburgh",
		addressCountry: "GB",
	},
	sameAs: ["https://github.com/chneau", "https://linkedin.com/in/chneau"],
};

const websiteLd = {
	"@context": "https://schema.org",
	"@type": "WebSite",
	name: "chneau.github.io",
	url: SITE_URL,
	author: { "@type": "Person", name: "Charles Neau" },
};

const manifestCopy = (name: string) => [
	{ from: `./manifests/${name}.json`, to: "manifest.json" },
];

// A drawn mark rather than an emoji glyph, so the tab icon matches the
// desaturated crimson accent and renders identically across platforms.
const crimsonIcon =
	"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='rgb(20,20,24)'/><path d='M32 12l16 6v12c0 11-7 18-16 22-9-4-16-11-16-22V18z' fill='none' stroke='rgb(157,80,98)' stroke-width='4' stroke-linejoin='round'/></svg>";

/**
 * One rsbuild environment, derived from a single `APP_META` row.
 *
 * Everything the 13 blocks used to restate — the dist path, both asset
 * prefixes, the manifest copy, the browserslist, the polyfill, the manifest
 * link, the boot shell, the Apple touch icon — is a function of the app's
 * slug and path, so adding an app is one table row rather than a copy-paste.
 * The explicit `EnvironmentConfig` return type keeps the literal unions
 * (`polyfill: "usage"`, `type: "profile"`) from widening to `string`.
 */
const environmentFor = (meta: AppMeta): EnvironmentConfig => ({
	source: {
		entry: { index: meta.entry },
		// Only the environments with a consumer declare BUILD_DATE.
		...(meta.defineBuildDate
			? { define: { BUILD_DATE: JSON.stringify(nowStr) } }
			: {}),
	},
	html: {
		title: meta.title,
		tags: [
			...metaTags({
				title: meta.title,
				description: meta.description,
				path: meta.path,
				themeColor: meta.themeColor,
				type: meta.metaType,
				alternateLocales: meta.alternateLocales,
			}),
			...meta.jsonLd.map((kind) =>
				jsonLd(kind === "website" ? websiteLd : personLd),
			),
			manifestLink,
			...bootShell,
			appleTouchIcon(meta.slug),
			shortcutIcon(meta.emoji ? emojiIcon(meta.emoji) : crimsonIcon),
		],
	},
	dev: {
		assetPrefix: meta.path,
	},
	output: {
		distPath: {
			root: meta.path === "/" ? "dist" : `dist${meta.path.slice(0, -1)}`,
		},
		assetPrefix: meta.path,
		copy: [...manifestCopy(meta.slug), ...meta.copies],
		overrideBrowserslist: [">0%, defaults"],
		polyfill: "usage",
	},
});

export default defineConfig({
	plugins: [pluginReact()],
	source: {
		define: {
			// Site-wide, and deliberately NOT the per-environment `BUILD_DATE`
			// below: every app registers one shared service worker at scope "/",
			// and the token becomes the query string of its script URL. If two apps
			// asked for different tokens, moving between them would install a new
			// worker, take control of the page, and reload it. One value for the
			// whole origin, injected into every environment, is the only thing
			// that keeps a cross-app navigation from reloading.
			//
			// Second resolution (unlike the `BUILD_DATE` stamp, which is only ever
			// shown in a UI): this value is what evicts the previous deploy's
			// caches, so two deploys inside the same minute must still differ.
			SW_BUILD_ID: JSON.stringify(dayjs().format("YYYYMMDD-HHmmss-SSS")),
		},
	},
	server: {
		host: "localhost",
	},
	environments: Object.fromEntries(
		APP_META.map((meta) => [meta.slug, environmentFor(meta)]),
	),
});
