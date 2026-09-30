import {
	ActionIcon,
	Badge,
	Box,
	Group,
	Progress,
	SegmentedControl,
	Stack,
	Text,
	Tooltip,
	UnstyledButton,
} from "@mantine/core";
import { Ban, Info } from "lucide-react";
import { useState } from "react";
import { EmptyState, StatusDot } from "../../shared";
import { isTemporarilyClosed } from "../derive";
import { metricText, valueDirection } from "../portions";
import {
	amount,
	currencySymbol,
	miles,
	normalize,
	type PriceScale,
	priceColor,
} from "../price";
import type { PricedVenue, ValueKind } from "../types";
import { SpotLabel } from "./SpotLabel";
import { VenueImage } from "./VenueImage";

type Mode = "cheapest" | "dearest" | "nearest" | "value";

type Props = {
	venues: PricedVenue[];
	scale: PriceScale;
	currency: string;
	focused: Pick<PricedVenue, "ref"> | null;
	onFocus: (venue: PricedVenue) => void;
	onDetails: (venue: PricedVenue) => void;
	/** Nearest venues, only when the user shared their location. */
	nearby?: PricedVenue[];
	count?: number;
};

const changeText = (venue: PricedVenue): string | null => {
	if (venue.previousPrice == null || !venue.previousPrice) {
		return null;
	}
	const delta = venue.price - venue.previousPrice;
	if (Math.abs(delta) < 0.005) {
		return null;
	}
	const percent = (delta / venue.previousPrice) * 100;
	return `${delta > 0 ? "+" : "−"}${currencySymbol(venue.currency)}${amount(
		Math.abs(delta),
		venue.currency,
	)} (${delta > 0 ? "+" : "−"}${Math.abs(Math.round(percent))}%)`;
};

const Row = ({
	venue,
	rank,
	scale,
	currency,
	active,
	onFocus,
	onDetails,
	value,
}: {
	venue: PricedVenue;
	rank: number;
	scale: PriceScale;
	currency: string;
	active: boolean;
	onFocus: (venue: PricedVenue) => void;
	onDetails: (venue: PricedVenue) => void;
	value: boolean;
}) => {
	const change = changeText(venue);
	const temporarilyClosed = isTemporarilyClosed(venue.status);
	return (
		<Box style={{ position: "relative" }}>
			<UnstyledButton
				onClick={() => onFocus(venue)}
				style={{
					display: "block",
					width: "100%",
					cursor: "pointer",
					textAlign: "left",
					padding: "6px 30px 6px 8px",
					borderRadius: 6,
					background: active ? "var(--mantine-color-default-hover)" : undefined,
				}}
			>
				<Group justify="space-between" gap={8} wrap="nowrap" align="baseline">
					<Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
						<Text size="xs" c="dimmed" w={16} ta="right">
							{rank}
						</Text>
						<VenueImage
							src={venue.images[0]}
							alt={venue.name}
							width={32}
							height={32}
						/>
						<Box style={{ minWidth: 0 }}>
							<Group
								gap={6}
								wrap="nowrap"
								align="center"
								style={{ minWidth: 0 }}
							>
								<StatusDot
									on={venue.isOpenNow}
									label={venue.isOpenNow ? "Open now" : "Closed now"}
								/>
								<Text size="xs" fw={600} c={venue.isOpenNow ? "teal" : "red"}>
									{venue.isOpenNow ? "Open" : "Closed"}
								</Text>
								<Text size="sm" lineClamp={1}>
									{venue.name}
								</Text>
								{venue.spot !== "high-street" ? (
									<Badge size="xs" variant="light" color="grape">
										<SpotLabel spot={venue.spot} />
									</Badge>
								) : null}
								{temporarilyClosed ? (
									<Badge
										size="xs"
										variant="light"
										color="red"
										leftSection={<Ban size={11} />}
									>
										{venue.status?.replace("_", " ")}
									</Badge>
								) : null}
								{venue.missing.length ? (
									<Badge size="xs" variant="light" color="orange">
										partial
									</Badge>
								) : null}
							</Group>
							<Text size="xs" c="dimmed" lineClamp={1}>
								{[venue.town, venue.postcode].filter(Boolean).join(", ")}
								{venue.distance != null ? ` · ${miles(venue.distance)}` : ""}
								{venue.canOrder ? "" : " · no ordering"}
								{venue.missing.length
									? ` · missing ${venue.missing.join(", ")}`
									: ""}
								{venue.metricValue != null && venue.metricKind && !value
									? ` · ${metricText(
											{ kind: venue.metricKind, value: venue.metricValue },
											currency,
										)}`
									: ""}
								{change
									? ` · was ${currencySymbol(currency)}${amount(
											venue.previousPrice ?? 0,
											currency,
										)}, ${change}`
									: ""}
							</Text>
						</Box>
					</Group>
					<Group gap={4} wrap="nowrap" align="baseline">
						{value && venue.metricKind && venue.metricValue != null ? (
							<Text size="sm" fw={700}>
								{metricText(
									{ kind: venue.metricKind, value: venue.metricValue },
									currency,
								)}
							</Text>
						) : null}
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
			<Tooltip label="Pub details">
				<ActionIcon
					size="sm"
					variant="subtle"
					aria-label={`Details for ${venue.name}`}
					onClick={() => onDetails(venue)}
					style={{
						position: "absolute",
						top: "50%",
						right: 4,
						transform: "translateY(-50%)",
					}}
				>
					<Info size={13} />
				</ActionIcon>
			</Tooltip>
		</Box>
	);
};

