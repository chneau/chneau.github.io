import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/charts/styles.css";
import "../shared/tokens.css";
import "../shared/base.css";
import "./taste.css";
import "./i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { initAnalytics, registerServiceWorker } from "../shared";
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

initAnalytics();
registerServiceWorker();

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");

// Apply the persisted theme before first paint to avoid a flash.
try {
	const saved = localStorage.getItem("store");
	const dark = saved ? JSON.parse(saved).darkMode !== false : true;
	document.documentElement.dataset.theme = dark ? "dark" : "light";
} catch {
	document.documentElement.dataset.theme = "dark";
}

const root = createRoot(container);
root.render(
	<QueryClientProvider client={queryClient}>
		<App />
	</QueryClientProvider>,
);
