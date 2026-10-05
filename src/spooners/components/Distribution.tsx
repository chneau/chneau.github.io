import { Box, Group, Text, Tooltip } from "@mantine/core";
import { useMemo } from "react";
import { EmptyState } from "../../shared";
import { medianTrend } from "../derive";
import { type Bin, buildHistogram, medianPosition } from "../histogram";
import { money, type PriceScale, priceColor } from "../price";
import type { HistoryPoint } from "../types";
import { Sparkline } from "./Sparkline";

type HistogramProps = {
	bins: Bin[];
	/** Tallest bar; every bar's height is a share of it. */
	peak: number;
	scale: PriceScale;
	currency: string;
	/** Left offset of the median rule, as a percentage, or `null` for none. */
	medianAt: number | null;
};

/** The bars themselves, with the median drawn over them. */
const Histogram = ({
	bins,
	peak,
	scale,
	currency,
	medianAt,
}: HistogramProps) => (
	<Box style={{ position: "relative" }}>
		<Box
			style={{
				display: "flex",
				gap: 2,
				alignItems: "flex-end",
				height: 96,
			}}
		>
			{bins.map((bin) => {
				const mid = (bin.start + bin.end) / 2;
				return (
					<Tooltip
						key={bin.start}
						label={`${money(bin.start, currency)}–${money(
							bin.end,
							currency,
						)}: ${bin.count} ${bin.count === 1 ? "pub" : "pubs"}`}
						withArrow
						position="top"
					>
						<Box
							style={{
								flex: 1,
								height: `${Math.max(2, (bin.count / peak) * 100)}%`,
								background: priceColor(mid, scale),
								borderRadius: "4px 4px 2px 2px",
								opacity: bin.count ? 1 : 0.25,
							}}
						/>
					</Tooltip>
				);
			})}
		</Box>
		{medianAt == null ? null : (
			<Box
				style={{
					position: "absolute",
					top: 0,
					bottom: 0,
					left: `${Math.min(100, Math.max(0, medianAt))}%`,
					width: 2,
					background: "var(--mantine-color-text)",
					opacity: 0.7,
					borderRadius: 2,
					pointerEvents: "none",
				}}
			/>
		)}
	</Box>
);

/**
 * The national median's own history, which answers a different question from
 * the histogram above: not "what do today's pubs charge" but "which way has the
 * typical price moved". Needs two snapshots before it can show a direction.
 */
const MedianHistory = ({
	history,
	points,
}: {
	history: HistoryPoint[];
	points: number[];
}) => {
	const trendPercent = medianTrend(history);
	const trend = trendPercent != null ? trendPercent / 100 : null;
	return (
		<Group justify="space-between" mt={6} align="center">
			<Text size="xs" c="dimmed">
				median since {history[0]?.t}:{" "}
				<Text span fw={600} c={trend && trend > 0 ? "red" : "teal"}>
					{trend && trend > 0 ? "+" : "−"}
					{Math.abs(Math.round((trend ?? 0) * 100))}%
				</Text>
			</Text>
			<Sparkline points={points} width={140} height={24} />
		</Group>
	);
};

/** How many pubs charge each price band - a plain histogram, no chart library. */
export const Distribution = ({
	prices,
	scale,
	currency,
	median: medianPrice,
	history,
}: {
	prices: number[];
	scale: PriceScale;
	currency: string;
	/** Marks the median on the histogram. */
	median?: number;
	/** National median snapshots, oldest first. */
	history?: HistoryPoint[];
}) => {
	const bins = useMemo(() => buildHistogram(prices), [prices]);
	const peak = bins.reduce((max, bin) => Math.max(max, bin.count), 0);
	const medianAt = medianPosition(medianPrice, scale);
	const historyPoints = history?.map((point) => point.median) ?? [];

	return (
		<>
			{medianPrice != null ? (
				<Text size="xs" c="dimmed" ta="right" mb={4}>
					median {money(medianPrice, currency)}
				</Text>
			) : null}
			{bins.length && peak ? (
				<Histogram
					bins={bins}
					peak={peak}
					scale={scale}
					currency={currency}
					medianAt={medianAt}
				/>
			) : (
				<EmptyState title="No prices to plot" />
			)}
			{history && historyPoints.length >= 2 ? (
				<MedianHistory history={history} points={historyPoints} />
			) : null}
		</>
	);
};
