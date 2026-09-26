import "@mantine/core/styles.css";
import "leaflet/dist/leaflet.css";
import "./spooners.css";
import {
	createTheme,
	type MantineColorsTuple,
	MantineProvider,
} from "@mantine/core";
import { createRoot } from "react-dom/client";
import { App } from "./App";

/** Warm amber, in keeping with a decent pint. */
const amber: MantineColorsTuple = [
	"#fff8e1",
	"#ffecb3",
	"#ffdf80",
	"#ffd24d",
	"#ffc61a",
	"#e6ad00",
	"#b38600",
	"#805f00",
	"#4d3900",
	"#1a1300",
];

const theme = createTheme({
	primaryColor: "amber",
	primaryShade: { light: 5, dark: 4 },
	colors: { amber },
	defaultRadius: "md",
	fontFamily: '"Segoe UI Variable", "Segoe UI", Arial, sans-serif',
	headings: { fontFamily: 'Georgia, "Times New Roman", serif' },
});

const container = document.getElementById("root");
if (!container) {
	throw new Error("Root container #root was not found.");
}

const app = (
	<MantineProvider theme={theme} defaultColorScheme="dark">
		<App />
	</MantineProvider>
);

if (import.meta.hot) {
	import.meta.hot.data.root ??= createRoot(container);
	import.meta.hot.data.root.render(app);
} else {
	createRoot(container).render(app);
}
