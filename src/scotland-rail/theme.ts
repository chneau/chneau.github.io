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
	accentSoft: "var(--rail-accent-soft)",
	accentBorder: "var(--rail-accent-border)",
	danger: "var(--rail-danger)",
} as const;

export const categoryColors = {
	Express: "#5aa9c9",
	Highland: "#83ac63",
	Commuter: "#c9a04e",
	CrossBorder: "#c2686f",
	Sleeper: "#8090bf",
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
