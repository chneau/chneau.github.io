import type { MantineColorsTuple } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../../shared/tokens.css";
import "../../shared/base.css";
import { mountApp } from "../../shared/mountApp";
import { Home } from "./page";

/**
 * Night City yellow, for a game about a city that never sees the sun.
 *
 * The game's own palette is a hot yellow against near-black, so this ramp runs
 * from a washed-out cream through to a deep amber, which keeps a light scheme
 * legible rather than glaring. Index 5 is the dark-scheme shade, 6 the light one.
 */
const brand: MantineColorsTuple = [
	"#fff9e0",
	"#fdefb8",
	"#f8e071",
	"#f3d13a",
	"#efc612",
	"#e3ad00",
	"#c98f00",
	"#a97000",
	"#885300",
	"#6b3d00",
];

mountApp({ analyticsId: "cyberpunk-2077-save-editor", brand, app: <Home /> });
