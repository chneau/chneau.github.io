import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import dayjs from "dayjs";

const nowStr = dayjs().format("MMM D, HH:mm");

export default defineConfig({
	plugins: [pluginReact()],
	server: { host: "localhost" },
	source: { define: { "import.meta.env.BUILD_DATE": JSON.stringify(nowStr) } },
	html: {
		title: nowStr,
		tags: [
			{
				tag: "link",
				attrs: {
					rel: "shortcut icon",
					href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎂</text></svg>",
				},
			},
		],
	},
	output: {
		overrideBrowserslist: [">0%, defaults"],
		polyfill: "usage",
	},
});
