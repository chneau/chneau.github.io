import "antd/dist/reset.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { type BeforeInstallPromptEvent, store } from "./store.ts";

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");
const root = createRoot(container);
root.render(
	<StrictMode>
		<App />
	</StrictMode>,
);

window.addEventListener("beforeinstallprompt", (e) => {
	e.preventDefault();
	store.installPrompt = e as BeforeInstallPromptEvent;
});

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register("/sw.js")
			.then((registration) => {
				console.log("SW registered: ", registration);
			})
			.catch((registrationError) => {
				console.log("SW registration failed: ", registrationError);
			});
	});
}
