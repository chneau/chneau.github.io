import type { MantineColorsTuple } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../../shared/tokens.css";
import "../../shared/base.css";
import { mountApp } from "../../shared/mountApp";
import { Home } from "./page";

/**
 * Tarnished silver over cold steel — a low-saturation verdigris, the colour a
 * piece of Witcher steel takes on after a winter on a Nilfgaardian road.
 *
 * The saturation is the whole argument. Six of the other editors on this site
 * claim a hue outright: crimson-desert and power-fantasy sit at 346–349°,
 * no-rest-for-the-wicked at 13°, cyberpunk at 49° and dysmantle at 58°, and
 * tails-of-iron-2 holds the blue at 208°. Witcher 3 is the northern, grey end
 * of the shelf, so this takes the 172° verdigris band at about 11% saturation:
 * far enough round the wheel from every saturated neighbour to read as a
 * different game at a glance, and desaturated enough that the nearest of them —
 * tails-of-iron's blue, 36° away — cannot be confused with it.
 *
 * Measured rather than eyeballed, because a brand ramp is used as an accent and
 * as a filled background in the same page. Index 5 is the dark-scheme shade and
 * index 6 the light-scheme one, per `mountApp`'s `primaryShade`, so:
 *
 *  - `#647875` (5) reads 4.68:1 under white text, which is what a filled button
 *    draws, and 4.25:1 on the dark background — both over AA's 4.5 for the
 *    first and over 4.0 for the second.
 *  - `#51615f` (6) reads 6.51:1 under white and 5.37:1 on `--app-surface-3`,
 *    the harsher of the two light surfaces.
 *
 * The rest of the ramp runs monotonically darker so Mantine's own shade picking
 * and its `brand.6 → brand.4` gradient both have somewhere to go.
 */
const brand: MantineColorsTuple = [
	"#f1f4f3",
	"#e0e6e5",
	"#c4cfcd",
	"#9dafac",
	"#79908d",
	"#647875",
	"#51615f",
	"#414e4c",
	"#2f3736",
	"#1f2423",
];

mountApp({ analyticsId: "witcher-3-save-editor", brand, app: <Home /> });
