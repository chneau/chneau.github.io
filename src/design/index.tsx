import "@mantine/core/styles.css";
import "../shared/tokens.css";
import "../shared/base.css";
import "./design.css";
import { createRoot } from "react-dom/client";
import { initTheme, registerServiceWorker } from "../shared";
import { initAnalytics } from "../shared/analytics";
import { App } from "./App";

initTheme();
initAnalytics("design");
registerServiceWorker();

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");
const root = createRoot(container);
root.render(<App />);
