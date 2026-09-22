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
			output: {
				distPath: { root: "dist" },
				assetPrefix: "/",
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
				tags: [createIconTag("⚔️")],
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
	},
});
