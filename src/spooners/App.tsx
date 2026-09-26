import {
	Alert,
	Badge,
	Box,
	Card,
	Grid,
	Group,
	Loader,
	SegmentedControl,
	Stack,
	Text,
	Title,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { ItemPicker } from "./components/ItemPicker";
import { PriceDistribution } from "./components/PriceDistribution";
import { PriceMap } from "./components/PriceMap";
import { PriceRanks } from "./components/PriceRanks";
import {
	buildItemIndex,
	cacheStats,
	commonPortion,
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
	const [focused, setFocused] = useState<PricedVenue | null>(null);

	const index = useMemo(() => (data ? buildItemIndex(data) : []), [data]);
	const stats = useMemo(
		() =>
			data
				? cacheStats(data)
				: { venues: 0, venuesWithData: 0, items: 0, updatedAt: null },
		[data],
	);
	const effectiveName =
		selectedName ??
		index.find((item) => item.name.toLowerCase().includes(DEFAULT_ITEM_HINT))
			?.name ??
		index[0]?.name ??
		null;

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
	const scale = useMemo(() => makeScale(priced.map((v) => v.price)), [priced]);

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

	const prices = priced.map((v) => v.price);
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
								venues={priced}
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
								items={index}
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
							<Legend scale={scale} currency={currency} />
						</Card>

						<Card withBorder padding="md" radius="md">
							<Group justify="space-between" align="flex-start">
								<Stat label="Pubs" value={String(priced.length)} />
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
						</Card>

						<PriceRanks
							venues={priced}
							scale={scale}
							currency={currency}
							focused={focused}
							onFocus={setFocused}
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
