import {
	createTheme,
	type MantineColorsTuple,
	type MantineThemeOverride,
} from "@mantine/core";

/**
 * The common design foundation every site is built on. Sites keep their own
 * accent colour and layout, but draw neutrals, typography, radii, shadows,
 * motion and default component props from here so the whole site feels like
 * one product.
 */

/** System UI stack, used everywhere so no web fonts need to be downloaded. */
const FONT_SANS =
	'"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';

const FONT_DISPLAY =
	'"Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';

const FONT_MONO =
	'"Cascadia Code", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Shared zinc-leaning neutral ramp, deliberately without pure black at the
 * bottom. Mantine uses it for the `dark` colour scheme and the shared CSS
 * tokens mirror the same values.
 */
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

/** Diffusion shadows tinted toward the background, never a flat black drop. */
const sharedShadows = {
	xs: "0 1px 2px rgba(14, 10, 12, 0.35)",
	sm: "0 4px 12px -2px rgba(14, 10, 12, 0.45)",
	md: "0 12px 28px -8px rgba(14, 10, 12, 0.55)",
	lg: "0 24px 48px -16px rgba(14, 10, 12, 0.6)",
	xl: "0 40px 72px -24px rgba(14, 10, 12, 0.68)",
};

/** Default look for the components every site shares. */
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
	/** The site's signature accent, as a ten-shade Mantine ramp. */
	accent: MantineColorsTuple;
	/** Key the accent is registered under (defaults to `accent`). */
	accentName?: string;
	/** Which shade is used as the filled colour in each scheme. */
	primaryShade?: MantineThemeOverride["primaryShade"];
	/** Base corner radius for components. */
	defaultRadius?: MantineThemeOverride["defaultRadius"];
	/** Extra colour ramps to register (e.g. a bespoke `dark` scale). */
	colors?: Record<string, MantineColorsTuple>;
	/** Per-site component overrides, merged over the shared defaults. */
	components?: MantineThemeOverride["components"];
	/** Per-site heading overrides. */
	headings?: MantineThemeOverride["headings"];
	fontFamily?: string;
	fontFamilyMonospace?: string;
	/** Any remaining Mantine theme options, spread last. */
	overrides?: MantineThemeOverride;
};

/**
 * Build a site's Mantine theme on top of the shared foundation. Only the
 * accent and a handful of options differ between sites.
 */
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
		luminanceThreshold: 0.35,
		components: { ...sharedComponents, ...components },
		...overrides,
	});
