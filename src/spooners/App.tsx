import {
	Alert,
	Badge,
	Box,
	Card,
	Grid,
	Group,
	Loader,
	Select,
	Stack,
	Text,
	Title,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { PriceDistribution } from "./components/PriceDistribution";
import { PriceMap } from "./components/PriceMap";
import { PriceRanks } from "./components/PriceRanks";
import { makeScale, median, money, priceColor } from "./price";
import type { PricedVenue, SpoonersDataset, SpoonersItem } from "./types";
import { useDataset } from "./useDataset";

const DEFAULT_ITEM_HINT = "guinness";

const pickDefaultItemId = (dataset: SpoonersDataset): string | null => {
	const byName = dataset.items.find((item) =>
		item.name.toLowerCase().includes(DEFAULT_ITEM_HINT),
	);
	if (byName) {
		return String(byName.id);
	}
	const mostAvailable = Object.keys(dataset.itemAvailability)[0];
	const match = dataset.items.find((item) => item.name === mostAvailable);
	return match
		? String(match.id)
		: dataset.items[0]
			? String(dataset.items[0].id)
			: null;
};

const groupedOptions = (dataset: SpoonersDataset) => {
	const groups = new Map<string, SpoonersItem[]>();
	for (const item of dataset.items) {
		const key = item.menu ?? "Other";
		const list = groups.get(key);
		if (list) {
			list.push(item);
		} else {
			groups.set(key, [item]);
		}
	}
	return [...groups.entries()].map(([group, items]) => ({
		group,
		items: items
			.sort(
				(a, b) =>
					(dataset.itemAvailability[b.name] ?? 0) -
					(dataset.itemAvailability[a.name] ?? 0),
			)
			.map((item) => {
				const availability = dataset.itemAvailability[item.name] ?? 0;
				const suffix = item.portion ? ` · ${item.portion}` : "";
				return {
					value: String(item.id),
					label: `${item.name}${suffix} (${availability})`,
				};
			}),
	}));
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
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [focused, setFocused] = useState<PricedVenue | null>(null);

	const effectiveId = selectedId ?? (data ? pickDefaultItemId(data) : null);

	const priced = useMemo(() => {
		if (!data || !effectiveId) {
			return [] as PricedVenue[];
		}
		const itemId = Number(effectiveId);
		const venues: PricedVenue[] = [];
		for (const venue of data.venues) {
			const pair = venue.prices.find(([id]) => id === itemId);
			if (!pair) {
				continue;
			}
			venues.push({
				ref: venue.ref,
				name: venue.name,
				lat: venue.lat,
				lng: venue.lng,
				town: venue.town,
				postcode: venue.postcode,
				isClosed: Boolean(venue.isClosed),
				price: pair[1],
			});
		}
		return venues;
	}, [data, effectiveId]);

	const scale = useMemo(() => makeScale(priced.map((v) => v.price)), [priced]);
	const options = useMemo(() => (data ? groupedOptions(data) : []), [data]);
	const selectedItem = useMemo(() => {
		if (!data || !effectiveId) {
			return null;
		}
		return data.items.find((item) => String(item.id) === effectiveId) ?? null;
	}, [data, effectiveId]);

	if (loading) {
		return (
			<Group justify="center" py="xl">
				<Loader />
				<Text>Loading pub prices…</Text>
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
	const currency = data.currency;

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
					{data.venueCount} pubs · {data.itemCount} items · updated{" "}
					{data.generatedAt.slice(0, 10)}
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
							<Select
								label="Item"
								placeholder="Search for a drink or a dish…"
								data={options}
								value={effectiveId}
								onChange={(value) => {
									setSelectedId(value);
									setFocused(null);
								}}
								searchable
								clearable={false}
								nothingFoundMessage="Nothing matched that search"
								leftSection={<span aria-hidden>🔎</span>}
							/>
							{selectedItem ? (
								<Text size="xs" c="dimmed" mt={6}>
									{selectedItem.name}
									{selectedItem.portion ? ` · ${selectedItem.portion}` : ""}
									{selectedItem.description
										? ` · ${selectedItem.description}`
										: ""}
								</Text>
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
