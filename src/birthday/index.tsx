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
// By path, not via the barrel: analytics is a side-effectful module and must
// not be dragged onto every app that imports a single shared component.
import { initAnalytics } from "../shared/analytics";
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

initAnalytics("birthday");
registerServiceWorker();

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");

/**
 * Fold this app's old boolean preference into the site-wide theme key.
 *
 * The scheme lived in the Valtio store's own blob (`localStorage["store"]`,
 * field `darkMode`) and defaulted to dark for everyone. The shared key defaults
 * to following the OS, so without this a returning visitor who had never touched
 * the toggle would have had their first paint flip from dark to whatever their
 * desktop reports. Seeding the shared key from the old value keeps what they
 * chose, which is the only thing that is actually theirs.
 *
 * Runs before `initTheme()` and only when the shared key is still unset, so an
 * explicit site-wide choice always wins over this.
 */
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
	} catch {
		// Blocked storage, or a corrupt blob: `initTheme` falls back to the OS,
		// which is the right answer for a visitor with no usable preference.
	}
};

migrateBirthdayTheme();
// Apply the persisted theme before first paint to avoid a flash. Writes both
// `data-theme` and `data-mantine-color-scheme`; the hand-rolled block this
// replaces wrote only the first, so Mantine's half disagreed with the tokens.
initTheme();

const root = createRoot(container);
root.render(
	<QueryClientProvider client={queryClient}>
		<App />
	</QueryClientProvider>,
);
