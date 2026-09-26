import { Card, Group, Text } from "@mantine/core";

type Props = {
	pubs: number;
	cheapest: string;
	median: string;
	dearest: string;
	portion: string | null;
};

const Tile = ({
	label,
	value,
	color,
}: {
	label: string;
	value: string;
	color?: string;
}) => (
	<div>
		<Text size="xs" c="dimmed" tt="uppercase" fw={700} lh={1.2}>
			{label}
		</Text>
		<Text fw={700} size="lg" c={color} lh={1.2}>
			{value}
		</Text>
	</div>
);

export const StatsBar = ({
	pubs,
	cheapest,
	median,
	dearest,
	portion,
}: Props) => (
	<Card withBorder padding="sm" radius="md">
		<Group justify="space-between" align="flex-start" wrap="nowrap">
			<Tile label="Pubs" value={String(pubs)} />
			<Tile label="Cheapest" value={cheapest} color="teal" />
			<Tile label="Median" value={median} />
			<Tile label="Dearest" value={dearest} color="red" />
		</Group>
		{portion ? (
			<Text size="xs" c="dimmed" mt={6}>
				per {portion.toLowerCase()}
			</Text>
		) : null}
	</Card>
);
