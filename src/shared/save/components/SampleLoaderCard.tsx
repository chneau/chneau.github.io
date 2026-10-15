import { Box, Button, Card, Group, Text } from "@mantine/core";
import { Sparkles } from "lucide-react";

export const SampleLoaderCard = ({
	loading = false,
	note,
	onLoad,
}: {
	loading?: boolean;
	note: string;
	onLoad: () => void;
}) => (
	<Card
		mt="md"
		padding="md"
		radius="md"
		style={{
			border: "1px solid var(--app-border)",
			background: "var(--app-surface)",
		}}
	>
		<Group justify="space-between" wrap="nowrap" align="center">
			<Box style={{ minWidth: 0 }}>
				<Text size="sm" fw={600}>
					No save to hand? Load the sample.
				</Text>
				<Text size="xs" c="dimmed">
					{note}
				</Text>
			</Box>
			<Button
				variant="light"
				loading={loading}
				disabled={loading}
				leftSection={<Sparkles size={15} strokeWidth={2} />}
				onClick={onLoad}
			>
				Load sample
			</Button>
		</Group>
	</Card>
);
