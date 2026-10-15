import "@mantine/core/styles.css";
import "../shared/tokens.css";
import "../shared/base.css";
import { createRoot } from "react-dom/client";
import { initTheme, registerServiceWorker } from "../shared";
import { initAnalytics } from "../shared/analytics";
import { App } from "./App";
import "./cv.css";

initTheme();

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");
const root = createRoot(container);
root.render(<App />);

initAnalytics("cv");
registerServiceWorker();
