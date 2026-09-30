/*
 * The gallery's own stylesheet.
 *
 * It carries the site-provided accent (`design.css`) and the gallery furniture.
 * It is imported *after* `base.css` so the app-local layer always wins, and
 * before React mounts so there is no unstyled first paint.
 */
import "@mantine/core/styles.css";
import "../shared/tokens.css";
import "../shared/base.css";
import "./design.css";
import { createRoot } from "react-dom/client";
import { initTheme, registerServiceWorker } from "../shared";
// By path, not via the barrel: analytics is a side-effectful module and must
// not be dragged onto every app that imports a single shared component.
import { initAnalytics } from "../shared/analytics";
import { App } from "./App";

// Resolve the stored theme (or the OS preference) before the first paint. The
// design gallery reads its tokens back off `<html>`, so this has to be right
// before React mounts or every swatch would report drift.
initTheme();
initAnalytics("design");
registerServiceWorker();

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");
const root = createRoot(container);
root.render(<App />);
