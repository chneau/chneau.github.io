import {
	createTheme,
	type MantineColorsTuple,
	MantineProvider,
} from "@mantine/core";
import "@mantine/core/styles.css";
import "@fontsource/geist-sans/latin-400.css";
import "@fontsource/geist-sans/latin-500.css";
import "@fontsource/geist-sans/latin-600.css";
import "@fontsource/geist-sans/latin-700.css";
import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist-mono/latin-500.css";
import { createRoot } from "react-dom/client";
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

/**
 * A zinc-leaning neutral ramp with no pure black at the bottom. The app leans
 * on dark-4 for hairlines, dark-6 for raised surfaces and dark-9 for the rail.
 */
const dark: MantineColorsTuple = [
	"#f3f3f4",
	"#e4e4e7",
	"#a9a9b1",
	"#78787f",
	"#3f3f46",
	"#2b2b30",
	"#232327",
	"#1b1b1f",
	"#151518",
	"#0e0e11",
];

/** Diffusion shadows tinted toward the background, never a flat black drop. */
const shadows = {
	xs: "0 1px 2px rgba(14, 10, 12, 0.35)",
	sm: "0 4px 12px -2px rgba(14, 10, 12, 0.45)",
	md: "0 12px 28px -8px rgba(14, 10, 12, 0.55)",
	lg: "0 24px 48px -16px rgba(14, 10, 12, 0.6)",
	xl: "0 40px 72px -24px rgba(14, 10, 12, 0.68)",
};

const theme = createTheme({
	primaryColor: "brand",
	primaryShade: { light: 6, dark: 5 },
	colors: { brand, dark },
	defaultRadius: "sm",
	shadows,
	fontFamily:
		'"Geist", "Geist Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
	fontFamilyMonospace:
		'"Geist Mono", "JetBrains Mono", ui-monospace, "Cascadia Code", monospace',
	headings: {
		// No serif: this is a tool, not an editorial page. Hierarchy comes from
		// weight and colour rather than an oversized first heading.
		fontFamily: '"Geist", "Geist Sans", system-ui, sans-serif',
		fontWeight: "600",
		sizes: {
			h1: {
				fontSize: "clamp(2.25rem, 4.2vw, 3.5rem)",
				lineHeight: "1.02",
				fontWeight: "600",
			},
			h2: { fontSize: "clamp(1.4rem, 2.2vw, 1.9rem)", lineHeight: "1.15" },
			h3: { fontSize: "1.2rem", lineHeight: "1.25" },
		},
	},
	fontSmoothing: true,
	autoContrast: true,
	luminanceThreshold: 0.35,
	defaultGradient: { from: "brand.6", to: "brand.4", deg: 135 },
	components: {
		Badge: {
			defaultProps: { radius: "sm" },
			styles: {
				label: {
					textTransform: "none",
					letterSpacing: "0.01em",
					fontWeight: 600,
				},
			},
		},
		Button: {
			defaultProps: { radius: "sm" },
			styles: { root: { letterSpacing: "0.01em" } },
		},
		Paper: { defaultProps: { radius: "md" } },
		Card: { defaultProps: { radius: "md" } },
		NavLink: { defaultProps: { radius: "sm" } },
		Alert: { defaultProps: { radius: "md" } },
		Modal: { defaultProps: { radius: "md", centered: true } },
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
