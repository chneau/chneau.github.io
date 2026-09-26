import {
	Box,
	Card,
	Progress,
	Stack,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { money, normalize, type PriceScale, priceColor } from "../price";
import type { PricedVenue } from "../types";

type Props = {
	venues: PricedVenue[];
	scale: PriceScale;
	currency: string;
	focused: PricedVenue | null;
	onFocus: (venue: PricedVenue) => void;
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
			{list("Cheapest", cheapest, "teal")}
			{list("Most expensive", dearest, "red")}
		</Stack>
	);
};
