import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../shared/tokens.css";
import "../shared/base.css";
import "./spooners.css";
import { Notifications } from "@mantine/notifications";
import { createRoot } from "react-dom/client";
import { initTheme, registerServiceWorker, ThemedProvider } from "../shared";
import { initAnalytics } from "../shared/analytics";
import { App } from "./App";
import { spoonersTheme } from "./theme";

initTheme();
initAnalytics("spooners");
registerServiceWorker();

const container = document.getElementById("root");
if (!container) {
	throw new Error("Root container #root was not found.");
}

const app = (
	<ThemedProvider theme={spoonersTheme}>
		<Notifications />
		<App />
	</ThemedProvider>
);

if (import.meta.hot) {
	import.meta.hot.data.root ??= createRoot(container);
	import.meta.hot.data.root.render(app);
} else {
	createRoot(container).render(app);
}
