import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import dayjs from "dayjs";

const nowStr = dayjs().format("MMM D, HH:mm");

const app = process.env.APP || "root";

const getAppConfig = () => {
	switch (app) {
		case "birthday":
			return {
				entry: "./src/birthday/index.tsx",
				title: "Birthday Tracker",
				icon: "🎂",
				distPath: "dist/birthday",
				assetPrefix: "/birthday/",
			};
		case "scotland-rail":
			return {
				entry: "./src/scotland-rail/index.tsx",
				title: "A Day in Scottish Rail | 24h Replay",
				icon: "🚆",
				distPath: "dist/scotland-rail",
				assetPrefix: "/scotland-rail/",
			};
		default:
			return {
				entry: "./src/root/index.tsx",
				title: "chneau.github.io",
				icon: "🚀",
				distPath: "dist/root",
				assetPrefix: "/",
			};
	}
};

const currentApp = getAppConfig();

export default defineConfig({
	plugins: [pluginReact()],
	server: { host: "localhost" },
	source: {
		entry: {
			index: currentApp.entry,
		},
		define: {
			BUILD_DATE: JSON.stringify(nowStr),
		},
	},
	html: {
		title: currentApp.title,
		tags: [
			{
				tag: "link",
				attrs: {
					rel: "manifest",
					href: "/manifest.json",
				},
			},
			{
				tag: "link",
				attrs: {
					rel: "shortcut icon",
					href: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${currentApp.icon}</text></svg>`,
				},
			},
		],
	},
	output: {
		assetPrefix: currentApp.assetPrefix,
		distPath: {
			root: currentApp.distPath,
		},
		overrideBrowserslist: [">0%, defaults"],
		polyfill: "usage",
	},
});
