import "antd/dist/reset.css";
import "./i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import posthog from "posthog-js/dist/module.full";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Patch getContext to set willReadFrequently: true for 2D contexts
// This fixes the warning: "Canvas2D: Multiple readback operations using getImageData are faster with the willReadFrequently attribute set to true."
const originalGetContext = HTMLCanvasElement.prototype.getContext;
// @ts-expect-error
HTMLCanvasElement.prototype.getContext = function (
	type: string,
	// biome-ignore lint/suspicious/noExplicitAny: explicit any needed
	options?: any,
) {
	if (type === "2d") {
		options = options || {};
		options.willReadFrequently = true;
	}
	return originalGetContext.call(this, type, options);
};

const queryClient = new QueryClient();

posthog.init("phc_y32qC29aZS8xjNez6YBKH6r1EdaV6mQHDJd38j9Eiun", {
	api_host: "https://ph.celerum.online/@",
	ui_host: "https://eu.posthog.com",
	defaults: "2025-11-30",
});
console.log("PostHog initialized");

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");
const root = createRoot(container);
root.render(
	<QueryClientProvider client={queryClient}>
		<App />
	</QueryClientProvider>,
);

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register("/sw.js")
			.then((x) => console.log("SW registered: ", x))
			.catch((e) => console.log("SW registration failed: ", e));
	});
}
