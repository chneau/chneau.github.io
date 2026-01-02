import "antd/dist/reset.css";
import posthog from "posthog-js/dist/module.full";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

posthog.init("phc_y32qC29aZS8xjNez6YBKH6r1EdaV6mQHDJd38j9Eiun", {
	api_host: "https://ph.celerum.online/@",
	ui_host: "https://eu.posthog.com",
	defaults: "2025-11-30",
});
console.log("PostHog initialized");

const container = document.getElementById("root");
if (!container) throw new Error("No root element found");
const root = createRoot(container);
root.render(<App />);

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register("/sw.js")
			.then((x) => console.log("SW registered: ", x))
			.catch((e) => console.log("SW registration failed: ", e));
	});
}
