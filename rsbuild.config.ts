import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import dayjs from "dayjs";

const nowStr = dayjs().format("MMM D, HH:mm");

const createIconTag = (emoji: string) => ({
	tag: "link" as const,
	attrs: {
		rel: "shortcut icon",
		href: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${emoji}</text></svg>`,
	},
});

const manifestTag = {
	tag: "link" as const,
	attrs: {
		rel: "manifest",
		href: "/manifest.json",
	},
};

// A drawn mark rather than an emoji glyph, so the tab icon matches the
// desaturated crimson accent and renders identically across platforms.
const crimsonIconTag = {
	tag: "link" as const,
	attrs: {
		rel: "shortcut icon",
		href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='rgb(20,20,24)'/><path d='M32 12l16 6v12c0 11-7 18-16 22-9-4-16-11-16-22V18z' fill='none' stroke='rgb(157,80,98)' stroke-width='4' stroke-linejoin='round'/></svg>",
	},
};

const crimsonThemeTag = {
	tag: "meta" as const,
	attrs: {
		name: "theme-color",
		content: "#0e0e11",
	},
};

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
				tags: [manifestTag, createIconTag("🚀")],
			},
			dev: {
				assetPrefix: "/",
			},
			output: {
				distPath: { root: "dist" },
				assetPrefix: "/",
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
				tags: [manifestTag, createIconTag("📄")],
			},
			dev: {
				assetPrefix: "/cv/",
			},
			output: {
				distPath: { root: "dist/cv" },
				assetPrefix: "/cv/",
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
				tags: [manifestTag, createIconTag("🎂")],
			},
			dev: {
				assetPrefix: "/birthday/",
			},
			output: {
				distPath: { root: "dist/birthday" },
				assetPrefix: "/birthday/",
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
				tags: [manifestTag, createIconTag("🚆")],
			},
			dev: {
				assetPrefix: "/scotland-rail/",
			},
			output: {
				distPath: { root: "dist/scotland-rail" },
				assetPrefix: "/scotland-rail/",
				overrideBrowserslist: [">0%, defaults"],
				polyfill: "usage",
			},
		},
		"crimson-desert-save-editor": {
			source: {
				entry: { index: "./src/crimson-desert-save-editor/app/main.tsx" },
				define: { BUILD_DATE: JSON.stringify(nowStr) },
			},
			html: {
				title: "Crimson Desert Save Editor",
				tags: [crimsonIconTag, crimsonThemeTag],
			},
			dev: {
				assetPrefix: "/crimson-desert-save-editor/",
			},
			output: {
				distPath: { root: "dist/crimson-desert-save-editor" },
				assetPrefix: "/crimson-desert-save-editor/",
				copy: [
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
				tags: [createIconTag("🍺")],
			},
			dev: {
				assetPrefix: "/spooners/",
			},
			output: {
				distPath: { root: "dist/spooners" },
				assetPrefix: "/spooners/",
				copy: [
					{
						from: "./src/spooners/data/data.json",
						to: "data.json",
					},
				],
				overrideBrowserslist: [">0%, defaults"],
				polyfill: "usage",
			},
		},
	},
});