/** Cheapest / dearest / nearest / best-value pubs for the selected item. */
export const RankingPanel = ({
	venues,
	scale,
	currency,
	focused,
	onFocus,
	onDetails,
	nearby,
	count = 5,
}: Props) => {
	const [mode, setMode] = useState<Mode>("cheapest");

	const byPrice = [...venues].sort((a, b) => a.price - b.price);
	const byValue = [...venues]
		.filter((venue) => venue.metricValue != null)
		.sort((a, b) => {
			// each row's own metric decides whether lower or higher is better
			const aDir = valueDirection(a.metricKind ?? "unit");
			const bDir = valueDirection(b.metricKind ?? "unit");
			return aDir * (a.metricValue ?? 0) - bDir * (b.metricValue ?? 0);
		});
	const lists: Record<Mode, PricedVenue[]> = {
		cheapest: byPrice.slice(0, count),
		dearest: byPrice.slice(-count).reverse(),
		nearest: (nearby ?? []).slice(0, count),
		value: byValue.slice(0, count),
	};
	const rows = lists[mode];

	const options = [
		{ label: "Cheapest", value: "cheapest" },
		{ label: "Dearest", value: "dearest" },
		...(nearby?.length ? [{ label: "Nearest", value: "nearest" }] : []),
		...(byValue.length ? [{ label: "Value", value: "value" }] : []),
	];

	// the "Value" list can mix £/unit, £/100 ml and kcal/£, which rank in
	// opposite directions, so describe the direction from the kinds present
	const valueKinds = [
		...new Set(
			byValue
				.map((venue) => venue.metricKind)
				.filter((kind): kind is ValueKind => kind != null),
		),
	];
	const valueHint =
		valueKinds.length === 0
			? null
			: new Set(valueKinds.map(valueDirection)).size > 1
				? "Value = best ratio (lower per unit/100 ml, more kcal per £)"
				: valueDirection(valueKinds[0] ?? "unit") === 1
					? "Value = best ratio (lower is better)"
					: "Value = best ratio (higher is better)";

	return (
		<>
			<SegmentedControl
				size="xs"
				fullWidth
				value={mode}
				data={options}
				onChange={(value) => setMode(value as Mode)}
			/>
			<Text size="xs" c="dimmed" mt={6}>
				prices in {currencySymbol(currency)} {currency}
				{valueHint ? ` · ${valueHint}` : ""}
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
						onDetails={onDetails}
						value={mode === "value"}
					/>
				))}
				{rows.length ? null : (
					<EmptyState
						title="No venues with this metric"
						body="None of the pubs matching the filters publish the data this ranking needs."
					/>
				)}
			</Stack>
		</>
	);
};
