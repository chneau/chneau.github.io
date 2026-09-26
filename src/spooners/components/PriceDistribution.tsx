import { Box, Card, Text, Tooltip } from "@mantine/core";
import { useMemo } from "react";
import { money, type PriceScale, priceColor } from "../price";

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

/** How many pubs charge each price band — a plain histogram, no chart library. */
export const PriceDistribution = ({
	prices,
	scale,
	currency,
}: {
	prices: number[];
	scale: PriceScale;
	currency: string;
}) => {
	const bins = useMemo(() => buildHistogram(prices), [prices]);
	const peak = bins.reduce((max, bin) => Math.max(max, bin.count), 0);

	return (
		<Card withBorder padding="md" radius="md">
			<Text fw={600}>Price distribution</Text>
			<Text size="xs" c="dimmed" mb="md">
				How many pubs charge each amount for the selected item
			</Text>
			{bins.length && peak ? (
				<Box
					style={{
						display: "flex",
						gap: 3,
						alignItems: "flex-end",
						height: 150,
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
										display: "flex",
										flexDirection: "column",
										justifyContent: "flex-end",
										height: "100%",
										cursor: "default",
									}}
								>
									<Text size="xs" c="dimmed" ta="center" mb={2}>
										{bin.count || ""}
									</Text>
									<Box
										style={{
											height: `${Math.max(2, (bin.count / peak) * 100)}%`,
											background: priceColor(mid, scale),
											borderRadius: "4px 4px 2px 2px",
											opacity: bin.count ? 1 : 0.25,
										}}
									/>
								</Box>
							</Tooltip>
						);
					})}
				</Box>
			) : (
				<Text c="dimmed">No prices to plot.</Text>
			)}
			{bins.length ? (
				<Box
					style={{
						display: "flex",
						gap: 3,
						marginTop: 6,
					}}
				>
					{bins.map((bin, index) => (
						<Text
							key={bin.start}
							size="xs"
							c="dimmed"
							ta="center"
							style={{
								flex: 1,
								visibility: index % 2 ? "hidden" : "visible",
							}}
						>
							{bin.start.toFixed(2)}
						</Text>
					))}
				</Box>
			) : null}
		</Card>
	);
};
