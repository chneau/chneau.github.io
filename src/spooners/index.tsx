import "@mantine/core/styles.css";
import "leaflet/dist/leaflet.css";
import "./spooners.css";
import { MantineProvider } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { spoonersTheme } from "./theme";

const container = document.getElementById("root");
if (!container) {
	throw new Error("Root container #root was not found.");
}

const app = (
	<MantineProvider theme={spoonersTheme} defaultColorScheme="dark">
		<App />
	</MantineProvider>
);

if (import.meta.hot) {
	import.meta.hot.data.root ??= createRoot(container);
	import.meta.hot.data.root.render(app);
} else {
	createRoot(container).render(app);
}
