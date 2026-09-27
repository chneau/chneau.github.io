import "@mantine/core/styles.css";
import "../shared/tokens.css";
import "../shared/base.css";
import "./scotland-rail.css";
import { MantineProvider } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { railTheme } from "./theme";

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");
const root = createRoot(container);
root.render(
	<MantineProvider theme={railTheme} defaultColorScheme="dark">
		<App />
	</MantineProvider>,
);
