import {
	ActionIcon,
	Alert,
	Badge,
	Box,
	Button,
	Group,
	Loader,
	Stack,
	Text,
	Title,
	Tooltip,
	useMantineColorScheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Beer, Copy, Moon, Settings, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	type BasketItem,
	basketVenues,
	parseBasket,
	serializeBasket,
} from "./basket";
import { DiscoverPanel } from "./components/DiscoverPanel";
import { Distribution } from "./components/Distribution";
import { GeographyPanel } from "./components/GeographyPanel";
import {
	MapPanel,
	type MapView,
	UK_CENTER,
	UK_ZOOM,
} from "./components/MapPanel";
import { MenuLessPanel } from "./components/MenuLessPanel";
import { RankingPanel } from "./components/RankingPanel";
import { RoundCard } from "./components/RoundCard";
import { SettingsModal } from "./components/SettingsModal";
import { StatsBar } from "./components/StatsBar";
import { VenueModal } from "./components/VenueModal";
import {
	areaStats,
	availableCurrencies,
	availableFacilities,
	availableFilters,
	buildItemIndex,
	cacheStats,
	haversineMiles,
	isCaptiveSpot,
	isTemporarilyClosed,
	itemTrend,
	matchesFacilities,
	matchesFilters,
	nearestSellers,
	newItems,
	rareItems,
	specialPremium,
	venuesWithoutPrices,
} from "./derive";
import { metricText } from "./portions";
import { makeScale, median, money } from "./price";
import { canConvertTo, convert, currencyChoices, useRates } from "./rates";
import { useSettings } from "./settings";
import type { MapPoint, PricedVenue } from "./types";
import { readUrl, shareUrl, writeUrl } from "./url";
import { useDataset } from "./useDataset";

const DEFAULT_ITEM_HINT = "guinness";
const RATE_SOURCE = "European Central Bank, via frankfurter.dev";

