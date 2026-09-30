import "@mantine/core/styles.css";
import "../shared/tokens.css";
import "../shared/base.css";
import "./scotland-rail.css";
import { MantineProvider } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { registerServiceWorker } from "../shared";
// By path, not via the barrel: analytics is a side-effectful module and must
// not be dragged onto every app that imports a single shared component.
import { initAnalytics } from "../shared/analytics";
import { App } from "./App";
import { railTheme } from "./theme";

initAnalytics("scotland-rail");
registerServiceWorker();

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");
const root = createRoot(container);
root.render(
	<MantineProvider theme={railTheme} defaultColorScheme="dark">
		<App />
	</MantineProvider>,
);
