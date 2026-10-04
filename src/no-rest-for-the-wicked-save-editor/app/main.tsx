import type { MantineColorsTuple } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../../shared/tokens.css";
import "../../shared/base.css";
import { mountApp } from "../../shared/mountApp";
import { Home } from "./page";

/**
 * Burnt ember, for a game about a dying world that will not let you rest. Index
 * 5 is the dark-scheme shade, 6 the light-scheme one.
 */
const brand: MantineColorsTuple = [
	"#fdf0e9",
	"#f8e0d5",
	"#f0c2b0",
	"#e5a08a",
	"#d97f66",
	"#c8654c",
	"#a84e39",
	"#853a2b",
	"#642a20",
	"#3d1a14",
];

mountApp({
	analyticsId: "no-rest-for-the-wicked-save-editor",
	brand,
	app: <Home />,
});
