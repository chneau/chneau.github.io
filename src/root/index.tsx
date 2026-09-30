import "@mantine/core/styles.css";
import "../shared/tokens.css";
import "../shared/base.css";
import { createRoot } from "react-dom/client";
import {
	initAnalytics,
	initTheme,
	ROOT_THEME_KEY,
	registerServiceWorker,
} from "../shared";
import { App } from "./App";

// Apply the stored theme before the first paint to avoid a colour flash.
initTheme(ROOT_THEME_KEY);
initAnalytics();

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");
const root = createRoot(container);
root.render(<App />);

registerServiceWorker();
