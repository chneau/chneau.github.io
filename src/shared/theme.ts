import {
	createTheme,
	type MantineColorsTuple,
	type MantineThemeOverride,
} from "@mantine/core";

const FONT_SANS =
	'"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';

const FONT_DISPLAY =
	'"Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';

const FONT_MONO =
	'"Cascadia Code", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const neutral: MantineColorsTuple = [
	"#f3f3f4",
	"#e4e4e7",
	"#a9a9b1",
	"#78787f",
	"#3f3f46",
	"#2b2b30",
	"#232327",
	"#1b1b1f",
	"#151518",
	"#0e0e11",
];

const sharedShadows = {
	xs: "0 1px 2px rgba(14, 10, 12, 0.35)",
	sm: "0 4px 12px -2px rgba(14, 10, 12, 0.45)",
	md: "0 12px 28px -8px rgba(14, 10, 12, 0.55)",
	lg: "0 24px 48px -16px rgba(14, 10, 12, 0.6)",
	xl: "0 40px 72px -24px rgba(14, 10, 12, 0.68)",
};

const sharedComponents: MantineThemeOverride["components"] = {
	Badge: {
		defaultProps: { radius: "sm" },
		styles: {
			label: {
				textTransform: "none",
				letterSpacing: "0.01em",
				fontWeight: 600,
			},
		},
	},
	Button: {
		defaultProps: { radius: "md" },
		styles: { root: { letterSpacing: "0.01em" } },
	},
	Card: { defaultProps: { radius: "md" } },
	Paper: { defaultProps: { radius: "md" } },
	Modal: { defaultProps: { centered: true, radius: "md" } },
	Drawer: { defaultProps: { radius: "md" } },
	NavLink: { defaultProps: { radius: "sm" } },
	Alert: { defaultProps: { radius: "md" } },
	Tooltip: { defaultProps: { withArrow: true } },
};

type AppThemeOptions = {
	accent: MantineColorsTuple;
	accentName?: string;
	primaryShade?: MantineThemeOverride["primaryShade"];
	defaultRadius?: MantineThemeOverride["defaultRadius"];
	colors?: Record<string, MantineColorsTuple>;
	components?: MantineThemeOverride["components"];
	headings?: MantineThemeOverride["headings"];
	fontFamily?: string;
	fontFamilyMonospace?: string;
	overrides?: MantineThemeOverride;
};

export const createAppTheme = ({
	accent,
	accentName = "accent",
	primaryShade = { light: 6, dark: 5 },
	defaultRadius = "md",
	colors,
	components,
	headings,
	fontFamily = FONT_SANS,
	fontFamilyMonospace = FONT_MONO,
	overrides,
}: AppThemeOptions) =>
	createTheme({
		primaryColor: accentName,
		primaryShade,
		colors: { [accentName]: accent, dark: neutral, ...colors },
		defaultRadius,
		fontFamily,
		fontFamilyMonospace,
		headings: { fontFamily: FONT_DISPLAY, fontWeight: "600", ...headings },
		shadows: sharedShadows,
		fontSmoothing: true,
		autoContrast: true,
		luminanceThreshold: 0.179,
		components: { ...sharedComponents, ...components },
		...overrides,
	});
