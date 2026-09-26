import {
	Alert,
	Badge,
	Box,
	Button,
	Card,
	Chip,
	Grid,
	Group,
	Loader,
	SegmentedControl,
	Stack,
	Switch,
	Text,
	Title,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { ItemPicker } from "./components/ItemPicker";
import { PriceDistribution } from "./components/PriceDistribution";
import { PriceMap } from "./components/PriceMap";
import { PriceRanks } from "./components/PriceRanks";
import {
	availableFilters,
	buildItemIndex,
	cacheStats,
	commonPortion,
	haversineMiles,
	matchesFilters,
	portionsFor,
	pricedVenues,
} from "./derive";
import { makeScale, median, money, priceColor } from "./price";
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

const Stat = ({
	label,
	value,
	color,
}: {
	label: string;
	value: string;
	color?: string;
}) => (
	<Box>
		<Text size="xs" c="dimmed" tt="uppercase" fw={600}>
			{label}
		</Text>
		<Text fw={700} size="lg" c={color}>
			{value}
		</Text>
	</Box>
);

const Legend = ({
	scale,
	currency,
}: {
	scale: ReturnType<typeof makeScale>;
	currency: string;
}) => (
	<Box mt={6}>
		<Box
			style={{
				height: 8,
				borderRadius: 999,
				background: `linear-gradient(90deg, ${priceColor(scale.min, scale)}, ${priceColor(
					(scale.min + scale.max) / 2,
					scale,
				)}, ${priceColor(scale.max, scale)})`,
			}}
		/>
		<Group justify="space-between" mt={2}>
			<Text size="xs" c="dimmed">
				{money(scale.min, currency)}
			</Text>
			<Text size="xs" c="dimmed">
				{money(scale.max, currency)}
			</Text>
		</Group>
	</Box>
);

export const App = () => {
	const { data, error, loading } = useDataset();
	const [selectedName, setSelectedName] = useState<string | null>(null);
	const [selectedPortion, setSelectedPortion] = useState<string | null>(null);
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

	// portions any venue uses for this item, and the one currently priced
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

	const openCount = useMemo(
		() => priced.filter((venue) => venue.isOpenNow).length,
		[priced],
	);
	const venues = useMemo(
		() => (openNowOnly ? priced.filter((venue) => venue.isOpenNow) : priced),
		[priced, openNowOnly],
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
		() => makeScale(withDistance.map((v) => v.price)),
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
			<Group justify="center" py="xl">
				<Loader />
				<Text>Loading pub prices… (a few MB)</Text>
			</Group>
		);
	}

	if (error || !data) {
		return (
			<Alert color="red" title="Could not load the data" m="md">
				{error ?? "Unknown error"}
			</Alert>
		);
	}

	const prices = withDistance.map((v) => v.price);
	const currency = "GBP";
	const badges = selectedItem ? itemBadges(selectedItem) : [];

	return (
		<Stack gap="sm" p="md" h="100%">
			<Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
				<Box>
					<Title order={1} lh={1}>
						Spooners
					</Title>
					<Text c="dimmed" size="sm">
						Pub prices on a map — pick a drink or a dish and see what every pub
						charges
					</Text>
				</Box>
				<Badge variant="light" size="lg">
					{stats.venuesWithData} pubs · {index.length} items selling
					{stats.updatedAt ? ` · updated ${stats.updatedAt.slice(0, 10)}` : ""}
				</Badge>
			</Group>

			<Grid gap="sm" style={{ flex: 1 }}>
				<Grid.Col span={{ base: 12, lg: 8 }}>
					<Card
						withBorder
						padding={0}
						radius="md"
						style={{ overflow: "hidden" }}
					>
						<Box style={{ height: "min(72vh, 780px)" }}>
							<PriceMap
								venues={withDistance}
								scale={scale}
								currency={currency}
								focused={focused}
								onFocus={setFocused}
							/>
						</Box>
					</Card>
				</Grid.Col>

				<Grid.Col span={{ base: 12, lg: 4 }}>
					<Stack gap="sm">
						<Card withBorder padding="md" radius="md">
							<ItemPicker
								label="Item"
								items={visibleIndex}
								value={effectiveName}
								onChange={(name) => {
									setSelectedName(name);
									setSelectedPortion(null);
									setFocused(null);
								}}
							/>
							{selectedItem ? (
								<Box mt={8}>
									<Text size="sm" fw={500}>
										{selectedItem.category ?? "Item"}
										{selectedItem.calories
											? ` · ${selectedItem.calories} kcal`
											: ""}
									</Text>
									{selectedItem.description ? (
										<Text size="xs" c="dimmed">
											{selectedItem.description}
										</Text>
									) : null}
									{badges.length ? (
										<Group gap={4} mt={6}>
											{badges.map((badge) => (
												<Badge key={badge} size="xs" variant="light">
													{badge}
												</Badge>
											))}
										</Group>
									) : null}
								</Box>
							) : null}
							{portions.length > 1 ? (
								<Box mt="sm">
									<Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4}>
										Portion
									</Text>
									<SegmentedControl
										size="xs"
										fullWidth
										value={effectivePortion ?? undefined}
										data={portions.map((label) => ({ label, value: label }))}
										onChange={(value) => {
											setSelectedPortion(value);
											setFocused(null);
										}}
									/>
								</Box>
							) : null}
							{filters.length ? (
								<Box mt="sm">
									<Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4}>
										Filters
									</Text>
									<Chip.Group
										multiple
										value={activeFilters}
										onChange={setActiveFilters}
									>
										<Group gap={4}>
											{filters.map((filter) => (
												<Chip key={filter.id} size="xs" value={filter.id}>
													{filter.label} ({filter.count})
												</Chip>
											))}
										</Group>
									</Chip.Group>
								</Box>
							) : null}
							<Group justify="space-between" mt="sm" align="center">
								<Switch
									size="xs"
									checked={openNowOnly}
									onChange={(event) =>
										setOpenNowOnly(event.currentTarget.checked)
									}
									label={`Open now (${openCount})`}
								/>
								<Button
									size="xs"
									variant="light"
									loading={geoState === "loading"}
									onClick={requestLocation}
								>
									Near me
								</Button>
							</Group>
							{geoState === "error" ? (
								<Text size="xs" c="red" mt={4}>
									Location unavailable — check browser permissions.
								</Text>
							) : null}
							<Legend scale={scale} currency={currency} />
						</Card>

						<Card withBorder padding="md" radius="md">
							<Group justify="space-between" align="flex-start">
								<Stat label="Pubs" value={String(withDistance.length)} />
								<Stat
									label="Cheapest"
									value={money(scale.min, currency)}
									color="teal"
								/>
								<Stat label="Median" value={money(median(prices), currency)} />
								<Stat
									label="Dearest"
									value={money(scale.max, currency)}
									color="red"
								/>
							</Group>
							{effectivePortion ? (
								<Text size="xs" c="dimmed" mt={6}>
									prices per {effectivePortion.toLowerCase()}
								</Text>
							) : null}
						</Card>

						<PriceRanks
							venues={withDistance}
							scale={scale}
							currency={currency}
							focused={focused}
							onFocus={setFocused}
							nearby={nearby}
						/>
					</Stack>
				</Grid.Col>

				<Grid.Col span={12}>
					<PriceDistribution
						prices={prices}
						scale={scale}
						currency={currency}
					/>
				</Grid.Col>
			</Grid>
		</Stack>
	);
};
