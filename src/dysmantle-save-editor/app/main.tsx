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
 * Sun-bleached olive and canvas, for a game about a world that is trying to end.
 * Index 5 is the dark-scheme shade, 6 the light-scheme shade.
 */
const brand: MantineColorsTuple = [
	"#f4f4e6",
	"#e4e3c9",
	"#c8c6a2",
	"#acaa7b",
	"#93915c",
	"#7f7d47",
	"#6d6b3b",
	"#5b592f",
	"#4a4826",
	"#3a381d",
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
initAnalytics("dysmantle-save-editor");
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
