import {
	createTheme,
	type MantineColorsTuple,
	MantineProvider,
} from "@mantine/core";
import "@mantine/core/styles.css";
import { createRoot } from "react-dom/client";
import { Home } from "./page";

/** Warm gold accent carried over from the previous theme. */
const brand: MantineColorsTuple = [
	"#fdf8e7",
	"#f8ecc2",
	"#f0dc94",
	"#e6c866",
	"#d9ae3c",
	"#c1972f",
	"#a67e28",
	"#856521",
	"#664d19",
	"#473512",
];

const theme = createTheme({
	primaryColor: "brand",
	primaryShade: { light: 6, dark: 4 },
	colors: { brand },
	defaultRadius: "sm",
	fontFamily: '"Segoe UI Variable", "Segoe UI", Arial, sans-serif',
	fontFamilyMonospace: '"Cascadia Code", Consolas, monospace',
	headings: { fontFamily: 'Georgia, "Times New Roman", serif' },
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
