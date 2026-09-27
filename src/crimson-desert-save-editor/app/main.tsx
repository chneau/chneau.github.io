import { type MantineColorsTuple, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "../../shared/tokens.css";
import "../../shared/base.css";
import { createRoot } from "react-dom/client";
import { createAppTheme } from "../../shared";
import { Home } from "./page";

/**
 * The single accent: a weathered crimson, desaturated well below the neon
 * range so it reads as dyed leather rather than an AI glow. Index 5 is the
 * dark-scheme shade, 6 the light-scheme shade.
 */
const brand: MantineColorsTuple = [
	"#f8eef0",
	"#efdde1",
	"#dcb9c1",
	"#c8919d",
	"#b26b7a",
	"#9d5062",
	"#833f50",
	"#683240",
	"#4f2731",
	"#381c23",
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

// Deliberately not wrapped in StrictMode: it double-invokes every render in
// development, and this page keeps all of its state in one component, so that
// doubles the cost of every interaction while developing.
const app = (
	<MantineProvider theme={theme} defaultColorScheme="dark">
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
