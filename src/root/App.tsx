import { Box, type MantineColorsTuple, MantineProvider } from "@mantine/core";
import Fuse from "fuse.js";
import { Rocket } from "lucide-react";
import {
	useCallback,
	useEffect,
	useEffectEvent,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	APP_SWITCH_SHORTCUTS,
	APPS,
	type AppEntry,
	AppNav,
	CommandPalette,
	CommandPaletteButton,
	createAppTheme,
	HeaderAction,
	ROOT_THEME_KEY,
	SkipLink,
	useCommandPalette,
	usePinnedApps,
	useRecents,
	useShortcutsHelp,
	useThemeMode,
} from "../shared";
import { track } from "../shared/analytics";
import { ConsentBanner, useAnalyticsConsent } from "../shared/consent";
import { AppToolbar } from "./AppToolbar";
import { createCommands } from "./commands";
import { DashboardFooter } from "./DashboardFooter";
import { DashboardHero } from "./DashboardHero";
import { AppLists, SearchResults } from "./DashboardSections";
import { GithubIcon } from "./GithubIcon";
import { useDashboardShortcuts } from "./useDashboardShortcuts";

const brand: MantineColorsTuple = [
	"#e6f4ff",
	"#bae0ff",
	"#91caff",
	"#69b1ff",
	"#4096ff",
	"#1677ff",
	"#0958d9",
	"#003eb3",
	"#002c8c",
	"#001d66",
];

const appTheme = createAppTheme({
	accent: brand,
	accentName: "brand",
	primaryShade: 6,
	defaultRadius: 8,
});

const FUSE_OPTIONS: ConstructorParameters<typeof Fuse<AppEntry>>[1] = {
	keys: [
		{ name: "title", weight: 2 },
		{ name: "tag", weight: 1.4 },
		{ name: "category", weight: 1 },
		{ name: "description", weight: 1 },
	],
	threshold: 0.4,
	ignoreLocation: true,
};

const withinCategory = (
	byCategory: AppEntry[],
	results: AppEntry[],
): AppEntry[] => {
	const allowed = new Set(byCategory);
	return results.filter((app) => allowed.has(app));
};

export const App = () => {
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();
	const theme = useThemeMode(ROOT_THEME_KEY);
	const { recents, visit, clear: clearRecents } = useRecents();
	const { pinned, toggle: togglePin, isPinned } = usePinnedApps();

	const { granted: analyticsOn, decide: setAnalyticsConsent } =
		useAnalyticsConsent();
	const toggleAnalytics = useCallback(
		() => setAnalyticsConsent(!analyticsOn),
		[analyticsOn, setAnalyticsConsent],
	);
	const handleVisit = useCallback(
		(href: string) => {
			visit(href);
			track("app_open", { href });
		},
		[visit],
	);

	const recordAppVisit = useEffectEvent((href: string) => {
		if (APPS.some((app) => app.href === href)) handleVisit(href);
	});
	useEffect(() => {
		const onClick = (event: MouseEvent) => {
			if (
				event.defaultPrevented ||
				event.button !== 0 ||
				event.metaKey ||
				event.ctrlKey ||
				event.shiftKey ||
				event.altKey
			) {
				return;
			}
			const target = event.target;
			if (!(target instanceof Element)) return;
			const href = target.closest("a")?.getAttribute("href");
			if (href) recordAppVisit(href);
		};
		document.addEventListener("click", onClick);
		return () => document.removeEventListener("click", onClick);
	}, []);

	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<string>("All");
	const searchRef = useRef<HTMLInputElement>(null);

	const fuse = useMemo(() => new Fuse(APPS, FUSE_OPTIONS), []);

	const visitedAt = useMemo(
		() => new Map(recents.map((entry) => [entry.href, entry.at])),
		[recents],
	);

	const filtered = useMemo(() => {
		const byCategory =
			category === "All"
				? APPS
				: APPS.filter((app) => app.category === category);
		const trimmed = query.trim();
		if (!trimmed) return byCategory;
		return withinCategory(
			byCategory,
			fuse.search(trimmed).map((result) => result.item),
		);
	}, [category, fuse, query]);

	const isSearching = query.trim().length > 0 || category !== "All";
	const resetSearch = useCallback(() => {
		setQuery("");
		setCategory("All");
	}, []);
	const pinnedApps = useMemo(
		() => APPS.filter((app) => pinned.includes(app.href)),
		[pinned],
	);
	const recentApps = useMemo(
		() =>
			recents
				.map((entry) => APPS.find((app) => app.href === entry.href))
				.filter((app): app is AppEntry => Boolean(app)),
		[recents],
	);

	const openRandom = useCallback(() => {
		const app = APPS[Math.floor(Math.random() * APPS.length)];
		if (!app) return;
		handleVisit(app.href);
		window.location.href = app.href;
	}, [handleVisit]);

	const openApp = useCallback(
		(href: string) => {
			handleVisit(href);
			window.location.href = href;
		},
		[handleVisit],
	);

	const dialogsOpen = shortcuts.opened || palette.opened;
	useDashboardShortcuts({
		handleVisit,
		searchRef,
		theme,
		dialogsOpen,
		filtered,
		onOpen: openApp,
	});

	const commands = createCommands({
		searchRef,
		openRandom,
		theme,
		shortcuts,
		analyticsOn,
		toggleAnalytics,
		recents,
		clearRecents,
	});

	return (
		<MantineProvider
			theme={appTheme}
			forceColorScheme={theme.dark ? "dark" : "light"}
		>
			<Box
				style={{
					minHeight: "100dvh",
					display: "flex",
					flexDirection: "column",
					background: "var(--app-bg)",
				}}
			>
				<SkipLink />
				<AppNav
					hasCommandPalette
					icon={<Rocket size={18} />}
					title="chneau.github.io"
					subtitle="Personal hub and web apps"
					showBackHome={false}
					actions={
						<>
							<HeaderAction
								href="https://github.com/chneau"
								target="_blank"
								iconOnly
								label="GitHub profile"
								menuLabel="GitHub profile"
								icon={<GithubIcon size={18} />}
							/>
							<CommandPaletteButton onClick={palette.open} />
						</>
					}
					shortcuts={[]}
					globalShortcuts={[
						...APP_SWITCH_SHORTCUTS,
						{ keys: ["/"], description: "Focus the app search" },
						{ keys: ["Enter"], description: "Open the first search result" },
					]}
					theme={{ dark: theme.dark, onToggle: theme.toggle }}
				/>

				<Box component="main" id="main" tabIndex={-1} style={{ flex: 1 }}>
					<div className="app-page">
						<DashboardHero />

						<AppToolbar
							searchRef={searchRef}
							query={query}
							onQueryChange={setQuery}
							category={category}
							onCategoryChange={setCategory}
							filtered={filtered}
							onOpen={openApp}
							onRandom={openRandom}
						/>

						{isSearching ? (
							<SearchResults
								items={filtered}
								isPinned={isPinned}
								visitedAt={visitedAt}
								onTogglePin={togglePin}
								onReset={resetSearch}
							/>
						) : (
							<AppLists
								pinned={pinnedApps}
								recent={recentApps}
								isPinned={isPinned}
								visitedAt={visitedAt}
								onTogglePin={togglePin}
							/>
						)}
					</div>
				</Box>

				<DashboardFooter
					year={new Date().getFullYear()}
					analyticsOn={analyticsOn}
					onToggleAnalytics={toggleAnalytics}
				/>
			</Box>

			<ConsentBanner />

			<CommandPalette
				opened={palette.opened}
				onClose={palette.close}
				commands={commands}
			/>
		</MantineProvider>
	);
};
