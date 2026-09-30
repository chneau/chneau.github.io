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
 * Night City yellow, for a game about a city that never sees the sun.
 *
 * The game's own palette is a hot yellow against near-black, so this ramp runs
 * from a washed-out cream through to a deep amber, which keeps a light scheme
 * legible rather than glaring. Index 5 is the dark-scheme shade, 6 the light one.
 */
const brand: MantineColorsTuple = [
	"#fff9e0",
	"#fdefb8",
	"#f8e071",
	"#f3d13a",
	"#efc612",
	"#e3ad00",
	"#c98f00",
	"#a97000",
	"#885300",
	"#6b3d00",
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
initAnalytics("cyberpunk-2077-save-editor");
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
