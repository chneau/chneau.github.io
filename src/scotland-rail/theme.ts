import type { MantineColorsTuple } from "@mantine/core";
import { createAppTheme } from "../shared";

export const mapColors = {
	bg: "#0a141b",
	bgDeep: "#060d12",
} as const;

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
	accentInk: "var(--rail-accent-ink)",
	accentSoft: "var(--rail-accent-soft)",
	accentBorder: "var(--rail-accent-border)",
	onCategory: "var(--rail-on-category)",
	inkOnMap: "var(--rail-ink-on-map)",
	danger: "var(--rail-danger)",
	dangerInk: "var(--rail-danger-ink)",
} as const;

export const categoryColors = {
	Express: "#5aa9c9",
	Highland: "#83ac63",
	Commuter: "#c9a04e",
	CrossBorder: "#c2686f",
	Sleeper: "#8090bf",
} as const;

export const categoryInkColors = {
	Express: "var(--rail-cat-express-ink)",
	Highland: "var(--rail-cat-highland-ink)",
	Commuter: "var(--rail-cat-commuter-ink)",
	CrossBorder: "var(--rail-cat-crossborder-ink)",
	Sleeper: "var(--rail-cat-sleeper-ink)",
} as const;

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
