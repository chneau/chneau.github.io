import { Box, Button, Skeleton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	ErrorState,
	LoadingState,
	type ShortcutGroup,
	SkipLink,
	useCommandPalette,
	useShortcutsHelp,
	useThemeMode,
} from "../shared";
import {
	fallbackRound,
	linkedVenue,
	roundFromUrl,
	useAreaSelection,
	useFilters,
	useLinkedSelections,
	useMapViewport,
	useRound,
	useRoundActions,
	useUrlSync,
	useUserLocation,
} from "./appState";
import { serializeBasket } from "./basket";
import { createSpoonerCommands } from "./commands";
import { AppHeader } from "./components/AppHeader";
import { ResultsSidebar } from "./components/ResultsSidebar";
import { SpoonerDialogs } from "./components/SpoonerDialogs";
import { currencyChoices, useRates } from "./rates";
import { useSettings } from "./settings";
import type { MapPoint } from "./types";
import { readUrl } from "./url";
import { useDataset } from "./useDataset";
import { useSpoonersView } from "./useSpoonersView";

const RATE_SOURCE = "European Central Bank, via frankfurter.dev";

/**
 * The map, and Leaflet with it, in its own chunk.
 *
 * `MapPane` imports `react-leaflet`, so a static import put Leaflet's 144 kB of
 * JavaScript in the entry chunk — downloaded, parsed and executed before the
 * first paint — for a map that cannot render anything until the 23 MB cache has
 * arrived and been parsed. Every visitor paid for it in the loading state, and
 * the retry screen paid for it without ever showing a map.
 *
 * `warmMap` is the other half, and the reason this is not simply a lazy import:
 * the chunk is fetched *while* the cache is still arriving, so splitting it
 * does not move the map's own download behind a 23 MB parse. `Suspense` then
 * finds it cached and renders on the frame the data lands.
 */
const MapPane = lazy(() =>
	import("./components/MapPane").then((module) => ({
		default: module.MapPane,
	})),
);

const warmMap = () => import("./components/MapPane");

/** Holds the map's box while its chunk is in flight, so the page does not shift. */
const MapFallback = ({ compact }: { compact: boolean }) => (
	<Box
		style={{
			flex: compact ? undefined : 1,
			flexShrink: 0,
			minWidth: 0,
			height: compact ? "45vh" : "auto",
			borderRadius: "var(--app-radius-md)",
			border: "1px solid var(--app-border)",
			background: "var(--app-surface-2)",
		}}
	/>
);

// Only keys implemented in this app — see `components/PubSearch.tsx`.
const SHORTCUT_GROUPS: ShortcutGroup[] = [
	{
		title: "Search",
		shortcuts: [
			{ keys: ["↑", "↓"], description: "Move through the pub results" },
			{ keys: ["Enter"], description: "Open the highlighted pub" },
			{ keys: ["Esc"], description: "Close the pub results" },
		],
	},
];

/** Shown while the 24 MB cache is still arriving. */
const AppLoading = () => (
	<LoadingState
		label="Loading pub prices…"
		style={{
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			justifyContent: "center",
			minHeight: "100vh",
			gap: "var(--mantine-spacing-sm)",
			padding: "var(--mantine-spacing-md)",
		}}
	>
		<h1 className="sr-only">Spooners — pub prices on a map</h1>
		{Array.from({ length: 4 }).map((_, i) => (
			<Skeleton key={i} height={80} radius="sm" />
		))}
	</LoadingState>
);

/** Shown when the cache could not be read at all; only a retry can help. */
const AppLoadError = ({
	message,
	onRetry,
}: {
	message: string | null;
	onRetry: () => void;
}) => (
	<ErrorState
		title="We couldn't load the pub prices"
		body={
			!navigator.onLine
				? "You appear to be offline. Reconnect and try again."
				: (message ??
					"Something went wrong while loading the data. Please try again.")
		}
		action={<Button onClick={onRetry}>Try again</Button>}
		label={<h1 className="sr-only">Spooners — pub prices on a map</h1>}
		style={{
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			minHeight: "100vh",
			margin: "var(--mantine-spacing-md)",
		}}
	/>
);

/**
 * The page shell.
 *
 * State, handlers and the two-column layout; everything the visitor reads lives
 * in `ResultsSidebar` (the round and what the data says about it), the map, and
 * `SpoonerDialogs`. The derivations between the cache and both of those live in
 * `useSpoonersView`, and the round, the filters, the address bar and the map
 * viewport each have their own hook in `appState.ts` — so what is left here is
 * only the wiring.
 */
