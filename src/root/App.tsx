import {
	Box,
	Button,
	type MantineColorsTuple,
	MantineProvider,
} from "@mantine/core";
import Fuse from "fuse.js";
import { Rocket, Search } from "lucide-react";
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
	EmptyState,
	HeaderAction,
	ROOT_THEME_KEY,
	SkipLink,
	useCommandPalette,
	usePinnedApps,
	useRecents,
	useShortcutsHelp,
	useThemeMode,
} from "../shared";
// By path, not via the barrel: analytics is a side-effectful module and must
// not be dragged onto every app that imports a single shared component.
import { track } from "../shared/analytics";
import { ConsentBanner, useAnalyticsConsent } from "../shared/consent";
import { AppGrid } from "./AppGrid";
import { AppToolbar } from "./AppToolbar";
import { createCommands } from "./commands";
import { DashboardFooter } from "./DashboardFooter";
import { DashboardHero } from "./DashboardHero";
import { GithubIcon } from "./GithubIcon";
import { useDashboardShortcuts } from "./useDashboardShortcuts";

/** A blue accent (#1677ff), expanded to Mantine's 10-shade tuple (shade 6). */
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

/**
 * The subset of `results` that is in `byCategory`. Fuse returns every fuzzy
 * match for the query, so this runs over its whole result set: membership is a
 * lookup against the category's apps, not a scan of them per result.
 */
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

	// Analytics is strictly opt-in: `granted` is false until the visitor
	// accepts the banner, and stays false when Do Not Track / Global Privacy
	// Control is set.
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

	// The shared `AppSwitcher` and the palette's built-in navigation commands
	// set `location.href` themselves, so they never reach `handleVisit`. Watch
	// the document for any in-app link so every route into an app is recorded
	// once, whichever control the visitor used.
	//
	// `useEffectEvent` rather than a dependency array: a `visit` that changes
	// identity (it closes over the recents list, which grows as apps are opened)
	// would otherwise take the document listener down and put it back on every
	// open, dropping any click that landed in between.
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
	const [now, setNow] = useState(() => new Date());
	const searchRef = useRef<HTMLInputElement>(null);

	// Keep the greeting and clock current without re-rendering every second.
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 30_000);
		return () => clearInterval(timer);
	}, []);

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

	const dialogsOpen = shortcuts.opened || palette.opened;
	useDashboardShortcuts({ handleVisit, searchRef, theme, dialogsOpen });

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
					// This app binds the command palette, so the shared help dialog
					// may advertise it.
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
						<DashboardHero now={now} />

						<AppToolbar
							searchRef={searchRef}
							query={query}
							onQueryChange={setQuery}
							category={category}
							onCategoryChange={setCategory}
							filtered={filtered}
							onOpen={handleVisit}
							onRandom={openRandom}
						/>

						{isSearching ? (
							<>
								<h2 className="app-section-title">
									Results
									{/* The count is the only feedback a screen-reader user
										    gets while typing, so announce it politely. */}
									<span
										className="app-section-title__count"
										role="status"
										aria-live="polite"
									>
										{filtered.length}
									</span>
								</h2>
								{filtered.length > 0 ? (
									<AppGrid
										items={filtered}
										isPinned={isPinned}
										visitedAt={visitedAt}
										onTogglePin={togglePin}
									/>
								) : (
									<EmptyState
										icon={<Search size={22} />}
										title="No apps match that"
										body="Try a shorter query, or clear the filters to see everything."
										action={
											<Button
												variant="light"
												onClick={() => {
													setQuery("");
													setCategory("All");
												}}
											>
												Reset filters
											</Button>
										}
									/>
								)}
							</>
						) : (
							<>
								{pinnedApps.length > 0 ? (
									<>
										<h2 className="app-section-title">
											Pinned
											<span className="app-section-title__count">
												{pinnedApps.length}
											</span>
										</h2>
										<AppGrid
											items={pinnedApps}
											isPinned={isPinned}
											visitedAt={visitedAt}
											onTogglePin={togglePin}
										/>
									</>
								) : null}

								{recentApps.length > 0 ? (
									<>
										<h2 className="app-section-title">
											Recently opened
											<span className="app-section-title__count">
												{recentApps.length}
											</span>
										</h2>
										<div className="app-recents">
											{recentApps.map((app) => {
												const Icon = app.icon;
												return (
													<a
														key={app.href}
														className="app-recent-chip"
														href={app.href}
													>
														<Icon size={14} />
														{app.title}
													</a>
												);
											})}
										</div>
									</>
								) : null}

								<h2 className="app-section-title">
									All apps
									<span className="app-section-title__count">
										{APPS.length}
									</span>
								</h2>
								<AppGrid
									items={APPS}
									isPinned={isPinned}
									visitedAt={visitedAt}
									onTogglePin={togglePin}
								/>
							</>
						)}
					</div>
				</Box>

				<DashboardFooter
					year={now.getFullYear()}
					analyticsOn={analyticsOn}
					onToggleAnalytics={toggleAnalytics}
				/>
			</Box>

			{/* Renders only until the visitor answers, and never when the
			    browser exports Do Not Track or Global Privacy Control. */}
			<ConsentBanner />

			<CommandPalette
				opened={palette.opened}
				onClose={palette.close}
				commands={commands}
			/>
		</MantineProvider>
	);
};
