import { Box, Card, Group, Text, Tooltip } from "@mantine/core";
import { useMemo } from "react";
import { money, type PriceScale, priceColor } from "../price";
import type { HistoryPoint } from "../types";
import { Sparkline } from "./Sparkline";

type Bin = { start: number; end: number; count: number };

const buildHistogram = (prices: number[]): Bin[] => {
	if (!prices.length) {
		return [];
	}
	const min = Math.floor(Math.min(...prices) * 2) / 2;
	const max = Math.ceil(Math.max(...prices) * 2) / 2;
	const span = Math.max(max - min, 0.5);
	const step = Math.max(0.25, Math.round((span / 10) * 4) / 4);
	const bins: Bin[] = [];
	for (let start = min; start < max - 1e-9; start += step) {
		bins.push({ start, end: start + step, count: 0 });
	}
	for (const price of prices) {
		const index = Math.min(
			bins.length - 1,
			Math.max(0, Math.floor((price - min) / step)),
		);
		const bin = bins[index];
		if (bin) {
			bin.count += 1;
		}
	}
	return bins;
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
	const medianPosition =
		medianPrice != null && scale.max > scale.min
			? ((medianPrice - scale.min) / (scale.max - scale.min)) * 100
			: null;
	const historyPoints = history?.map((point) => point.median) ?? [];
	const trend =
		historyPoints.length >= 2
			? ((historyPoints[historyPoints.length - 1] ?? 0) -
					(historyPoints[0] ?? 0)) /
				(historyPoints[0] || 1)
			: null;

	return (
		<Card withBorder padding="sm" radius="md">
			<Group justify="space-between" mb={6}>
				<Text size="xs" c="dimmed" fw={700} tt="uppercase">
					Price distribution
				</Text>
				{medianPrice != null ? (
					<Text size="xs" c="dimmed">
						median {money(medianPrice, currency)}
					</Text>
				) : null}
			</Group>
			{bins.length && peak ? (
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
									label={`${money(bin.start, currency)}–${money(bin.end, currency)}: ${bin.count} ${
										bin.count === 1 ? "pub" : "pubs"
									}`}
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
					{medianPosition != null ? (
						<Box
							style={{
								position: "absolute",
								top: 0,
								bottom: 0,
								left: `${Math.min(100, Math.max(0, medianPosition))}%`,
								width: 2,
								background: "var(--mantine-color-text)",
								opacity: 0.7,
								borderRadius: 2,
								pointerEvents: "none",
							}}
						/>
					) : null}
				</Box>
			) : (
				<Text c="dimmed" size="sm">
					No prices to plot.
				</Text>
			)}
			{historyPoints.length >= 2 ? (
				<Group justify="space-between" mt={6} align="center">
					<Text size="xs" c="dimmed">
						median since {history?.[0]?.t}:{" "}
						<Text span fw={600} c={trend && trend > 0 ? "red" : "teal"}>
							{trend && trend > 0 ? "+" : "−"}
							{Math.abs(Math.round((trend ?? 0) * 100))}%
						</Text>
					</Text>
					<Sparkline points={historyPoints} width={140} height={24} />
				</Group>
			) : null}
		</Card>
	);
};
