import "../shared/tokens.css";
import "../shared/base.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./cv.css";

// Resolve the theme before the first paint so dark mode never flashes.
const saved = localStorage.getItem("chneau_cv_theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.dataset.theme =
	saved === "dark" || (saved === null && prefersDark) ? "dark" : "light";

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");
const root = createRoot(container);
root.render(<App />);
