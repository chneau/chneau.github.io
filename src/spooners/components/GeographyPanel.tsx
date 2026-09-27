import { Box, Group, Progress, Text, UnstyledButton } from "@mantine/core";
import { MapPin } from "lucide-react";
import type { AreaStat } from "../derive";
import { amount, currencySymbol, money, priceColor } from "../price";

type Props = {
	stats: AreaStat[];
	currency: string;
	selected: string | null;
	onSelect: (stat: AreaStat) => void;
	/** Minimum pubs per area, shown in the caption. */
	min?: number;
};

/** Price league table by county (or town when there is no county). */
export const GeographyPanel = ({
	stats,
	currency,
	selected,
	onSelect,
	min = 5,
}: Props) => {
	if (stats.length < 2) {
		return null;
	}
	const minPrice = stats[0]?.median ?? 0;
	const maxPrice = stats[stats.length - 1]?.median ?? 1;
	const span = maxPrice - minPrice || 1;
	const scale = { min: minPrice, max: maxPrice };

	return (
		<>
			<Text size="xs" c="dimmed" mb={6}>
				{stats.length} areas · {min}+ pubs each
			</Text>
			<Text size="xs" c="dimmed" mb={6}>
				Click an area to see its median on the map and read it here.
			</Text>
			<Box style={{ display: "flex", flexDirection: "column", gap: 2 }}>
				{stats.map((stat) => {
					const active = selected === stat.area;
					const position = (stat.median - minPrice) / span;
					return (
						<UnstyledButton
							key={stat.area}
							onClick={() => onSelect(stat)}
							style={{
								padding: "4px 6px",
								borderRadius: 6,
								background: active
									? "var(--mantine-color-default-hover)"
									: undefined,
							}}
						>
							<Group justify="space-between" gap={8} wrap="nowrap">
								<Text size="sm" lineClamp={1}>
									{active ? <MapPin size={12} /> : null}
									{active ? " " : ""}
									{stat.area}
								</Text>
								<Group gap={6} wrap="nowrap" align="baseline">
									<Text size="xs" c="dimmed">
										{stat.count} pubs
									</Text>
									<Text size="sm" fw={600}>
										{currencySymbol(currency)}
										{amount(stat.median, currency)}
									</Text>
								</Group>
							</Group>
							<Progress
								value={Math.max(4, position * 100)}
								color={priceColor(stat.median, scale)}
								size={4}
								mt={4}
								radius="xl"
							/>
						</UnstyledButton>
					);
				})}
			</Box>
			<Text size="xs" c="dimmed" mt={6}>
				Cheapest: {stats[0]?.area} at {money(minPrice, currency)} · dearest:{" "}
				{stats[stats.length - 1]?.area} at {money(maxPrice, currency)}
			</Text>
		</>
	);
};
