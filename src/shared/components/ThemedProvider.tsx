import { MantineProvider, type MantineThemeOverride } from "@mantine/core";
import type { ReactNode } from "react";
import { useThemeMode } from "../hooks/useThemeMode";

type ThemedProviderProps = {
	/** The app's theme, from `createAppTheme`. */
	theme: MantineThemeOverride;
	children: ReactNode;
};

/**
 * The one place a `MantineProvider` gets its colour scheme.
 *
 * Every app on the site renders a Mantine provider, and there are two halves to a
 * scheme here that have to agree: the token layer, which keys off the `data-theme`
 * and `data-mantine-color-scheme` attributes on `<html>`, and Mantine itself, which
 * reads its own. `applyColorMode` writes both attributes; `forceColorScheme` tells
 * Mantine which value it is looking at. Passing the same `useThemeMode` value to
 * both is what keeps them from disagreeing.
 *
 * This existed as `defaultColorScheme="dark"` in four apps, which is the opposite
 * arrangement: Mantine picked its own scheme, wrote `data-mantine-color-scheme`,
 * and nothing wrote `data-theme`. Those apps therefore ignored the site-wide theme
 * choice entirely — a visitor who picked dark on the dashboard still got the
 * default in them — and they defaulted to dark regardless of their OS. Both CSS
 * layers accept either attribute, which is exactly why the split stayed invisible.
 *
 * `forceColorScheme` rather than `defaultColorScheme` because the scheme is now
 * derived from a value the visitor controls, not a default to fall back to.
 */
export const ThemedProvider = ({ theme, children }: ThemedProviderProps) => {
	const { dark } = useThemeMode();

	return (
		<MantineProvider theme={theme} forceColorScheme={dark ? "dark" : "light"}>
			{children}
		</MantineProvider>
	);
};
