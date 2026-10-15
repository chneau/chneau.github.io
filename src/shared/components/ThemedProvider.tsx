import { MantineProvider, type MantineThemeOverride } from "@mantine/core";
import type { ReactNode } from "react";
import { useThemeMode } from "../hooks/useThemeMode";

type ThemedProviderProps = {
	theme: MantineThemeOverride;
	children: ReactNode;
};

export const ThemedProvider = ({ theme, children }: ThemedProviderProps) => {
	const { dark } = useThemeMode();

	return (
		<MantineProvider theme={theme} forceColorScheme={dark ? "dark" : "light"}>
			{children}
		</MantineProvider>
	);
};
