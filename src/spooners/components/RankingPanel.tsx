import {
	Badge,
	Box,
	Card,
	Group,
	Progress,
	SegmentedControl,
	Stack,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { useState } from "react";
import { SPOT_META } from "../derive";
import {
	amount,
	currencySymbol,
	miles,
	normalize,
	type PriceScale,
	priceColor,
} from "../price";
import type { PricedVenue } from "../types";

type Mode = "cheapest" | "dearest" | "nearest";

type Props = {
	venues: PricedVenue[];
	scale: PriceScale;
	currency: string;
	focused: PricedVenue | null;
	onFocus: (venue: PricedVenue) => void;
	/** Nearest venues, only when the user shared their location. */
	nearby?: PricedVenue[];
	count?: number;
};

const Row = ({
	venue,
	rank,
	scale,
	currency,
	active,
	onFocus,
}: {
	venue: PricedVenue;
	rank: number;
	scale: PriceScale;
	currency: string;
	active: boolean;
	onFocus: (venue: PricedVenue) => void;
}) => (
	<UnstyledButton
		onClick={() => onFocus(venue)}
		style={{
			display: "block",
			width: "100%",
			padding: "6px 8px",
			borderRadius: 6,
			background: active ? "var(--mantine-color-default-hover)" : undefined,
		}}
	>
		<Group justify="space-between" gap={8} wrap="nowrap" align="baseline">
			<Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
				<Text size="xs" c="dimmed" w={16} ta="right">
					{rank}
				</Text>
				<Box style={{ minWidth: 0 }}>
					<Group gap={6} wrap="nowrap" align="center" style={{ minWidth: 0 }}>
						<Text size="sm" lineClamp={1}>
							{venue.isOpenNow ? "" : "🔴 "}
							{venue.name}
						</Text>
						{venue.spot !== "high-street" ? (
							<Badge size="xs" variant="light" color="grape">
								{SPOT_META[venue.spot].emoji} {SPOT_META[venue.spot].label}
							</Badge>
						) : null}
					</Group>
					<Text size="xs" c="dimmed" lineClamp={1}>
						{[venue.town, venue.postcode].filter(Boolean).join(", ")}
						{venue.distance != null ? ` · ${miles(venue.distance)}` : ""}
						{venue.canOrder ? "" : " · no ordering"}
					</Text>
				</Box>
			</Group>
			<Group gap={3} wrap="nowrap" align="baseline">
				<Text
					size="xs"
					fw={600}
					style={{ color: priceColor(venue.price, scale) }}
				>
					{currencySymbol(currency)}
				</Text>
				<Text
					size="sm"
					fw={700}
					style={{ color: priceColor(venue.price, scale) }}
				>
					{amount(venue.price, currency)}
				</Text>
			</Group>
		</Group>
		<Progress
			value={Math.max(3, normalize(venue.price, scale) * 100)}
			color={priceColor(venue.price, scale)}
			size={4}
			mt={4}
			radius="xl"
		/>
	</UnstyledButton>
);

/** Cheapest / dearest / nearest pubs for the selected item. */
export const RankingPanel = ({
	venues,
	scale,
	currency,
	focused,
	onFocus,
	nearby,
	count = 5,
}: Props) => {
	const [mode, setMode] = useState<Mode>("cheapest");

	const byPrice = [...venues].sort((a, b) => a.price - b.price);
	const lists: Record<Mode, PricedVenue[]> = {
		cheapest: byPrice.slice(0, count),
		dearest: byPrice.slice(-count).reverse(),
		nearest: (nearby ?? []).slice(0, count),
	};
	const rows = lists[mode];

	const options = nearby?.length
		? [
				{ label: "Cheapest", value: "cheapest" },
				{ label: "Dearest", value: "dearest" },
				{ label: "Nearest", value: "nearest" },
			]
		: [
				{ label: "Cheapest", value: "cheapest" },
				{ label: "Dearest", value: "dearest" },
			];

	return (
		<Card withBorder padding="sm" radius="md">
			<SegmentedControl
				size="xs"
				fullWidth
				value={mode}
				data={options}
				onChange={(value) => setMode(value as Mode)}
			/>
			<Text size="xs" c="dimmed" mt={6}>
				prices in {currencySymbol(currency)} {currency}
			</Text>
			<Stack gap={2} mt="xs">
				{rows.map((venue, index) => (
					<Row
						key={venue.ref}
						venue={venue}
						rank={index + 1}
						scale={scale}
						currency={currency}
						active={focused?.ref === venue.ref}
						onFocus={onFocus}
					/>
				))}
			</Stack>
		</Card>
	);
};
