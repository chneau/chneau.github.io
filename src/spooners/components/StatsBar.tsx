import { Group, Text, Tooltip } from "@mantine/core";
import type { CSSProperties } from "react";
import { type PriceScale, priceHue } from "../price";

type Props = {
	pubs: number;
	cheapest: string;
	median: string;
	dearest: string;
	scale: PriceScale;
	portion: string | null;
	premium?: string | null;
};

const Tile = ({
	label,
	value,
	hue,
	hint,
}: {
	label: string;
	value: string;
	hue?: number;
	hint?: string;
}) => {
	const tile = (
		<div>
			<Text size="xs" c="dimmed" tt="uppercase" fw={700} lh={1.2}>
				{label}
			</Text>
			<Text
				fw={700}
				size="lg"
				lh={1.2}
				className={hue == null ? undefined : "spooners-price-text"}
				style={
					hue == null
						? undefined
						: ({ "--spooners-price-hue": hue } as CSSProperties)
				}
			>
				{value}
			</Text>
		</div>
	);
	return hint ? (
		<Tooltip label={hint} withArrow>
			{tile}
		</Tooltip>
	) : (
		tile
	);
};

export const StatsBar = ({
	pubs,
	cheapest,
	median,
	dearest,
	scale,
	portion,
	premium,
}: Props) => (
	<>
		<Group justify="space-between" align="flex-start" wrap="nowrap">
			<Tile
				label="Shown"
				value={String(pubs)}
				hint="Pubs that serve the round and pass your filters. Hidden pubs are excluded."
			/>
			<Tile
				label="Cheapest"
				value={cheapest}
				hue={priceHue(scale.min, scale)}
			/>
			<Tile
				label="Median"
				value={median}
				hint="The middle price — half the pubs are cheaper, half dearer."
			/>
			<Tile label="Dearest" value={dearest} hue={priceHue(scale.max, scale)} />
		</Group>
		{portion ? (
			<Text size="xs" c="dimmed" mt={6}>
				per {portion.toLowerCase()}
			</Text>
		) : null}
		{premium ? (
			<Text size="xs" c="dimmed" mt={2}>
				{premium}
			</Text>
		) : null}
	</>
);
