import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import dayjs from "dayjs";

const nowStr = dayjs().format("MMM D, HH:mm");

const app = process.env.APP || "root";
const isBirthday = app === "birthday";

export default defineConfig({
	plugins: [pluginReact()],
	server: { host: "localhost" },
	source: {
		entry: {
			index: isBirthday ? "./src/birthday/index.tsx" : "./src/root/index.tsx",
		},
		define: {
			BUILD_DATE: JSON.stringify(nowStr),
		},
	},
	html: {
		title: isBirthday ? "Birthday Tracker" : "chneau.github.io",
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
					href: isBirthday
						? "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎂</text></svg>"
						: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚀</text></svg>",
				},
			},
		],
	},
	output: {
		assetPrefix: isBirthday ? "/birthday/" : "/",
		distPath: {
			root: isBirthday ? "dist/birthday" : "dist/root",
		},
		overrideBrowserslist: [">0%, defaults"],
		polyfill: "usage",
	},
});
