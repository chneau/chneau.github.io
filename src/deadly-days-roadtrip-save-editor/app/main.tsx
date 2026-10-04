import type { MantineColorsTuple } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../../shared/tokens.css";
import "../../shared/base.css";
import { mountApp } from "../../shared/mountApp";
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

mountApp({
	analyticsId: "deadly-days-roadtrip-save-editor",
	brand,
	app: <Home />,
});
