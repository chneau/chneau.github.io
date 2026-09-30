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
 * The single accent: arterial red, for a game whose currency is Blood Rubies
 * and whose unlock currency is blood runes. Deliberately more saturated than
 * the Crimson Desert editor's washed-out crimson, so the two save editors on
 * this site do not read as the same page. Index 5 is the dark-scheme shade, 6
 * the light-scheme shade.
 */
const brand: MantineColorsTuple = [
	"#fdecee",
	"#f9d8dd",
	"#f2aeba",
	"#e98494",
	"#de5c74",
	"#d44a63",
	"#b8344c",
	"#94273c",
	"#701d2e",
	"#4c1220",
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
initAnalytics("power-fantasy-save-editor");
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
