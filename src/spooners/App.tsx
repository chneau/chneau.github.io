import {
	Alert,
	Box,
	Button,
	Card,
	Group,
	Loader,
	Stack,
	Text,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { type BasketItem, parseBasket, serializeBasket } from "./basket";
import { AppHeader } from "./components/AppHeader";
import { DiscoverPanel } from "./components/DiscoverPanel";
import { Distribution } from "./components/Distribution";
import { GeographyPanel } from "./components/GeographyPanel";
import { ItemModal } from "./components/ItemModal";
import {
	MapPanel,
	type MapView,
	UK_CENTER,
	UK_ZOOM,
} from "./components/MapPanel";
import { MenuLessPanel } from "./components/MenuLessPanel";
import { PubSearch } from "./components/PubSearch";
import { RankingPanel } from "./components/RankingPanel";
import { RoundCard } from "./components/RoundCard";
import { Section } from "./components/Section";
import { SettingsModal } from "./components/SettingsModal";
import { StatsBar } from "./components/StatsBar";
import { ValueExplorer } from "./components/ValueExplorer";
import { VenueModal } from "./components/VenueModal";
import { money } from "./price";
import { currencyChoices, useRates } from "./rates";
import { useSettings } from "./settings";
import type { MapPoint, PricedVenue } from "./types";
import { readUrl, shareUrl, writeUrl } from "./url";
import { useDataset } from "./useDataset";
import { useSpoonersView } from "./useSpoonersView";

const RATE_SOURCE = "European Central Bank, via frankfurter.dev";

export const App = () => {
	const url = useMemo(() => readUrl(), []);
	const { data, error, loading } = useDataset();
	const isMobile = useMediaQuery("(max-width: 62em)");
	const [settings, setSettings] = useSettings();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const {
		table: rates,
		loading: ratesLoading,
		error: ratesError,
		refresh: refreshRates,
	} = useRates();

	// The round is the single source of truth. `null` means "not touched yet",
	// which resolves to one of the fallback item.
	const [basket, setBasket] = useState<BasketItem[] | null>(() => {
		const fromRound = parseBasket(url.round ?? null);
		if (fromRound.length) {
			return fromRound;
		}
		return url.item ? [{ name: url.item, qty: 1 }] : null;
	});
	const [selectedCurrency, setSelectedCurrency] = useState<string | null>(
		url.cur ?? null,
	);
	const [activeFilters, setActiveFilters] = useState<string[]>(
		url.filters ?? [],
	);
	const [activeFacilities, setActiveFacilities] = useState<string[]>(
		url.facilities ?? [],
	);
	const [openNowOnly, setOpenNowOnly] = useState(url.open ?? settings.openNow);
	const [hideSpecial, setHideSpecial] = useState(
		url.special ?? settings.hideSpecial,
	);
	const [hideClosed, setHideClosed] = useState(
		url.closed ?? settings.hideClosed,
	);
	const [onlyComplete, setOnlyComplete] = useState(
		url.complete ?? settings.onlyComplete,
	);
	const [undo, setUndo] = useState<{
		basket: BasketItem[];
		text: string;
	} | null>(null);
	const [itemFromVenue, setItemFromVenue] = useState<number | null>(null);
	const [itemModal, setItemModal] = useState<string | null>(null);
	const [valueOpen, setValueOpen] = useState(false);
	const [venueRef, setVenueRef] = useState<number | null>(url.venue ?? null);
	const [view, setView] = useState<MapView>(
		url.view === "area" ? "area" : "pubs",
	);
	const [selectedArea, setSelectedArea] = useState<string | null>(null);
	const [areaFilter, setAreaFilter] = useState<string | null>(url.area ?? null);
	const [focused, setFocused] = useState<MapPoint | null>(null);
	const [mapView, setMapView] = useState<{
		center: [number, number];
		zoom: number;
	} | null>(
		url.lat != null && url.lng != null && url.z != null
			? { center: [url.lat, url.lng], zoom: url.z }
			: null,
	);
	const [copied, setCopied] = useState(false);
	const [userLocation, setUserLocation] = useState<{
		lat: number;
		lng: number;
	} | null>(null);
	const [geoState, setGeoState] = useState<"idle" | "loading" | "error">(
		"idle",
	);

	const {
		index,
		stats,
		filters,
		visibleIndex,
		fallbackName,
		resolvedBasket,
		singleName,
		dietaryRelevant,
		currencies,
		converting,
		displayCurrency,
		format,
		completeVenues,
		completeCount,
		partialCount,
		itemMetric,
		trend,
		openCount,
		specialCount,
		closedCount,
		facilityOptions,
		withDistance,
		nearby,
		scale,
		prices,
		medianPrice,
		hiddenCount,
		legendLabel,
		premium,
		areas,
		unpricedAll,
		unpricedPoints,
		rare,
		fresh,
		sellers,
		areaPoints,
		mapData,
		mapScale,
	} = useSpoonersView({
		data,
		basket,
		selectedCurrency,
		activeFilters,
		activeFacilities,
		openNowOnly,
		hideSpecial,
		hideClosed,
		onlyComplete,
		areaFilter,
		userLocation,
		view,
		convertCurrency: settings.currency,
		rates,
	});

	const defaultBasket = useMemo(
		() => (fallbackName ? [{ name: fallbackName, qty: 1 }] : []),
		[fallbackName],
	);

	// resolve "untouched" to the fallback item, once the data is there
	useEffect(() => {
		if (basket === null && fallbackName) {
			setBasket(defaultBasket);
		}
	}, [basket, fallbackName, defaultBasket]);

	const updateBasket = (update: (current: BasketItem[]) => BasketItem[]) => {
		setUndo(null);
		setBasket((current) => update(current ?? defaultBasket));
	};

	const addToRound = (name: string) =>
		updateBasket((current) => {
			const existing = current.find((item) => item.name === name);
			if (existing) {
				return current.map((item) =>
					item.name === name ? { ...item, qty: item.qty + 1 } : item,
				);
			}
			return [...current, { name, qty: 1 }];
		});

	const onlyItem = (name: string) => {
		const already =
			resolvedBasket.length === 1 &&
			resolvedBasket[0]?.name === name &&
			resolvedBasket[0]?.qty === 1;
		if (already || !resolvedBasket.length) {
			setUndo(null);
		} else {
			setUndo({ basket: resolvedBasket, text: "Round replaced" });
		}
		setBasket([{ name, qty: 1 }]);
		setView("pubs");
	};

	const resetFilters = () => {
		setAreaFilter(null);
		setActiveFilters([]);
		setActiveFacilities([]);
		setOpenNowOnly(settings.openNow);
		setHideSpecial(settings.hideSpecial);
		setHideClosed(settings.hideClosed);
		setOnlyComplete(settings.onlyComplete);
	};

	const requestLocation = () => {
		if (!navigator.geolocation) {
			setGeoState("error");
			return;
		}
		setGeoState("loading");
		navigator.geolocation.getCurrentPosition(
			(position) => {
				setUserLocation({
					lat: position.coords.latitude,
					lng: position.coords.longitude,
				});
				setGeoState("idle");
			},
			() => setGeoState("error"),
			{ timeout: 8000 },
		);
	};

	const updateSettings = (next: typeof settings) => {
		if (next.openNow !== settings.openNow) {
			setOpenNowOnly(next.openNow);
		}
		if (next.hideSpecial !== settings.hideSpecial) {
			setHideSpecial(next.hideSpecial);
		}
		if (next.hideClosed !== settings.hideClosed) {
			setHideClosed(next.hideClosed);
		}
		if (next.onlyComplete !== settings.onlyComplete) {
			setOnlyComplete(next.onlyComplete);
		}
		setSettings(next);
	};

	const openArea = (name: string) => {
		setAreaFilter(name);
		setView("pubs");
		const point = areaPoints.find((candidate) => candidate.name === name);
		if (point) {
			setFocused(point);
		}
	};

	const isDefaultBasket =
		serializeBasket(resolvedBasket) === serializeBasket(defaultBasket);

	// The URL only carries what differs from the landing defaults.
	const atDefaultView =
		!mapView ||
		(Math.abs(mapView.center[0] - UK_CENTER[0]) < 0.05 &&
			Math.abs(mapView.center[1] - UK_CENTER[1]) < 0.05 &&
			Math.abs(mapView.zoom - UK_ZOOM) < 0.05);
	const urlState = useMemo(
		() => ({
			round: isDefaultBasket
				? undefined
				: serializeBasket(resolvedBasket) || undefined,
			cur: selectedCurrency ?? undefined,
			filters: activeFilters,
			facilities: activeFacilities,
			open: openNowOnly !== settings.openNow ? openNowOnly : undefined,
			special: hideSpecial !== settings.hideSpecial ? hideSpecial : undefined,
			closed: hideClosed !== settings.hideClosed ? hideClosed : undefined,
			complete:
				onlyComplete !== settings.onlyComplete ? onlyComplete : undefined,
			venue: venueRef ?? undefined,
			view,
			area: areaFilter ?? undefined,
			lat: atDefaultView ? undefined : mapView?.center[0],
			lng: atDefaultView ? undefined : mapView?.center[1],
			z: atDefaultView ? undefined : mapView?.zoom,
		}),
		[
			isDefaultBasket,
			resolvedBasket,
			selectedCurrency,
			activeFilters,
			activeFacilities,
			openNowOnly,
			hideSpecial,
			hideClosed,
			settings.openNow,
			settings.hideSpecial,
			settings.hideClosed,
			onlyComplete,
			settings.onlyComplete,
			venueRef,
			view,
			areaFilter,
			atDefaultView,
			mapView,
		],
	);

	useEffect(() => {
		writeUrl(urlState);
	}, [urlState]);

	// focus a venue from a shared link, once its data is available
	useEffect(() => {
		if (url.venue == null || focused) {
			return;
		}
		const match = withDistance.find((venue) => venue.ref === url.venue);
		if (match) {
			setFocused(match);
		}
	}, [url.venue, withDistance, focused]);

	const copyShare = async () => {
		const link = shareUrl(urlState);
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			window.prompt("Copy this link", link);
		}
	};

	if (loading) {
		return (
			<Stack align="center" justify="center" h="100vh" gap="sm">
				<Loader />
				<Text c="dimmed">Loading pub prices…</Text>
			</Stack>
		);
	}

	if (error || !data) {
		return (
			<Alert color="red" title="Could not load the data" m="md">
				{error ?? "Unknown error"}
			</Alert>
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
			<AppHeader
				stats={stats}
				itemCount={index.length}
				venues={data.venueList}
				onSelectVenue={setVenueRef}
				converting={converting}
				displayCurrency={displayCurrency}
				copied={copied}
				onShare={copyShare}
				onValueOpen={() => setValueOpen(true)}
				onSettingsOpen={() => setSettingsOpen(true)}
			/>

			<Box
				style={{
					display: "flex",
					flexDirection: isMobile ? "column-reverse" : "row",
					flex: 1,
					minHeight: 0,
				}}
			>
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
					<Stack gap="sm">
						<Box hiddenFrom="md">
							<PubSearch venues={data.venueList} onSelect={setVenueRef} />
						</Box>
						<RoundCard
							items={visibleIndex}
							basket={resolvedBasket}
							onAdd={addToRound}
							onQty={(name, qty) =>
								updateBasket((current) =>
									current
										.map((item) =>
											item.name === name ? { ...item, qty } : item,
										)
										.filter((item) => item.qty > 0),
								)
							}
							onRemove={(name) =>
								updateBasket((current) =>
									current.filter((item) => item.name !== name),
								)
							}
							onClear={() => {
								setUndo({ basket: resolvedBasket, text: "Round cleared" });
								setBasket([]);
							}}
							onUndo={
								undo
									? () => {
											setBasket(undo.basket);
											setUndo(null);
										}
									: null
							}
							undoText={undo?.text ?? null}
							currencies={converting ? [] : currencies}
							currency={displayCurrency}
							onCurrency={(currency) => {
								setSelectedCurrency(currency);
								setFocused(null);
							}}
							filters={filters}
							activeFilters={activeFilters}
							onFilters={setActiveFilters}
							dietaryRelevant={dietaryRelevant}
							facilities={facilityOptions}
							activeFacilities={activeFacilities}
							onFacilities={setActiveFacilities}
							openNow={openNowOnly}
							onOpenNow={setOpenNowOnly}
							openCount={openCount}
							hideSpecial={hideSpecial}
							onHideSpecial={setHideSpecial}
							specialCount={specialCount}
							hideClosed={hideClosed}
							onHideClosed={setHideClosed}
							closedCount={closedCount}
							completeCount={completeCount}
							partialCount={partialCount}
							onlyComplete={onlyComplete}
							onOnlyComplete={setOnlyComplete}
							hasLocation={Boolean(userLocation)}
							geoState={geoState}
							onNearMe={requestLocation}
							onClearLocation={() => setUserLocation(null)}
							scale={scale}
							metric={itemMetric}
							trend={trend}
							converted={
								converting
									? { currency: displayCurrency, rateDate: rates?.date ?? null }
									: null
							}
						/>
						<Section title="Prices">
							<StatsBar
								pubs={withDistance.length}
								cheapest={money(scale.min, displayCurrency)}
								median={money(medianPrice, displayCurrency)}
								dearest={money(scale.max, displayCurrency)}
								portion={
									singleName ? (completeVenues[0]?.portion ?? null) : null
								}
								premium={premium}
							/>
						</Section>
						{withDistance.length === 0 ? (
							<Card withBorder padding="md" radius="md">
								<Stack gap="xs">
									<Text fw={600}>No pubs match</Text>
									<Text size="sm" c="dimmed">
										Nothing serves this round with the current filters.
									</Text>
									<Group gap="xs">
										{partialCount > 0 && onlyComplete ? (
											<Button size="xs" onClick={() => setOnlyComplete(false)}>
												Include partial pubs ({partialCount})
											</Button>
										) : null}
										<Button size="xs" variant="light" onClick={resetFilters}>
											Reset filters
										</Button>
										{resolvedBasket.length ? (
											<Button
												size="xs"
												variant="subtle"
												color="red"
												onClick={() => {
													setUndo({
														basket: resolvedBasket,
														text: "Round cleared",
													});
													setBasket([]);
												}}
											>
												Clear round
											</Button>
										) : null}
									</Group>
								</Stack>
							</Card>
						) : null}
						<Section title="Price distribution">
							<Distribution
								prices={prices}
								scale={scale}
								currency={displayCurrency}
								median={medianPrice}
								history={
									singleName ? data.history?.items?.[singleName] : undefined
								}
							/>
						</Section>
						<Section title="Rankings">
							<RankingPanel
								venues={withDistance}
								scale={scale}
								currency={displayCurrency}
								focused={focused}
								onFocus={(venue: PricedVenue) => setFocused(venue)}
								onDetails={(venue: PricedVenue) => setVenueRef(venue.ref)}
								nearby={nearby}
								count={settings.rankingRows}
							/>
						</Section>
						{areas.length >= 2 ? (
							<Section
								title="By area"
								badge={
									<Text size="xs" c="dimmed">
										{areas.length} areas
									</Text>
								}
							>
								<GeographyPanel
									stats={areas}
									currency={displayCurrency}
									selected={selectedArea}
									onSelect={(stat) => {
										setSelectedArea(stat.area);
										setView("area");
										const point = areaPoints.find(
											(candidate) => candidate.name === stat.area,
										);
										if (point) {
											setFocused(point);
										}
									}}
								/>
							</Section>
						) : null}
						{rare.length || fresh.length ? (
							<Section title="Discover">
								<DiscoverPanel
									rare={rare}
									fresh={fresh}
									sellers={sellers}
									onSelect={(name) => {
										onlyItem(name);
										setFocused(null);
									}}
								/>
							</Section>
						) : null}
						{unpricedAll.length ? (
							<Section
								title="No published menu"
								badge={
									<Text size="xs" c="dimmed">
										{unpricedAll.length}
									</Text>
								}
							>
								<MenuLessPanel venues={unpricedAll} onSelect={setVenueRef} />
							</Section>
						) : null}
					</Stack>
				</Box>

				<Box
					style={{
						flex: isMobile ? undefined : 1,
						flexShrink: 0,
						minWidth: 0,
						height: isMobile ? "45vh" : "auto",
					}}
				>
					<MapPanel
						points={mapData}
						unpriced={view === "pubs" ? unpricedPoints : undefined}
						scale={mapScale}
						currency={displayCurrency}
						focused={focused}
						onFocus={setFocused}
						onOpen={setVenueRef}
						onArea={openArea}
						area={areaFilter}
						onClearArea={() => setAreaFilter(null)}
						compact={isMobile}
						view={view}
						onView={setView}
						countLabel={
							view === "area"
								? `${areaPoints.length} areas`
								: `${mapData.length} pubs`
						}
						legendLabel={view === "area" ? "median of the area" : legendLabel}
						median={view === "area" ? null : medianPrice}
						hiddenCount={view === "area" ? undefined : hiddenCount}
						initialView={mapView}
						onViewport={(center, zoom) => setMapView({ center, zoom })}
					/>
				</Box>
			</Box>

			<VenueModal
				opened={venueRef != null}
				onClose={() => setVenueRef(null)}
				venueRef={venueRef}
				cache={data}
				onSelectItem={onlyItem}
				onAddItem={addToRound}
				onItem={(name) => {
					setVenueRef(null);
					setItemFromVenue(venueRef);
					setItemModal(name);
				}}
				format={format}
			/>

			<ItemModal
				opened={itemModal != null}
				onClose={() => {
					setItemModal(null);
					setItemFromVenue(null);
				}}
				itemName={itemModal}
				cache={data}
				onAdd={addToRound}
				onOnly={onlyItem}
				onVenue={(ref) => {
					setItemModal(null);
					setItemFromVenue(null);
					setVenueRef(ref);
				}}
				format={format}
				onBack={
					itemFromVenue != null
						? () => {
								setItemModal(null);
								setVenueRef(itemFromVenue);
								setItemFromVenue(null);
							}
						: undefined
				}
			/>

			<ValueExplorer
				opened={valueOpen}
				onClose={() => setValueOpen(false)}
				cache={data}
				onItem={(name) => {
					setValueOpen(false);
					setItemModal(name);
				}}
				onVenue={(ref) => {
					setValueOpen(false);
					setVenueRef(ref);
				}}
				format={format}
			/>

			<SettingsModal
				opened={settingsOpen}
				onClose={() => setSettingsOpen(false)}
				settings={settings}
				onChange={updateSettings}
				currencies={currencyChoices(rates)}
				rateDate={rates?.date ?? null}
				rateSource={RATE_SOURCE}
				ratesLoading={ratesLoading}
				ratesError={ratesError}
				onRefreshRates={refreshRates}
			/>
		</Box>
	);
};
