import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../shared/tokens.css";
import "../shared/base.css";
import "leaflet/dist/leaflet.css";
import "./spooners.css";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { createRoot } from "react-dom/client";
import { registerServiceWorker } from "../shared";
// By path, not via the barrel: analytics is a side-effectful module and must
// not be dragged onto every app that imports a single shared component.
import { initAnalytics } from "../shared/analytics";
import { App } from "./App";
import { spoonersTheme } from "./theme";

initAnalytics("spooners");
registerServiceWorker();

const container = document.getElementById("root");
if (!container) {
	throw new Error("Root container #root was not found.");
}

const app = (
	<MantineProvider theme={spoonersTheme} defaultColorScheme="dark">
		<Notifications />
		<App />
	</MantineProvider>
);

if (import.meta.hot) {
	import.meta.hot.data.root ??= createRoot(container);
	import.meta.hot.data.root.render(app);
} else {
	createRoot(container).render(app);
}
