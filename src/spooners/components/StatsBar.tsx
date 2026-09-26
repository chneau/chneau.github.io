import { Group, Text, Tooltip } from "@mantine/core";

type Props = {
	pubs: number;
	cheapest: string;
	median: string;
	dearest: string;
	portion: string | null;
	/** Insight about special venues, when there are some. */
	premium?: string | null;
};

const Tile = ({
	label,
	value,
	color,
	hint,
}: {
	label: string;
	value: string;
	color?: string;
	hint?: string;
}) => {
	const tile = (
		<div>
			<Text size="xs" c="dimmed" tt="uppercase" fw={700} lh={1.2}>
				{label}
			</Text>
			<Text fw={700} size="lg" c={color} lh={1.2}>
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
			<Tile label="Cheapest" value={cheapest} color="teal" />
			<Tile
				label="Median"
				value={median}
				hint="The middle price — half the pubs are cheaper, half dearer."
			/>
			<Tile label="Dearest" value={dearest} color="red" />
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
