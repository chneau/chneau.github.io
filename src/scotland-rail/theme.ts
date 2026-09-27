import { createTheme, type MantineColorsTuple } from "@mantine/core";

/**
 * One palette for the whole replay. The cool cyan is the single accent; every
 * other surface is a neutral blue-zinc so the moving trains and the track are
 * the only things competing for attention. Saturation is deliberately held
 * below 80% and the purple/magenta AI palette is avoided entirely.
 */
export const palette = {
	bg: "#0a141b",
	bgDeep: "#060d12",
	surface: "rgba(10, 20, 27, 0.9)",
	surfaceSolid: "#0e1c26",
	border: "rgba(206, 222, 230, 0.16)",
	borderStrong: "rgba(206, 222, 230, 0.28)",
	text: "#eef3f5",
	textMuted: "#93a6b0",
	textFaint: "#6f838e",
	accent: "#5aa9c9",
	accentSoft: "rgba(90, 169, 201, 0.16)",
	accentBorder: "rgba(90, 169, 201, 0.5)",
	danger: "#c2686f",
} as const;

/**
 * Category hues, spaced around the wheel but desaturated so they read as
 * data, not as neon. `Express` inherits the single accent.
 */
export const categoryColors = {
	Express: palette.accent,
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

export const railTheme = createTheme({
	primaryColor: "accent",
	primaryShade: { light: 5, dark: 4 },
	colors: { accent },
	defaultRadius: "md",
	fontFamily:
		'"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif',
	fontFamilyMonospace:
		'"Cascadia Code", "JetBrains Mono", ui-monospace, monospace',
	headings: { fontWeight: "600" },
});
