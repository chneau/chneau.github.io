import { Box, Button, Skeleton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
	type ReactNode,
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
import { MapColumn } from "./components/MapColumn";
import { ResultsColumn } from "./components/ResultsColumn";
import { SpoonerDialogs } from "./components/SpoonerDialogs";
import { currencyChoices, useRates } from "./rates";
import { useSettings } from "./settings";
import type { MapPoint, SpoonersCache } from "./types";
import { readUrl } from "./url";
import { useDataset } from "./useDataset";
import { type SpoonersView, useSpoonersView } from "./useSpoonersView";

const RATE_SOURCE = "European Central Bank, via frankfurter.dev";

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

const AppLanding = ({
	header,
	children,
}: {
	header: ReactNode;
	children: ReactNode;
}) => (
	<Box
		style={{
			display: "flex",
			flexDirection: "column",
			minHeight: "100dvh",
		}}
	>
		<SkipLink />
		{header}
		<main
			id="main"
			style={{
				display: "flex",
				flexDirection: "column",
				flex: 1,
				minHeight: 0,
				padding: "var(--mantine-spacing-md)",
			}}
		>
			<h1 className="sr-only">Spooners — pub prices on a map</h1>
			{children}
		</main>
	</Box>
);

const AppLoading = () => (
	<LoadingState
		label="Loading pub prices…"
		style={{
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			justifyContent: "center",
			flex: 1,
			minHeight: 0,
			gap: "var(--mantine-spacing-sm)",
		}}
	>
		{Array.from({ length: 4 }).map((_, i) => (
			<Skeleton key={i} height={80} radius="sm" />
		))}
	</LoadingState>
);

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
		style={{
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			flex: 1,
			minWidth: 0,
		}}
	/>
);

const SpoonersHeader = ({
	cache,
	stats,
	itemCount,
	currency,
	converting,
	displayCurrency,
	copied,
	onShare,
	onValueOpen,
	onSettingsOpen,
	onSelectVenue,
}: {
	cache: SpoonersCache | null;
	stats: SpoonersView["stats"];
	itemCount: number;
	currency: string;
	converting: boolean;
	displayCurrency: string;
	copied: boolean;
	onShare: () => void;
	onValueOpen: () => void;
	onSettingsOpen: () => void;
	onSelectVenue: (ref: number) => void;
}) => (
	<AppHeader
		dataset={
			cache
				? {
						stats,
						itemCount,
						venues: cache.venueList,
						onSelectVenue,
					}
				: undefined
		}
		converting={converting}
		displayCurrency={displayCurrency}
		rateIssue={cache !== null && currency !== "native" && !converting}
		copied={copied}
		onShare={onShare}
		onValueOpen={onValueOpen}
		onSettingsOpen={onSettingsOpen}
		shortcuts={SHORTCUT_GROUPS}
	/>
);

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

	const onlyItemFromDiscover = useCallback(
		(name: string) => {
			roundActions.replace(name);
			setFocused(null);
		},
		[roundActions],
	);

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

	useEffect(() => {
		void import("./components/MapPane").catch(() => undefined);
	}, []);

	const header = (
		<SpoonersHeader
			cache={data}
			stats={derived.stats}
			itemCount={derived.index.length}
			currency={settings.currency}
			converting={derived.converting}
			displayCurrency={derived.displayCurrency}
			copied={copied}
			onShare={copyShare}
			onValueOpen={() => setValueOpen(true)}
			onSettingsOpen={() => setSettingsOpen(true)}
			onSelectVenue={setVenueRef}
		/>
	);

	if (loading) {
		return (
			<AppLanding header={header}>
				<AppLoading />
			</AppLanding>
		);
	}

	if (error || !data) {
		return (
			<AppLanding header={header}>
				<AppLoadError message={error} onRetry={reload} />
			</AppLanding>
		);
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
			{header}

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
				<ResultsColumn
					view={derived}
					cache={data}
					filters={filters}
					onAdd={addItem}
					onQty={roundActions.setQty}
					onRemove={roundActions.remove}
					onClear={roundActions.clear}
					onUndo={round.undo ? round.restore : null}
					undoText={round.undoText}
					onOnlyItem={onlyItemFromDiscover}
					rateDate={rates?.date ?? null}
					onCurrency={(currency) => {
						setSelectedCurrency(currency);
						setFocused(null);
					}}
					userLocation={userLocation}
					geoState={geoState}
					onNearMe={requestLocation}
					onClearLocation={clearLocation}
					onSelectVenue={setVenueRef}
					focused={focused}
					onFocus={setFocused}
					selectedArea={selectedArea}
					onSelectArea={selectArea}
					rankingRows={settings.rankingRows}
					isMobile={isMobile}
				/>

				<MapColumn
					compact={isMobile}
					view={derived}
					mode={view}
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
