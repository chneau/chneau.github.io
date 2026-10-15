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
import { initTheme, registerServiceWorker, THEME_MODE_KEY } from "../shared";
import { initAnalytics } from "../shared/analytics";
import { App } from "./App";

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

initAnalytics("birthday");
registerServiceWorker();

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");

const migrateBirthdayTheme = () => {
	try {
		if (localStorage.getItem(THEME_MODE_KEY) !== null) return;
		const saved = localStorage.getItem("store");
		if (saved === null) return;
		const parsed: unknown = JSON.parse(saved);
		if (typeof parsed !== "object" || parsed === null) return;
		const darkMode = (parsed as { darkMode?: unknown }).darkMode;
		if (typeof darkMode !== "boolean") return;
		localStorage.setItem(
			THEME_MODE_KEY,
			JSON.stringify(darkMode ? "dark" : "light"),
		);
	} catch {}
};

migrateBirthdayTheme();
initTheme();

const root = createRoot(container);
root.render(
	<QueryClientProvider client={queryClient}>
		<App />
	</QueryClientProvider>,
);
