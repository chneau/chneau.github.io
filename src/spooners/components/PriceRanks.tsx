import {
	Box,
	Card,
	Progress,
	Stack,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { miles, money, normalize, type PriceScale, priceColor } from "../price";
import type { PricedVenue } from "../types";

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
	scale,
	currency,
	active,
	onFocus,
}: {
	venue: PricedVenue;
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
			padding: "5px 8px",
			borderRadius: 6,
			background: active ? "var(--mantine-color-default-hover)" : undefined,
		}}
	>
		<Box
			style={{
				display: "flex",
				justifyContent: "space-between",
				gap: 12,
				alignItems: "baseline",
			}}
		>
			<Text size="sm" lineClamp={1}>
				{venue.isOpenNow ? "" : "🔴 "}
				{venue.name}
			</Text>
			<Text
				size="sm"
				fw={600}
				style={{ color: priceColor(venue.price, scale) }}
			>
				{money(venue.price, currency)}
			</Text>
		</Box>
		<Box style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
			<Text size="xs" c="dimmed" lineClamp={1}>
				{[venue.town, venue.postcode].filter(Boolean).join(", ")}
			</Text>
			{venue.distance != null ? (
				<Text size="xs" c="dimmed">
					{miles(venue.distance)}
				</Text>
			) : null}
		</Box>
		<Progress
			value={Math.max(4, normalize(venue.price, scale) * 100)}
			color={priceColor(venue.price, scale)}
			size="xs"
			mt={4}
			radius="xl"
		/>
	</UnstyledButton>
);

/** Cheapest and dearest pubs for the selected item, cheapest -> dearest. */
export const PriceRanks = ({
	venues,
	scale,
	currency,
	focused,
	onFocus,
	nearby,
	count = 8,
}: Props) => {
	const sorted = [...venues].sort((a, b) => a.price - b.price);
	const cheapest = sorted.slice(0, count);
	const dearest = sorted.slice(-count).reverse();

	const list = (title: string, rows: PricedVenue[], accent: string) => (
		<Card withBorder padding="md" radius="md">
			<Text fw={600} c={accent} mb={6}>
				{title}
			</Text>
			<Stack gap={2}>
				{rows.map((venue) => (
					<Row
						key={venue.ref}
						venue={venue}
						scale={scale}
						currency={currency}
						active={focused?.ref === venue.ref}
						onFocus={onFocus}
					/>
				))}
			</Stack>
		</Card>
	);

	return (
		<Stack gap="sm">
			{nearby?.length
				? list("Nearest to you", nearby.slice(0, count), "blue")
				: null}
			{list("Cheapest", cheapest, "teal")}
			{list("Most expensive", dearest, "red")}
		</Stack>
	);
};
