import type { MantineColorsTuple } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { initAnalytics } from "./analytics";
import { ThemedProvider } from "./components/ThemedProvider";
import { initTheme } from "./hooks/useThemeMode";
import { registerServiceWorker } from "./service-worker";
import { createAppTheme } from "./theme";

type AnalyticsApp = NonNullable<Parameters<typeof initAnalytics>[0]>;

export const mountApp = ({
	analyticsId,
	brand,
	app,
}: {
	analyticsId: AnalyticsApp;
	brand: MantineColorsTuple;
	app: ReactNode;
}) => {
	const theme = createAppTheme({
		accent: brand,
		accentName: "brand",
		primaryShade: { light: 6, dark: 5 },
		defaultRadius: "sm",
		overrides: {
			defaultGradient: { from: "brand.6", to: "brand.4", deg: 135 },
		},
	});

	const container = document.getElementById("root");

	if (!container) {
		throw new Error("Root container #root was not found in index.html.");
	}

	initAnalytics(analyticsId);
	registerServiceWorker();
	initTheme();

	const tree = (
		<ThemedProvider theme={theme}>
			<Notifications />
			{app}
		</ThemedProvider>
	);

	if (import.meta.hot) {
		import.meta.hot.data.root ??= createRoot(container);
		import.meta.hot.data.root.render(tree);
	} else {
		createRoot(container).render(tree);
	}
};
