import {
	Box,
	Button,
	CloseButton,
	type MantineColorsTuple,
	MantineProvider,
	Text,
	TextInput,
	Title,
} from "@mantine/core";
import Fuse from "fuse.js";
import {
	Clock,
	Command,
	Keyboard,
	Moon,
	Rocket,
	Search,
	Shield,
	Shuffle,
	Sun,
	X,
} from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	APP_CATEGORIES,
	APP_SWITCH_SHORTCUTS,
	APPS,
	AppCard,
	type AppEntry,
	AppHeader,
	AppSwitcher,
	Brand,
	CommandPalette,
	CommandPaletteButton,
	createAppTheme,
	EmptyState,
	Footer,
	getAnalyticsConsent,
	HeaderAction,
	type Command as PaletteCommand,
	ROOT_THEME_KEY,
	SchemeToggle,
	ShortcutsHelp,
	ShortcutsHelpButton,
	SkipLink,
	Stat,
	StatusDot,
	setAnalyticsConsent,
	track,
	useCommandPalette,
	usePinnedApps,
	useRecents,
	useShortcutsHelp,
	useThemeMode,
} from "../shared";

declare const BUILD_DATE: string;

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

/** GitHub mark, inlined so we don't depend on an icon package. */
const GithubIcon = ({ size = 18 }: { size?: number }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 16 16"
		fill="currentColor"
		aria-hidden="true"
		focusable="false"
	>
		<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
	</svg>
);

const GREETINGS = ["Good morning", "Good afternoon", "Good evening"] as const;

const greetingFor = (date: Date) => {
	const hour = date.getHours();
	if (hour < 12) return GREETINGS[0];
	if (hour < 18) return GREETINGS[1];
	return GREETINGS[2];
};

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

