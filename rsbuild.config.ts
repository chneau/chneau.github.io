import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import dayjs from "dayjs";

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

export default defineConfig({
	plugins: [pluginReact()],
	server: {
		host: "localhost",
	},
	environments: {
		root: {
			source: {
				entry: { index: "./src/root/index.tsx" },
				define: { BUILD_DATE: JSON.stringify(nowStr) },
			},
			html: {
				title: "chneau.github.io",
				tags: [
					...metaTags({
						title: "chneau.github.io",
						description:
							"Personal hub and web apps by chneau — CV, birthday tracker, Scottish rail replay, save editor and pub price maps.",
						path: "/",
						themeColor: "#1677ff",
					}),
					jsonLd(websiteLd),
					jsonLd(personLd),
					manifestLink,
					appleTouchIcon("root"),
					shortcutIcon(emojiIcon("🚀")),
				],
			},
			dev: {
				assetPrefix: "/",
			},
			output: {
				distPath: { root: "dist" },
				assetPrefix: "/",
				copy: manifestCopy("root"),
				overrideBrowserslist: [">0%, defaults"],
				polyfill: "usage",
			},
		},
		cv: {
			source: {
				entry: { index: "./src/cv/index.tsx" },
				define: { BUILD_DATE: JSON.stringify(nowStr) },
			},
			html: {
				title: "Charles Neau | Curriculum Vitae",
				tags: [
					...metaTags({
						title: "Charles Neau | Curriculum Vitae",
						description:
							"Senior Full-Stack & Systems Engineer — 10+ years experience across Go, TypeScript, React 19, Python, cloud infrastructure & optimization.",
						path: "/cv/",
						themeColor: "#127f5f",
						type: "profile",
					}),
					jsonLd(personLd),
					manifestLink,
					appleTouchIcon("cv"),
					shortcutIcon(emojiIcon("📄")),
				],
			},
			dev: {
				assetPrefix: "/cv/",
			},
			output: {
				distPath: { root: "dist/cv" },
				assetPrefix: "/cv/",
				copy: manifestCopy("cv"),
				overrideBrowserslist: [">0%, defaults"],
				polyfill: "usage",
			},
		},
		birthday: {
			source: {
				entry: { index: "./src/birthday/index.tsx" },
				define: { BUILD_DATE: JSON.stringify(nowStr) },
			},
			html: {
				title: "Birthday Tracker",
				tags: [
					...metaTags({
						title: "Birthday Tracker",
						description:
							"Track birthdays, milestones, biorhythms, zodiac signs, and export calendar events.",
						path: "/birthday/",
						themeColor: "#34d399",
						alternateLocales: [
							"de_DE",
							"es_ES",
							"fr_FR",
							"gd_GB",
							"ty_PF",
							"zh_CN",
						],
					}),
					manifestLink,
					appleTouchIcon("birthday"),
					shortcutIcon(emojiIcon("🎂")),
				],
			},
			dev: {
				assetPrefix: "/birthday/",
			},
			output: {
				distPath: { root: "dist/birthday" },
				assetPrefix: "/birthday/",
				copy: manifestCopy("birthday"),
				overrideBrowserslist: [">0%, defaults"],
				polyfill: "usage",
			},
		},
		"scotland-rail": {
			source: {
				entry: { index: "./src/scotland-rail/index.tsx" },
				define: { BUILD_DATE: JSON.stringify(nowStr) },
			},
			html: {
				title: "A Day in Scottish Rail | 24h Replay",
				tags: [
					...metaTags({
						title: "A Day in Scottish Rail | 24h Replay",
						description:
							"Interactive 24-hour time-lapse train replay across Scotland's rail network.",
						path: "/scotland-rail/",
						themeColor: "#5aa9c9",
					}),
					manifestLink,
					appleTouchIcon("scotland-rail"),
					shortcutIcon(emojiIcon("🚆")),
				],
			},
			dev: {
				assetPrefix: "/scotland-rail/",
			},
			output: {
				distPath: { root: "dist/scotland-rail" },
				assetPrefix: "/scotland-rail/",
				copy: manifestCopy("scotland-rail"),
				overrideBrowserslist: [">0%, defaults"],
				polyfill: "usage",
			},
		},
		"crimson-desert-save-editor": {
			source: {
				entry: {
					index: "./src/crimson-desert-save-editor/app/main.tsx",
				},
				define: { BUILD_DATE: JSON.stringify(nowStr) },
			},
			html: {
				title: "Crimson Desert Save Editor",
				tags: [
					...metaTags({
						title: "Crimson Desert Save Editor",
						description:
							"Edit Crimson Desert save files — inventory, gear, skills, quests and companions — entirely on your device.",
						path: "/crimson-desert-save-editor/",
						themeColor: "#9d5062",
					}),
					manifestLink,
					appleTouchIcon("crimson-desert-save-editor"),
					shortcutIcon(crimsonIcon),
				],
			},
			dev: {
				assetPrefix: "/crimson-desert-save-editor/",
			},
			output: {
				distPath: { root: "dist/crimson-desert-save-editor" },
				assetPrefix: "/crimson-desert-save-editor/",
				copy: [
					...manifestCopy("crimson-desert-save-editor"),
					{
						from: "./src/crimson-desert-save-editor/assets/image-archive",
						to: "image-archive",
					},
				],
				overrideBrowserslist: [">0%, defaults"],
				polyfill: "usage",
			},
		},
		spooners: {
			source: {
				entry: { index: "./src/spooners/index.tsx" },
				define: { BUILD_DATE: JSON.stringify(nowStr) },
			},
			html: {
				title: "Spooners | Pub prices on a map",
				tags: [
					...metaTags({
						title: "Spooners | Pub prices on a map",
						description:
							"See what every pub charges for the same drink or dish — searchable map, cheapest-to-dearest rankings and price distribution charts.",
						path: "/spooners/",
						themeColor: "#e6ad00",
					}),
					manifestLink,
					appleTouchIcon("spooners"),
					shortcutIcon(emojiIcon("🍺")),
				],
			},
			dev: {
				assetPrefix: "/spooners/",
			},
			output: {
				distPath: { root: "dist/spooners" },
				assetPrefix: "/spooners/",
				copy: [
					...manifestCopy("spooners"),
					{
						from: "./src/spooners/data/data.json",
						to: "data.json",
					},
				],
				overrideBrowserslist: [">0%, defaults"],
				polyfill: "usage",
			},
		},
		design: {
			source: {
				entry: { index: "./src/design/index.tsx" },
				define: { BUILD_DATE: JSON.stringify(nowStr) },
			},
			html: {
				title: "Design System | chneau.github.io",
				tags: [
					...metaTags({
						title: "Design System | chneau.github.io",
						description:
							"The shared tokens, components and patterns behind every app on this site.",
						path: "/design/",
						themeColor: "#6366f1",
					}),
					manifestLink,
					appleTouchIcon("design"),
					shortcutIcon(emojiIcon("🧩")),
				],
			},
			dev: {
				assetPrefix: "/design/",
			},
			output: {
				distPath: { root: "dist/design" },
				assetPrefix: "/design/",
				copy: manifestCopy("design"),
				overrideBrowserslist: [">0%, defaults"],
				polyfill: "usage",
			},
		},
	},
});
