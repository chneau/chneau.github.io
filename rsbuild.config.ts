import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import dayjs from "dayjs";

export default defineConfig({
	plugins: [pluginReact()],
	server: { host: "localhost" },
	html: { title: dayjs().format("MM-DD HH:mm") },
	output: {
		overrideBrowserslist: [">0%, defaults"],
		polyfill: "usage",
	},
});
