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
import { ItemSearchCard } from "./components/ItemSearchCard";
import { MapPanel, type MapView } from "./components/MapPanel";
import { MenuLessPanel } from "./components/MenuLessPanel";
import { RankingPanel } from "./components/RankingPanel";
import { RoundPanel } from "./components/RoundPanel";
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
	commonPortion,
	haversineMiles,
	isCaptiveSpot,
	isTemporarilyClosed,
	itemTrend,
	matchesFacilities,
	matchesFilters,
	nearestSellers,
	newItems,
	portionsFor,
	pricedVenues,
	rareItems,
	specialPremium,
	venuesWithoutPrices,
} from "./derive";
import { metricText } from "./portions";
import { makeScale, median, money } from "./price";
import { canConvertTo, convert, currencyChoices, useRates } from "./rates";
import { useSettings } from "./settings";
import type { ItemInfo, MapPoint, PricedVenue } from "./types";
import { readUrl, shareUrl, writeUrl } from "./url";
import { useDataset } from "./useDataset";

const DEFAULT_ITEM_HINT = "guinness";
const RATE_SOURCE = "European Central Bank, via frankfurter.dev";

/** Badge/flag keywords only - the rest are internal codes like "AL::gluten". */
const itemBadges = (item: ItemInfo): string[] => {
	const labels = item.keywords
		.filter((keyword) => keyword.isFlag || keyword.isBadge)
		.map((keyword) => keyword.label ?? keyword.name)
		.filter((label): label is string => Boolean(label));
	return [...new Set(labels)];
};

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

	const [selectedName, setSelectedName] = useState<string | null>(
		url.item ?? null,
	);
	const [selectedPortion, setSelectedPortion] = useState<string | null>(
		url.portion ?? null,
	);
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
	const [basket, setBasket] = useState<BasketItem[]>(() =>
		parseBasket(url.round ?? null),
	);
	const [venueRef, setVenueRef] = useState<number | null>(url.venue ?? null);
	const [view, setView] = useState<MapView>(
		url.view === "round" || url.view === "area" ? url.view : "item",
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

	// keep the selection valid as filters change
	const effectiveName = useMemo(() => {
		if (
			selectedName &&
			visibleIndex.some((item) => item.name === selectedName)
		) {
			return selectedName;
		}
		return (
			visibleIndex.find((item) =>
				item.name.toLowerCase().includes(DEFAULT_ITEM_HINT),
			)?.name ??
			visibleIndex[0]?.name ??
			null
		);
	}, [visibleIndex, selectedName]);

	const selectedItem = useMemo(
		() => index.find((item) => item.name === effectiveName) ?? null,
		[index, effectiveName],
	);
	const badges = selectedItem ? itemBadges(selectedItem) : [];
	const trend = useMemo(
		() => (data && effectiveName ? itemTrend(data, effectiveName) : null),
		[data, effectiveName],
	);

	// portions + currencies available for the selected item
	const portions = useMemo(
		() => (data && effectiveName ? portionsFor(data, effectiveName) : []),
		[data, effectiveName],
	);
	const defaultPortion = useMemo(() => {
		if (!data || !effectiveName) {
			return null;
		}
		return commonPortion(data, effectiveName) ?? portions[0] ?? null;
	}, [data, effectiveName, portions]);
	const effectivePortion =
		selectedPortion && portions.includes(selectedPortion)
			? selectedPortion
			: defaultPortion;

	const priced = useMemo(
		() =>
			data && effectiveName
				? pricedVenues(data, effectiveName, effectivePortion)
				: [],
		[data, effectiveName, effectivePortion],
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
	const displayVenues = useMemo(
		() =>
			converting && convertTo
				? priced.map((venue) => ({
						...venue,
						price: convert(venue.price, venue.currency, convertTo, rates),
						currency: convertTo,
					}))
				: nativeVenues,
		[converting, convertTo, priced, nativeVenues, rates],
	);
	const displayCurrency =
		converting && convertTo ? convertTo : effectiveCurrency;

	const itemMetric = useMemo(() => {
		const venue = displayVenues.find(
			(candidate) => candidate.metricKind && candidate.metricValue != null,
		);
		if (!venue?.metricKind || venue.metricValue == null) {
			return null;
		}
		return metricText(
			{ kind: venue.metricKind, value: venue.metricValue },
			displayCurrency,
		);
	}, [displayVenues, displayCurrency]);

	const openCount = useMemo(
		() => displayVenues.filter((venue) => venue.isOpenNow).length,
		[displayVenues],
	);
	const specialCount = useMemo(
		() => displayVenues.filter((venue) => isCaptiveSpot(venue.spot)).length,
		[displayVenues],
	);
	const closedCount = useMemo(
		() =>
			displayVenues.filter(
				(venue) => venue.isClosed || isTemporarilyClosed(venue.status),
			).length,
		[displayVenues],
	);
	const facilityOptions = useMemo(
		() => availableFacilities(displayVenues),
		[displayVenues],
	);

	const venues = useMemo(() => {
		let list = displayVenues;
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
	}, [displayVenues, openNowOnly, hideSpecial, hideClosed, activeFacilities]);

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
		const insight = specialPremium(displayVenues);
		if (!insight) {
			return null;
		}
		const sign = insight.premiumPercent >= 0 ? "+" : "−";
		const where = displayVenues.some((venue) => venue.spot === "airport")
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
	}, [displayVenues, displayCurrency]);

	const areas = useMemo(() => areaStats(withDistance), [withDistance]);

	// pubs whose menu is not published at all - still worth showing
	const unpriced = useMemo(() => {
		if (!data) {
			return [];
		}
		let list = venuesWithoutPrices(data);
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
		return userLocation
			? list.map((venue) => ({
					...venue,
					distance: haversineMiles(userLocation, {
						lat: venue.lat,
						lng: venue.lng,
					}),
				}))
			: list;
	}, [
		data,
		openNowOnly,
		hideSpecial,
		hideClosed,
		activeFacilities,
		userLocation,
	]);
	const unpricedPoints = useMemo<MapPoint[]>(
		() =>
			unpriced.map((venue) => ({
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
		[unpriced],
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

	// round calculator (converted + filtered the same way as the item list)
	const basketRaw = useMemo(
		() => (data && basket.length ? basketVenues(data, basket) : []),
		[data, basket],
	);
	const basketConverted = useMemo(() => {
		let list = basketRaw;
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
		if (converting && convertTo) {
			return list.map((venue) => ({
				...venue,
				total: convert(venue.total, venue.currency, convertTo, rates),
				lines: venue.lines.map((line) => ({
					...line,
					price: convert(line.price, venue.currency, convertTo, rates),
				})),
				currency: convertTo,
			}));
		}
		return list;
	}, [
		basketRaw,
		openNowOnly,
		hideSpecial,
		hideClosed,
		activeFacilities,
		converting,
		convertTo,
		rates,
	]);

	const roundUnits = basket.reduce((sum, item) => sum + item.qty, 0);
	const roundPoints = useMemo<MapPoint[]>(
		() =>
			basketConverted.map((venue) => ({
				...venue,
				price: venue.total,
				label: `${roundUnits} ${roundUnits === 1 ? "item" : "items"}`,
			})),
		[basketConverted, roundUnits],
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

	const mapData =
		view === "round"
			? roundPoints
			: view === "area"
				? areaPoints
				: withDistance;
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
		setSettings(next);
	};

	const setBasketQty = (name: string, qty: number) => {
		setBasket((current) => {
			const next = current
				.map((item) => (item.name === name ? { ...item, qty } : item))
				.filter((item) => item.qty > 0);
			return next.length ? next : [];
		});
	};

	// keep the URL in sync with everything that changes the view
	useEffect(() => {
		writeUrl({
			item: effectiveName ?? undefined,
			portion: effectivePortion ?? undefined,
			cur: selectedCurrency ?? undefined,
			filters: activeFilters,
			facilities: activeFacilities,
			open: openNowOnly || undefined,
			special: hideSpecial || undefined,
			closed: hideClosed || undefined,
			round: basket.length ? serializeBasket(basket) : undefined,
			venue: venueRef ?? undefined,
			view,
			lat: mapView?.center[0],
			lng: mapView?.center[1],
			z: mapView?.zoom,
		});
	}, [
		effectiveName,
		effectivePortion,
		selectedCurrency,
		activeFilters,
		activeFacilities,
		openNowOnly,
		hideSpecial,
		hideClosed,
		basket,
		venueRef,
		view,
		mapView,
	]);

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

	const focusRef = (ref: number) => {
		const match = mapData.find((point) => point.ref === ref);
		if (match) {
			setFocused(match);
		}
	};

	const copyShare = async () => {
		const link = shareUrl({
			item: effectiveName ?? undefined,
			portion: effectivePortion ?? undefined,
			cur: selectedCurrency ?? undefined,
			filters: activeFilters,
			facilities: activeFacilities,
			open: openNowOnly || undefined,
			special: hideSpecial || undefined,
			closed: hideClosed || undefined,
			round: basket.length ? serializeBasket(basket) : undefined,
			venue: venueRef ?? undefined,
			view,
		});
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
							Pub prices on a map — search a drink or a dish, see what every pub
							charges
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
					{stats.updatedAt ? (
						<Badge variant="default" size="lg" visibleFrom="lg">
							updated {stats.updatedAt.slice(0, 10)}
						</Badge>
					) : null}
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
						<ItemSearchCard
							items={visibleIndex}
							value={effectiveName}
							onSelect={(name) => {
								setSelectedName(name);
								setSelectedPortion(null);
								setFocused(null);
							}}
							item={selectedItem}
							badges={badges}
							trend={trend}
							metric={itemMetric}
							portions={portions}
							portion={effectivePortion}
							onPortion={(portion) => {
								setSelectedPortion(portion);
								setFocused(null);
							}}
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
							hasLocation={Boolean(userLocation)}
							geoState={geoState}
							onNearMe={requestLocation}
							scale={scale}
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
							portion={effectivePortion}
							premium={premium}
						/>
						<Distribution
							prices={prices}
							scale={scale}
							currency={displayCurrency}
							median={medianPrice}
							history={data.history?.items?.[effectiveName ?? ""]}
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
						<RoundPanel
							items={visibleIndex}
							basket={basket}
							venues={basketConverted}
							currency={displayCurrency}
							focused={focused?.ref ?? null}
							onAdd={(name) =>
								setBasket((current) => {
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
							onQty={setBasketQty}
							onRemove={(name) =>
								setBasket((current) =>
									current.filter((item) => item.name !== name),
								)
							}
							onClear={() => setBasket([])}
							onSelect={(venue) => {
								setView("round");
								focusRef(venue.ref);
							}}
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
								setSelectedName(name);
								setSelectedPortion(null);
								setView("item");
								setFocused(null);
							}}
						/>
						<MenuLessPanel venues={unpriced} onSelect={setVenueRef} />
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
						unpriced={view === "item" ? unpricedPoints : undefined}
						scale={mapScale}
						currency={displayCurrency}
						focused={focused}
						onFocus={setFocused}
						view={view}
						onView={setView}
						countLabel={
							view === "area"
								? `${areaPoints.length} areas`
								: view === "round"
									? `${roundPoints.length} pubs`
									: undefined
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
					setSelectedName(name);
					setSelectedPortion(null);
					setView("item");
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