export const App = () => {
	const url = useMemo(() => readUrl(), []);
	const { data, error, loading, reload } = useDataset();
	const isMobile = useMediaQuery("(max-width: 62em)");
	const [settings, setSettings] = useSettings();
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();
	const theme = useThemeMode();
	const {
		table: rates,
		loading: ratesLoading,
		error: ratesError,
		refresh: refreshRates,
	} = useRates();

	const [valueOpen, setValueOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [selectedArea, setSelectedArea] = useState<string | null>(null);
	const [chosen, setFocused] = useState<MapPoint | null>(null);

	const {
		selectedCurrency,
		setSelectedCurrency,
		venueRef,
		setVenueRef,
		areaFilter,
		setAreaFilter,
		view,
		setView,
	} = useLinkedSelections(url);

	const filters = useFilters(url, settings);
	const round = useRound(roundFromUrl(url));
	const { userLocation, geoState, requestLocation, clearLocation } =
		useUserLocation();
	const { mapView, setViewport } = useMapViewport(url);

	const derived = useSpoonersView({
		data,
		basket: round.basket,
		selectedCurrency,
		activeFilters: filters.activeFilters,
		activeFacilities: filters.activeFacilities,
		openNowOnly: filters.openNowOnly,
		hideSpecial: filters.hideSpecial,
		hideClosed: filters.hideClosed,
		onlyComplete: filters.onlyComplete,
		areaFilter,
		userLocation,
		view,
		convertCurrency: settings.currency,
		rates,
	});

	const defaultBasket = useMemo(
		() => fallbackRound(derived.fallbackName),
		[derived.fallbackName],
	);

	// A click wins over the pub a link named; the link only fills the gap.
	const focused = chosen ?? linkedVenue(url, derived.withDistance);

	const isDefaultBasket =
		serializeBasket(derived.resolvedBasket) === serializeBasket(defaultBasket);

	const { copied, copyShare } = useUrlSync({
		isDefaultBasket,
		resolvedBasket: derived.resolvedBasket,
		selectedCurrency,
		activeFilters: filters.activeFilters,
		activeFacilities: filters.activeFacilities,
		openNowOnly: filters.openNowOnly,
		hideSpecial: filters.hideSpecial,
		hideClosed: filters.hideClosed,
		onlyComplete: filters.onlyComplete,
		settings,
		venueRef,
		view,
		areaFilter,
		mapView,
	});

	const commands = useMemo(
		() =>
			createSpoonerCommands({
				dark: theme.dark,
				toggleTheme: theme.toggle,
				openShortcuts: shortcuts.open,
				resetFilters: filters.resetFilters,
			}),
		[theme.dark, theme.toggle, shortcuts.open, filters.resetFilters],
	);

	const roundActions = useRoundActions(
		round,
		derived.resolvedBasket,
		defaultBasket,
		setView,
	);

	/*
	 * Adding from a pub dialog closes nothing and changes nothing on screen —
	 * the modal is dismissed and the round is off behind it — so the click used
	 * to look inert. The notification is the acknowledgement, following the
	 * "link copied" toast in `AppHeader`. Spooners has no locale bundle (its
	 * copy is plain British English throughout), so neither does this.
	 */
	const addItem = useCallback(
		(name: string) => {
			roundActions.add(name);
			notifications.show({
				color: "teal",
				message: `Added ${name} to the round`,
				autoClose: 2000,
			});
		},
		[roundActions],
	);

	const { openArea, selectArea } = useAreaSelection({
		areaPoints: derived.areaPoints,
		setAreaFilter,
		setSelectedArea,
		setView,
		setFocused,
	});

	const updateSettings = useCallback(
		(next: typeof settings) => {
			filters.applySettings(next);
			setSettings(next);
		},
		[filters, setSettings],
	);

	// A drink chosen in the discovery panel becomes the whole round, and the
	// map should follow it back to the pubs rather than keep the area view.
	const onlyItemFromDiscover = useCallback(
		(name: string) => {
			roundActions.replace(name);
			setFocused(null);
		},
		[roundActions],
	);

	// The 24 MB cache is fetched once on mount, so a visitor who loaded the app
	// offline is left with the retry screen and no way forward but to reload the
	// tab by hand. Reconnecting is the signal that the fetch can now succeed.
	// Only a failed load is retried: a reload that succeeds would tear the map
	// down behind a loading skeleton on a perfectly working page.
	//
	// Registered once and reading the flag through a ref: re-subscribing on
	// every `error` change tears the listener down and rebuilds it for a
	// condition that only decides *whether the handler does anything*, not what
	// it does.
	const hasError = useRef(false);
	useEffect(() => {
		hasError.current = error !== null;
	}, [error]);
	useEffect(() => {
		const onOnline = () => {
			if (hasError.current) reload();
		};
		window.addEventListener("online", onOnline);
		return () => {
			window.removeEventListener("online", onOnline);
		};
	}, [reload]);

	// Fetched here rather than lazily at the `<Suspense>` boundary below: this
	// runs while the cache is still arriving, so the map's chunk downloads in
	// parallel with 23 MB of JSON instead of after it. Registered once — the
	// import is a module fetch, and the browser caches it.
	useEffect(() => {
		void warmMap();
	}, []);

	if (loading) {
		return <AppLoading />;
	}

	if (error || !data) {
		return <AppLoadError message={error} onRetry={reload} />;
	}

	return (
		<Box
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100dvh",
			}}
		>
			<SkipLink />
			<AppHeader
				stats={derived.stats}
				itemCount={derived.index.length}
				venues={data.venueList}
				onSelectVenue={setVenueRef}
				converting={derived.converting}
				displayCurrency={derived.displayCurrency}
				rateIssue={settings.currency !== "native" && !derived.converting}
				copied={copied}
				onShare={copyShare}
				onValueOpen={() => setValueOpen(true)}
				onSettingsOpen={() => setSettingsOpen(true)}
				shortcuts={SHORTCUT_GROUPS}
			/>

			<main
				id="main"
				style={{
					display: "flex",
					flexDirection: isMobile ? "column-reverse" : "row",
					flex: 1,
					minHeight: 0,
				}}
			>
				<h1 className="sr-only">Spooners — pub prices on a map</h1>
				<Box
					className="spooners-scroll"
					style={{
						width: isMobile ? "100%" : 400,
						flex: isMobile ? 1 : undefined,
						flexShrink: isMobile ? 1 : 0,
						minHeight: 0,
						overflowY: "auto",
						borderRight: isMobile
							? undefined
							: "1px solid var(--mantine-color-default-border)",
						padding: 12,
					}}
				>
					<ResultsSidebar
						view={derived}
						venues={data.venueList}
						history={data.history?.items}
						activeFilters={filters.activeFilters}
						onFilters={filters.setActiveFilters}
						activeFacilities={filters.activeFacilities}
						onFacilities={filters.setActiveFacilities}
						onResetFilters={filters.resetFilters}
						openNow={filters.openNowOnly}
						onOpenNow={filters.setOpenNowOnly}
						hideSpecial={filters.hideSpecial}
						onHideSpecial={filters.setHideSpecial}
						hideClosed={filters.hideClosed}
						onHideClosed={filters.setHideClosed}
						onlyComplete={filters.onlyComplete}
						onOnlyComplete={filters.setOnlyComplete}
						resolvedBasket={derived.resolvedBasket}
						onAdd={addItem}
						onQty={roundActions.setQty}
						onRemove={roundActions.remove}
						onClear={roundActions.clear}
						onUndo={round.undo ? round.restore : null}
						undoText={round.undoText}
						currency={derived.displayCurrency}
						onCurrency={(currency) => {
							setSelectedCurrency(currency);
							setFocused(null);
						}}
						rateDate={rates?.date ?? null}
						hasLocation={Boolean(userLocation)}
						geoState={geoState}
						onNearMe={requestLocation}
						onClearLocation={clearLocation}
						onSelectVenue={setVenueRef}
						focused={focused}
						onFocus={setFocused}
						onDetails={(venue) => setVenueRef(venue.ref)}
						selectedArea={selectedArea}
						onSelectArea={selectArea}
						onOnlyItem={onlyItemFromDiscover}
						rankingRows={settings.rankingRows}
					/>
				</Box>

				<Suspense fallback={<MapFallback compact={isMobile} />}>
					<MapPane
						compact={isMobile}
						view={view}
						points={derived.mapData}
						unpriced={derived.unpricedPoints}
						pubCount={derived.mapData.length}
						areaCount={derived.areaPoints.length}
						scale={derived.mapScale}
						currency={derived.displayCurrency}
						legendLabel={derived.legendLabel}
						median={derived.medianPrice}
						hiddenCount={derived.hiddenCount}
						focused={focused}
						onFocus={setFocused}
						onOpen={setVenueRef}
						onArea={openArea}
						area={areaFilter}
						onClearArea={() => setAreaFilter(null)}
						onView={setView}
						initialView={mapView}
						onViewport={setViewport}
					/>
				</Suspense>
			</main>

			<SpoonerDialogs
				venueRef={venueRef}
				onVenueChange={setVenueRef}
				cache={data}
				format={derived.format}
				onOnlyItem={roundActions.replace}
				onAddItem={addItem}
				valueOpen={valueOpen}
				onValueClose={() => setValueOpen(false)}
				settingsOpen={settingsOpen}
				onSettingsClose={() => setSettingsOpen(false)}
				settings={settings}
				onSettings={updateSettings}
				currencies={currencyChoices(rates)}
				rateDate={rates?.date ?? null}
				rateSource={RATE_SOURCE}
				ratesLoading={ratesLoading}
				ratesError={ratesError}
				onRefreshRates={refreshRates}
				paletteOpened={palette.opened}
				onPaletteClose={palette.close}
				commands={commands}
			/>
		</Box>
	);
};
