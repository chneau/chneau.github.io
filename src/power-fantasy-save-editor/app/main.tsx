import type { MantineColorsTuple } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../../shared/tokens.css";
import "../../shared/base.css";
import { mountApp } from "../../shared/mountApp";
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

mountApp({ analyticsId: "power-fantasy-save-editor", brand, app: <Home /> });
