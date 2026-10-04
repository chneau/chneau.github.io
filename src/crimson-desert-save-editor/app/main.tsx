import type { MantineColorsTuple } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../../shared/tokens.css";
import "../../shared/base.css";
import "../crimson-desert-save-editor.css";
import { mountApp } from "../../shared/mountApp";
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

mountApp({ analyticsId: "crimson-desert-save-editor", brand, app: <Home /> });
