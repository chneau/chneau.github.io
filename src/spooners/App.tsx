import {
	ActionIcon,
	Alert,
	Badge,
	Box,
	Group,
	Loader,
	Stack,
	Text,
	Title,
	Tooltip,
	useMantineColorScheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Beer, Moon, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import { Distribution } from "./components/Distribution";
import { ItemSearchCard } from "./components/ItemSearchCard";
import { MapPanel } from "./components/MapPanel";
import { RankingPanel } from "./components/RankingPanel";
import { StatsBar } from "./components/StatsBar";
import {
	availableCurrencies,
	availableFilters,
	buildItemIndex,
	cacheStats,
	commonPortion,
	haversineMiles,
	matchesFilters,
	portionsFor,
	pricedVenues,
} from "./derive";
import { makeScale, median, money } from "./price";
import type { ItemInfo, PricedVenue } from "./types";
import { useDataset } from "./useDataset";

const DEFAULT_ITEM_HINT = "guinness";

/** Badge/flag keywords only - the rest are internal codes like "AL::gluten". */
const itemBadges = (item: ItemInfo): string[] => {
	const labels = item.keywords
		.filter((keyword) => keyword.isFlag || keyword.isBadge)
		.map((keyword) => keyword.label ?? keyword.name)
		.filter((label): label is string => Boolean(label));
	return [...new Set(labels)];
};

export const App = () => {
	const { data, error, loading } = useDataset();
	const { colorScheme, setColorScheme } = useMantineColorScheme();
	const isMobile = useMediaQuery("(max-width: 62em)");

	const [selectedName, setSelectedName] = useState<string | null>(null);
	const [selectedPortion, setSelectedPortion] = useState<string | null>(null);
	const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
	const [activeFilters, setActiveFilters] = useState<string[]>([]);
	const [openNowOnly, setOpenNowOnly] = useState(false);
	const [focused, setFocused] = useState<PricedVenue | null>(null);
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

	// portions + currencies available for the selected item
	const portions = useMemo(
		() => (data && effectiveName ? portionsFor(data, effectiveName) : []),
		[data, effectiveName],
	);
	const defaultPortion = useMemo(() => {
		if (!data || !effectiveName) {
			return null;
		}
		return (
			commonPortion(pricedVenues(data, effectiveName)) ?? portions[0] ?? null
		);
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
	const currencies = useMemo(() => availableCurrencies(priced), [priced]);
	const effectiveCurrency =
		selectedCurrency &&
		currencies.some((option) => option.code === selectedCurrency)
			? selectedCurrency
			: (currencies.find((option) => option.code === "GBP")?.code ??
				currencies[0]?.code ??
				"GBP");
	const pricedCurrency = useMemo(
		() => priced.filter((venue) => venue.currency === effectiveCurrency),
		[priced, effectiveCurrency],
	);

	const openCount = useMemo(
		() => pricedCurrency.filter((venue) => venue.isOpenNow).length,
		[pricedCurrency],
	);
	const venues = useMemo(
		() =>
			openNowOnly
				? pricedCurrency.filter((venue) => venue.isOpenNow)
				: pricedCurrency,
		[pricedCurrency, openNowOnly],
	);
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
					<Badge variant="light" size="lg">
						{stats.venuesWithData} pubs · {index.length} items
					</Badge>
					{stats.updatedAt ? (
						<Badge variant="default" size="lg" visibleFrom="sm">
							updated {stats.updatedAt.slice(0, 10)}
						</Badge>
					) : null}
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
							portions={portions}
							portion={effectivePortion}
							onPortion={(portion) => {
								setSelectedPortion(portion);
								setFocused(null);
							}}
							currencies={currencies}
							currency={effectiveCurrency}
							onCurrency={(currency) => {
								setSelectedCurrency(currency);
								setFocused(null);
							}}
							filters={filters}
							activeFilters={activeFilters}
							onFilters={setActiveFilters}
							openNow={openNowOnly}
							onOpenNow={setOpenNowOnly}
							openCount={openCount}
							hasLocation={Boolean(userLocation)}
							geoState={geoState}
							onNearMe={requestLocation}
							scale={scale}
						/>
						<StatsBar
							pubs={withDistance.length}
							cheapest={money(scale.min, effectiveCurrency)}
							median={money(median(prices), effectiveCurrency)}
							dearest={money(scale.max, effectiveCurrency)}
							portion={effectivePortion}
						/>
						<Distribution
							prices={prices}
							scale={scale}
							currency={effectiveCurrency}
						/>
						<RankingPanel
							venues={withDistance}
							scale={scale}
							currency={effectiveCurrency}
							focused={focused}
							onFocus={setFocused}
							nearby={nearby}
						/>
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
						venues={withDistance}
						scale={scale}
						currency={effectiveCurrency}
						focused={focused}
						onFocus={setFocused}
					/>
				</Box>
			</Box>
		</Box>
	);
};
