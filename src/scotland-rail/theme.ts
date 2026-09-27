import type { MantineColorsTuple } from "@mantine/core";
import { createAppTheme } from "../shared";

/**
 * The map canvas is always dark — it is a night-appropriate rail map — so its
 * notional background stays a fixed literal. The floating chrome around it
 * uses CSS variables and follows the active colour scheme.
 */
export const mapColors = {
	bg: "#0a141b",
	bgDeep: "#060d12",
} as const;

/**
 * UI palette. Values are CSS variable references defined in
 * `scotland-rail.css`, so the panels, drawers and modals switch between light
 * and dark with the rest of the site. The cool cyan remains the single accent.
 */
export const palette = {
	bg: "var(--rail-bg)",
	bgDeep: "var(--rail-bg-deep)",
	surface: "var(--rail-surface)",
	surfaceSolid: "var(--rail-surface-solid)",
	border: "var(--rail-border)",
	borderStrong: "var(--rail-border-strong)",
	text: "var(--rail-text)",
	textMuted: "var(--rail-text-muted)",
	textFaint: "var(--rail-text-faint)",
	accent: "var(--rail-accent)",
	accentSoft: "var(--rail-accent-soft)",
	accentBorder: "var(--rail-accent-border)",
	danger: "var(--rail-danger)",
} as const;

/**
 * Category hues, spaced around the wheel but desaturated so they read as
 * data, not as neon. Kept literal because canvas drawing (and alpha suffixes)
 * need real colour values, not CSS variables.
 */
export const categoryColors = {
	Express: "#5aa9c9",
	Highland: "#83ac63",
	Commuter: "#c9a04e",
	CrossBorder: "#c2686f",
	Sleeper: "#8090bf",
} as const;

/**
 * A ten-shade ramp around the single cyan accent (#5aa9c9 sits at index 4),
 * giving Mantine's filled and light variants a coherent family to draw from.
 */
const accent: MantineColorsTuple = [
	"#ecf6fa",
	"#d5ebf3",
	"#a9d5e6",
	"#7dbfd8",
	"#5aa9c9",
	"#4693b3",
	"#357a97",
	"#29617a",
	"#1f4a5d",
	"#14323e",
];

export const railTheme = createAppTheme({
	accent,
	accentName: "accent",
	primaryShade: { light: 5, dark: 4 },
});