export const App = () => {
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();
	const theme = useThemeMode(ROOT_THEME_KEY);
	const { recents, visit, clear: clearRecents } = useRecents();
	const { pinned, toggle: togglePin, isPinned } = usePinnedApps();

	const [analyticsOn, setAnalyticsOn] = useState(
		() => getAnalyticsConsent() !== "denied",
	);
	const toggleAnalytics = () => {
		const next = !analyticsOn;
		setAnalyticsConsent(next);
		setAnalyticsOn(next);
	};
	const handleVisit = useCallback(
		(href: string) => {
			visit(href);
			track("app_open", { href });
		},
		[visit],
	);

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
		return trimmed
			? fuse
					.search(trimmed)
					.map((result) => result.item)
					.filter((app) => byCategory.includes(app))
			: byCategory;
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

	const openRandom = () => {
		const app = APPS[Math.floor(Math.random() * APPS.length)];
		if (!app) return;
		handleVisit(app.href);
		window.location.href = app.href;
	};

	// Global shortcuts: digits launch apps, T toggles theme, / focuses search.
	const themeRef = useRef(theme);
	themeRef.current = theme;
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey || event.repeat)
				return;
			const target = event.target;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				(target instanceof HTMLElement && target.isContentEditable)
			) {
				return;
			}
			if (event.key === "/") {
				event.preventDefault();
				searchRef.current?.focus();
				return;
			}
			const targetApp = APPS.find((app) => app.hotkey === event.key);
			if (targetApp) {
				handleVisit(targetApp.href);
				window.location.href = targetApp.href;
			} else if (event.key.toLowerCase() === "t") {
				themeRef.current.toggle();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [handleVisit]);

	/** Arrow-key roving focus across the visible card grid. */
	const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		const keys = [
			"ArrowRight",
			"ArrowLeft",
			"ArrowDown",
			"ArrowUp",
			"Home",
			"End",
		];
		if (!keys.includes(event.key)) return;
		const links = Array.from(
			event.currentTarget.querySelectorAll<HTMLAnchorElement>(
				".app-card__link",
			),
		);
		const index = links.indexOf(document.activeElement as HTMLAnchorElement);
		if (index === -1) return;
		event.preventDefault();
		const last = links.length - 1;
		let next = index;
		if (event.key === "ArrowRight" || event.key === "ArrowDown") {
			next = index === last ? 0 : index + 1;
		} else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
			next = index === 0 ? last : index - 1;
		} else if (event.key === "Home") {
			next = 0;
		} else if (event.key === "End") {
			next = last;
		}
		links[next]?.focus();
	};

	const commands: PaletteCommand[] = [
		{
			id: "focus-search",
			label: "Search apps",
			hint: "/",
			keywords: "find filter jump",
			icon: <Search size={16} />,
			run: () => searchRef.current?.focus(),
		},
		{
			id: "surprise",
			label: "Surprise me — open a random app",
			keywords: "random shuffle discover",
			icon: <Shuffle size={16} />,
			run: openRandom,
		},
		{
			id: "toggle-theme",
			label: theme.dark ? "Switch to light theme" : "Switch to dark theme",
			hint: "T",
			keywords: "theme dark light mode appearance",
			icon: theme.dark ? <Sun size={16} /> : <Moon size={16} />,
			run: () => theme.toggle(),
		},
		{
			id: "keyboard-shortcuts",
			label: "Keyboard shortcuts",
			hint: "?",
			keywords: "shortcuts keyboard keys help",
			icon: <Keyboard size={16} />,
			run: () => shortcuts.open(),
		},
		{
			id: "github",
			label: "Open GitHub profile",
			keywords: "source code repository",
			icon: <GithubIcon size={16} />,
			run: () =>
				window.open("https://github.com/chneau", "_blank", "noreferrer"),
		},
		{
			id: "analytics",
			label: analyticsOn ? "Turn analytics off" : "Turn analytics on",
			keywords: "privacy consent tracking telemetry cookies",
			icon: <Shield size={16} />,
			run: toggleAnalytics,
		},
	];
	if (recents.length > 0) {
		commands.push({
			id: "clear-recents",
			label: "Clear recently opened",
			keywords: "history reset recents",
			icon: <X size={16} />,
			run: clearRecents,
		});
	}

	const renderGrid = (items: AppEntry[]) => (
		// biome-ignore lint/a11y/noStaticElementInteractions: keyboard roving focus over the card links (links stay focusable; this only adds arrow-key movement)
		<div className="app-grid" onKeyDown={onGridKeyDown}>
			{items.map((item, index) => (
				<AppCard
					key={item.href}
					item={item}
					index={index}
					pinned={isPinned(item.href)}
					lastVisitedAt={visitedAt.get(item.href)}
					onTogglePin={togglePin}
					onVisit={handleVisit}
				/>
			))}
		</div>
	);

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
				<AppHeader
					brand={
						<Brand
							href="/"
							icon={<Rocket size={18} />}
							title="chneau.github.io"
							subtitle="Personal hub and web apps"
						/>
					}
					actions={
						<>
							<AppSwitcher />
							<HeaderAction
								href="https://github.com/chneau"
								target="_blank"
								iconOnly
								label="GitHub profile"
								icon={<GithubIcon size={18} />}
							/>
							<ShortcutsHelpButton
								onClick={shortcuts.open}
								expanded={shortcuts.opened}
							/>
							<CommandPaletteButton onClick={palette.open} />
							<SchemeToggle dark={theme.dark} onToggle={theme.toggle} />
						</>
					}
				/>

				<Box component="main" id="main" tabIndex={-1} style={{ flex: 1 }}>
					<div className="app-page">
						<section className="app-hero">
							<span className="app-hero__eyebrow">
								<StatusDot label="All systems client-side" />
								{greetingFor(now)} ·{" "}
								{now.toLocaleDateString(undefined, {
									weekday: "long",
									day: "numeric",
									month: "long",
								})}
							</span>
							<Title order={1}>Small tools, thoughtfully built.</Title>
							<Text className="app-hero__lede">
								A collection of interactive web apps, data visualisations and
								client-side tools. Everything runs in your browser — nothing is
								uploaded.
							</Text>
							<div className="app-hero__stats">
								<Stat label="Apps" value={APPS.length} hint="and counting" />
								<Stat
									label="Privacy"
									value="100% client-side"
									icon={<Command size={13} />}
								/>
								<Stat
									label="Last build"
									value={BUILD_DATE}
									icon={<Clock size={13} />}
								/>
							</div>
						</section>

						<div className="app-toolbar">
							<TextInput
								ref={searchRef}
								className="app-toolbar__search"
								value={query}
								onChange={(event) => setQuery(event.currentTarget.value)}
								onKeyDown={(event) => {
									if (event.key === "Escape") {
										event.preventDefault();
										setQuery("");
										event.currentTarget.blur();
									} else if (event.key === "Enter" && filtered[0]) {
										event.preventDefault();
										handleVisit(filtered[0].href);
										window.location.href = filtered[0].href;
									}
								}}
								placeholder="Search apps, tags and categories…"
								aria-label="Search apps"
								leftSection={<Search size={16} />}
								rightSection={
									query ? (
										<CloseButton
											size="sm"
											aria-label="Clear search"
											onClick={() => setQuery("")}
										/>
									) : (
										<kbd className="app-kbd">/</kbd>
									)
								}
								rightSectionPointerEvents={query ? "auto" : "none"}
								size="md"
							/>
							{/* biome-ignore lint/a11y/useSemanticElements: a labelled group of toggle buttons is a valid role="group" composition */}
							<div
								className="app-chips"
								role="group"
								aria-label="Filter by category"
							>
								<button
									type="button"
									className={`app-chip${category === "All" ? " app-chip--on" : ""}`}
									aria-pressed={category === "All"}
									onClick={() => setCategory("All")}
								>
									All
								</button>
								{APP_CATEGORIES.map((name) => (
									<button
										key={name}
										type="button"
										className={`app-chip${category === name ? " app-chip--on" : ""}`}
										aria-pressed={category === name}
										onClick={() => setCategory(name)}
									>
										{name}
									</button>
								))}
							</div>
							<Button
								variant="light"
								leftSection={<Shuffle size={15} />}
								onClick={openRandom}
								visibleFrom="sm"
							>
								Surprise me
							</Button>
						</div>

						{isSearching ? (
							<>
								<h2 className="app-section-title">
									Results
									<span className="app-section-title__count">
										{filtered.length}
									</span>
								</h2>
								{filtered.length > 0 ? (
									renderGrid(filtered)
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
										{renderGrid(pinnedApps)}
									</>
								) : null}

								{recentApps.length > 0 ? (
									<>
										<h2 className="app-section-title">Recently opened</h2>
										<div className="app-recents">
											{recentApps.map((app) => {
												const Icon = app.icon;
												return (
													<a
														key={app.href}
														className="app-recent-chip"
														href={app.href}
														onClick={() => handleVisit(app.href)}
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
								{renderGrid(APPS)}
							</>
						)}
					</div>
				</Box>

				<Footer
					left={`chneau © ${now.getFullYear()}`}
					right={
						<>
							<button
								type="button"
								className="app-footer__consent"
								aria-pressed={analyticsOn}
								onClick={toggleAnalytics}
							>
								Analytics {analyticsOn ? "on" : "off"}
							</button>
							<span>Built {BUILD_DATE}</span>
						</>
					}
				/>
			</Box>

			<ShortcutsHelp
				opened={shortcuts.opened}
				onClose={shortcuts.close}
				groups={[]}
				globalShortcuts={[
					...APP_SWITCH_SHORTCUTS,
					{ keys: ["/"], description: "Focus the app search" },
					{ keys: ["Enter"], description: "Open the first search result" },
				]}
			/>

			<CommandPalette
				opened={palette.opened}
				onClose={palette.close}
				commands={commands}
			/>
		</MantineProvider>
	);
};
