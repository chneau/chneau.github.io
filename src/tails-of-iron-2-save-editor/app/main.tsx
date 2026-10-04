import type { MantineColorsTuple } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../../shared/tokens.css";
import "../../shared/base.css";
import { mountApp } from "../../shared/mountApp";
import { Home } from "./page";

/**
 * Cold steel, for a game about a cat in a post-apocalyptic winter. Index 5 is
 * the dark-scheme shade, 6 the light-scheme shade.
 */
const brand: MantineColorsTuple = [
	"#eaf2fa",
	"#d3e2f0",
	"#a8c4de",
	"#7ba5c9",
	"#598ab6",
	"#4577a7",
	"#3a6694",
	"#2e5379",
	"#23425f",
	"#183145",
];

mountApp({ analyticsId: "tails-of-iron-2-save-editor", brand, app: <Home /> });
