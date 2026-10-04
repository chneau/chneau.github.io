import { type MantineColorsTuple, MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
// By path, not via the barrel: analytics is a side-effectful module and must
// not be dragged onto every app that imports a single shared component.
import { initAnalytics } from "./analytics";
import { registerServiceWorker } from "./service-worker";
import { createAppTheme } from "./theme";

/**
 * The app id {@link initAnalytics} accepts, derived from its own parameter so a
 * new save editor cannot pass an id the analytics module has not been taught.
 */
type AnalyticsApp = NonNullable<Parameters<typeof initAnalytics>[0]>;

/**
 * The runtime bootstrap every save editor shares: build the themed tree from
 * the app's brand ramp, mount it into `#root`, and register analytics and the
 * service worker.
 *
 * The tree is deliberately not wrapped in StrictMode: it double-invokes every
 * render in development, and each save editor keeps all of its state in one
 * component, so that doubles the cost of every interaction while developing.
 *
 * Only the analytics id, the brand ramp and the app element differ between
 * editors; the CSS side-effect imports stay in each `app/main.tsx` because they
 * are per-editor and must run before the first paint.
 */
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

	// Site-wide analytics and offline support. Neither touches save data.
	initAnalytics(analyticsId);
	registerServiceWorker();

	const tree = (
		<MantineProvider theme={theme} defaultColorScheme="dark">
			<Notifications />
			{app}
		</MantineProvider>
	);

	if (import.meta.hot) {
		// Reuse the root across hot updates so React state survives HMR.
		import.meta.hot.data.root ??= createRoot(container);
		import.meta.hot.data.root.render(tree);
	} else {
		createRoot(container).render(tree);
	}
};
