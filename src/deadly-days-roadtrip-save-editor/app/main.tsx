import { type MantineColorsTuple, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../../shared/tokens.css";
import "../../shared/base.css";
import { Notifications } from "@mantine/notifications";
import { createRoot } from "react-dom/client";
import { createAppTheme, registerServiceWorker } from "../../shared";
// By path, not via the barrel: analytics is a side-effectful module and must
// not be dragged onto every app that imports a single shared component.
import { initAnalytics } from "../../shared/analytics";
import { Home } from "./page";

/**
 * Sun-bleached tarmac and hazard amber, for a game about a road trip across a
 * dust bowl. Index 5 is the dark-scheme shade, 6 the light-scheme one.
 */
const brand: MantineColorsTuple = [
	"#fdf3e3",
	"#f8e2c0",
	"#f0c894",
	"#e8ac66",
	"#e29644",
	"#de8a2f",
	"#d97f24",
	"#bd6c1c",
	"#a15c17",
	"#834a10",
];

const theme = createAppTheme({
	accent: brand,
	accentName: "brand",
	primaryShade: { light: 6, dark: 5 },
	defaultRadius: "sm",
	overrides: {
		defaultGradient: { from: "brand.6", to: "brand.4", deg: 135 },
	},
});

const container = document.getElementById("root");

if (!container) {
	throw new Error("Root container #root was not found in index.html.");
}

// Site-wide analytics and offline support. Neither touches save data.
initAnalytics("deadly-days-roadtrip-save-editor");
registerServiceWorker();

const app = (
	<MantineProvider theme={theme} defaultColorScheme="dark">
		<Notifications />
		<Home />
	</MantineProvider>
);

if (import.meta.hot) {
	// Reuse the root across hot updates so React state survives HMR.
	import.meta.hot.data.root ??= createRoot(container);
	import.meta.hot.data.root.render(app);
} else {
	createRoot(container).render(app);
}
