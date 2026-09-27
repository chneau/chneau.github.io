import "@mantine/core/styles.css";
import "../shared/tokens.css";
import "../shared/base.css";
import { createRoot } from "react-dom/client";
import { initAnalytics, registerServiceWorker } from "../shared";
import { App } from "./App";

initAnalytics();

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");
const root = createRoot(container);
root.render(<App />);

registerServiceWorker();
