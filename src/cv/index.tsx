import "@mantine/core/styles.css";
import "../shared/tokens.css";
import "../shared/base.css";
import { createRoot } from "react-dom/client";
import { initTheme, registerServiceWorker } from "../shared";
// By path, not via the barrel: analytics is a side-effectful module and must
// not be dragged onto every app that imports a single shared component.
import { initAnalytics } from "../shared/analytics";
import { App } from "./App";
import "./cv.css";

// Resolve the stored theme (or the OS preference) before the first paint so
// dark mode never flashes.
initTheme();

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");
const root = createRoot(container);
root.render(<App />);

initAnalytics("cv");
registerServiceWorker();