export const App = () => {
	const url = useMemo(() => readUrl(), []);
	const { data, error, loading } = useDataset();
	const { colorScheme, setColorScheme } = useMantineColorScheme();
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
	const [venueRef, setVenueRef] = useState<number | null>(url.venue ?? null);
	const [view, setView] = useState<MapView>(
		url.view === "area" ? "area" : "pubs",
	);
	const [selectedArea, setSelectedArea] = useState<string | null>(null);
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

	const index = useMemo(() => (data ? buildItemIndex(data) : []), [data]);
	const filters = useMemo(() => availableFilters(index), [index]);
	const visibleIndex = useMemo(
		() => index.filter((item) => matchesFilters(item, activeFilters)),
		[index, activeFilters],
	);
	const stats = useMemo(
		() =>
			data
				? cacheStats(data)
				: { venues: 0, venuesWithData: 0, items: 0, updatedAt: null },
		[data],
	);

	const fallbackName = useMemo(
		() =>
			visibleIndex.find((item) =>
				item.name.toLowerCase().includes(DEFAULT_ITEM_HINT),
			)?.name ??
			visibleIndex[0]?.name ??
			null,
		[visibleIndex],
	);

	// resolve "untouched" to the fallback item, once the data is there
	useEffect(() => {
		if (basket === null && fallbackName) {
			setBasket([{ name: fallbackName, qty: 1 }]);
		}
	}, [basket, fallbackName]);

	const resolvedBasket = useMemo(
		() => basket ?? (fallbackName ? [{ name: fallbackName, qty: 1 }] : []),
		[basket, fallbackName],
	);
	const singleName =
		resolvedBasket.length === 1 ? (resolvedBasket[0]?.name ?? null) : null;
	const updateBasket = (update: (current: BasketItem[]) => BasketItem[]) =>
		setBasket((current) =>
			update(current ?? (fallbackName ? [{ name: fallbackName, qty: 1 }] : [])),
		);

	const priced = useMemo(
		() =>
			data && resolvedBasket.length ? basketVenues(data, resolvedBasket) : [],
		[data, resolvedBasket],
	);

	// native mode: each pub keeps its own currency (switch between them)
	const currencies = useMemo(() => availableCurrencies(priced), [priced]);
	const effectiveCurrency =
		selectedCurrency &&
		currencies.some((option) => option.code === selectedCurrency)
			? selectedCurrency
			: (currencies.find((option) => option.code === "GBP")?.code ??
				currencies[0]?.code ??
				"GBP");
	const nativeVenues = useMemo(
		() => priced.filter((venue) => venue.currency === effectiveCurrency),
		[priced, effectiveCurrency],
	);

	// converted mode: everything into one currency, so EUR pubs show up too
	const convertTo = settings.currency !== "native" ? settings.currency : null;
	const converting = Boolean(convertTo && canConvertTo(convertTo, rates));
	const displayVenues = useMemo(() => {
		if (!(converting && convertTo)) {
			return nativeVenues;
		}
		return priced.map((venue) => ({
			...venue,
			price: convert(venue.price, venue.currency, convertTo, rates),
			previousPrice:
				venue.previousPrice != null
					? convert(venue.previousPrice, venue.currency, convertTo, rates)
					: null,
			lines: venue.lines.map((line) => ({
				...line,
				price: convert(line.price, venue.currency, convertTo, rates),
			})),
			currency: convertTo,
		}));
	}, [converting, convertTo, priced, nativeVenues, rates]);
	const displayCurrency =
		converting && convertTo ? convertTo : effectiveCurrency;

	// only compare pubs that can serve every item of the round
	const completeVenues = useMemo(
		() =>
			onlyComplete
				? displayVenues.filter((venue) => venue.missing.length === 0)
				: displayVenues,
		[displayVenues, onlyComplete],
	);
	const partialCount = useMemo(
		() => displayVenues.filter((venue) => venue.missing.length > 0).length,
		[displayVenues],
	);
	const completeCount = displayVenues.length - partialCount;

	const itemMetric = useMemo(() => {
		if (!singleName) {
			return null;
		}
		const venue = completeVenues.find(
			(candidate) => candidate.metricKind && candidate.metricValue != null,
		);
		if (!venue?.metricKind || venue.metricValue == null) {
			return null;
		}
		return metricText(
			{ kind: venue.metricKind, value: venue.metricValue },
			displayCurrency,
		);
	}, [completeVenues, displayCurrency, singleName]);
	const trend = useMemo(
		() => (data && singleName ? itemTrend(data, singleName) : null),
		[data, singleName],
	);

	const openCount = useMemo(
		() => completeVenues.filter((venue) => venue.isOpenNow).length,
		[completeVenues],
	);
	const specialCount = useMemo(
		() => completeVenues.filter((venue) => isCaptiveSpot(venue.spot)).length,
		[completeVenues],
	);
	const closedCount = useMemo(
		() =>
			completeVenues.filter(
				(venue) => venue.isClosed || isTemporarilyClosed(venue.status),
			).length,
		[completeVenues],
	);
	const facilityOptions = useMemo(
		() => availableFacilities(completeVenues),
		[completeVenues],
	);

	const venues = useMemo(() => {
		let list = completeVenues;
		if (openNowOnly) {
			list = list.filter((venue) => venue.isOpenNow);
		}
		if (hideSpecial) {
			list = list.filter((venue) => !isCaptiveSpot(venue.spot));
		}
		if (hideClosed) {
			list = list.filter(
				(venue) => !venue.isClosed && !isTemporarilyClosed(venue.status),
			);
		}
		if (activeFacilities.length) {
			list = list.filter((venue) => matchesFacilities(venue, activeFacilities));
		}
		return list;
	}, [completeVenues, openNowOnly, hideSpecial, hideClosed, activeFacilities]);

	const withDistance = useMemo(
		() =>
			userLocation
				? venues.map((venue) => ({
						...venue,
						distance: haversineMiles(userLocation, {
							lat: venue.lat,
							lng: venue.lng,
						}),
					}))
				: venues,
		[venues, userLocation],
	);
	const nearby = useMemo(
		() =>
			userLocation
				? [...withDistance]
						.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
						.slice(0, 12)
				: undefined,
		[withDistance, userLocation],
	);
	const scale = useMemo(
		() => makeScale(withDistance.map((venue) => venue.price)),
		[withDistance],
	);
	const prices = useMemo(
		() => withDistance.map((venue) => venue.price),
		[withDistance],
	);
	const medianPrice = useMemo(() => median(prices), [prices]);

	const premium = useMemo(() => {
		const insight = specialPremium(completeVenues);
		if (!insight) {
			return null;
		}
		const sign = insight.premiumPercent >= 0 ? "+" : "−";
		const where = completeVenues.some((venue) => venue.spot === "airport")
			? "✈️ Airport"
			: "⛱️ Travel";
		return `${where} venues charge ${sign}${Math.abs(
			Math.round(insight.premiumPercent),
		)}% more than the rest — median ${money(
			insight.specialMedian,
			displayCurrency,
		)} vs ${money(insight.normalMedian, displayCurrency)} (${insight.specialCount} of ${
			insight.specialCount + insight.normalCount
		} pubs)`;
	}, [completeVenues, displayCurrency]);

	const areas = useMemo(() => areaStats(withDistance), [withDistance]);

	// pubs whose menu is not published at all - the panel lists every one,
	// whatever the map filters, while the grey markers follow the filters
	const unpricedAll = useMemo(() => {
		if (!data) {
			return [];
		}
		const list = venuesWithoutPrices(data);
		return userLocation
			? list.map((venue) => ({
					...venue,
					distance: haversineMiles(userLocation, {
						lat: venue.lat,
						lng: venue.lng,
					}),
				}))
			: list;
	}, [data, userLocation]);
	const unpricedMap = useMemo(() => {
		let list = unpricedAll;
		if (openNowOnly) {
			list = list.filter((venue) => venue.isOpenNow);
		}
		if (hideSpecial) {
			list = list.filter((venue) => !isCaptiveSpot(venue.spot));
		}
		if (hideClosed) {
			list = list.filter(
				(venue) => !venue.isClosed && !isTemporarilyClosed(venue.status),
			);
		}
		if (activeFacilities.length) {
			list = list.filter((venue) =>
				activeFacilities.every((facility) =>
					venue.facilities.includes(facility),
				),
			);
		}
		return list;
	}, [unpricedAll, openNowOnly, hideSpecial, hideClosed, activeFacilities]);
	const unpricedPoints = useMemo<MapPoint[]>(
		() =>
			unpricedMap.map((venue) => ({
				ref: venue.ref,
				name: venue.name,
				lat: venue.lat,
				lng: venue.lng,
				price: 0,
				currency: venue.currency,
				label: "no prices published",
				line1: null,
				town: venue.town,
				postcode: venue.postcode,
				facilities: venue.facilities,
				phone: venue.phone,
				spot: venue.spot,
				isClosed: venue.isClosed,
				isOpenNow: venue.isOpenNow,
				hoursToday: venue.hoursToday,
				distance: venue.distance,
			})),
		[unpricedMap],
	);

	// discovery: rare guest ales and new items
	const rare = useMemo(
		() => rareItems(visibleIndex).slice(0, 60),
		[visibleIndex],
	);
	const fresh = useMemo(
		() => newItems(visibleIndex).slice(0, 60),
		[visibleIndex],
	);
	const sellerNames = useMemo(
		() => [
			...new Set([
				...rare.slice(0, 40).map((item) => item.name),
				...fresh.slice(0, 40).map((item) => item.name),
			]),
		],
		[rare, fresh],
	);
	const sellers = useMemo(
		() =>
			data && userLocation && sellerNames.length
				? nearestSellers(data, sellerNames, userLocation)
				: null,
		[data, userLocation, sellerNames],
	);

	const areaPoints = useMemo<MapPoint[]>(
		() =>
			areas.map((stat, position) => ({
				ref: -(position + 1),
				name: stat.area,
				lat: stat.lat,
				lng: stat.lng,
				price: stat.median,
				currency: displayCurrency,
				label: `${stat.count} pubs`,
				line1: null,
				town: null,
				postcode: null,
				facilities: [],
				phone: null,
				spot: "high-street" as const,
				isClosed: false,
				isOpenNow: false,
				hoursToday: null,
			})),
		[areas, displayCurrency],
	);
	const mapData = view === "area" ? areaPoints : withDistance;
	const mapScale = useMemo(
		() => makeScale(mapData.map((point) => point.price)),
		[mapData],
	);

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

	const defaultBasket = fallbackName ? [{ name: fallbackName, qty: 1 }] : [];
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

	const dark = colorScheme === "dark";

	return (
		<Box
			style={{
				display: "flex",
				flexDirection: "column",
				height: isMobile ? "auto" : "100vh",
				minHeight: "100vh",
			}}
		>
			<Group
				justify="space-between"
				align="center"
				px="md"
				py="xs"
				wrap="nowrap"
				style={{
					borderBottom: "1px solid var(--mantine-color-default-border)",
				}}
			>
				<Group gap="xs" align="center" wrap="nowrap">
					<Beer size={26} />
					<Box>
						<Title order={3} lh={1}>
							Spooners
						</Title>
						<Text size="xs" c="dimmed" lineClamp={1}>
							Pub prices on a map — build a round, see what every pub charges
						</Text>
					</Box>
				</Group>
				<Group gap="xs" wrap="nowrap">
					{converting ? (
						<Badge variant="light" color="blue" size="lg">
							converted → {displayCurrency}
						</Badge>
					) : null}
					<Badge variant="light" size="lg" visibleFrom="md">
						{stats.venuesWithData} pubs · {index.length} items
					</Badge>
					<Tooltip label={copied ? "Link copied" : "Copy a link to this view"}>
						<Button
							size="xs"
							variant={copied ? "filled" : "default"}
							color={copied ? "teal" : undefined}
							leftSection={<Copy size={14} />}
							onClick={copyShare}
						>
							{copied ? "Copied" : "Share"}
						</Button>
					</Tooltip>
					<Tooltip label="Settings">
						<ActionIcon
							variant="default"
							size="lg"
							aria-label="Settings"
							onClick={() => setSettingsOpen(true)}
						>
							<Settings size={16} />
						</ActionIcon>
					</Tooltip>
					<Tooltip label={dark ? "Light mode" : "Dark mode"}>
						<ActionIcon
							variant="default"
							size="lg"
							aria-label="Toggle colour scheme"
							onClick={() => setColorScheme(dark ? "light" : "dark")}
						>
							{dark ? <Sun size={16} /> : <Moon size={16} />}
						</ActionIcon>
					</Tooltip>
				</Group>
			</Group>

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
						flexShrink: 0,
						overflowY: isMobile ? "visible" : "auto",
						borderRight: isMobile
							? undefined
							: "1px solid var(--mantine-color-default-border)",
						padding: 12,
					}}
				>
					<Stack gap="sm">
						<RoundCard
							items={visibleIndex}
							basket={resolvedBasket}
							onAdd={(name) =>
								updateBasket((current) => {
									const existing = current.find((item) => item.name === name);
									if (existing) {
										return current.map((item) =>
											item.name === name
												? { ...item, qty: item.qty + 1 }
												: item,
										);
									}
									return [...current, { name, qty: 1 }];
								})
							}
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
							onClear={() => setBasket([])}
							currencies={converting ? [] : currencies}
							currency={displayCurrency}
							onCurrency={(currency) => {
								setSelectedCurrency(currency);
								setFocused(null);
							}}
							filters={filters}
							activeFilters={activeFilters}
							onFilters={setActiveFilters}
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
							scale={scale}
							metric={itemMetric}
							trend={trend}
							converted={
								converting
									? { currency: displayCurrency, rateDate: rates?.date ?? null }
									: null
							}
						/>
						<StatsBar
							pubs={withDistance.length}
							cheapest={money(scale.min, displayCurrency)}
							median={money(medianPrice, displayCurrency)}
							dearest={money(scale.max, displayCurrency)}
							portion={singleName ? (completeVenues[0]?.portion ?? null) : null}
							premium={premium}
						/>
						<Distribution
							prices={prices}
							scale={scale}
							currency={displayCurrency}
							median={medianPrice}
							history={
								singleName ? data.history?.items?.[singleName] : undefined
							}
						/>
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
						<DiscoverPanel
							rare={rare}
							fresh={fresh}
							sellers={sellers}
							onSelect={(name) => {
								setBasket([{ name, qty: 1 }]);
								setView("pubs");
								setFocused(null);
							}}
						/>
						<MenuLessPanel venues={unpricedAll} onSelect={setVenueRef} />
					</Stack>
				</Box>

				<Box
					style={{
						flex: 1,
						minWidth: 0,
						height: isMobile ? "55vh" : "auto",
					}}
				>
					<MapPanel
						points={mapData}
						unpriced={view === "pubs" ? unpricedPoints : undefined}
						scale={mapScale}
						currency={displayCurrency}
						focused={focused}
						onFocus={setFocused}
						view={view}
						onView={setView}
						countLabel={
							view === "area"
								? `${areaPoints.length} areas`
								: `${mapData.length} pubs`
						}
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
				onSelectItem={(name) => {
					setBasket([{ name, qty: 1 }]);
					setView("pubs");
				}}
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
