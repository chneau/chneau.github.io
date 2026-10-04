import { Box, Button, Card, Group, Text } from "@mantine/core";
import { Sparkles } from "lucide-react";

/**
 * The "no save to hand?" card on the landing screen.
 *
 * Split out of `SaveWorkbench` so the parent's landing branch is the layout and
 * nothing else: the card owns its own copy and the one button that loads the
 * bundled sample through the workbench's own `open` path, so the sample is read
 * exactly as a picked file would be.
 */
export const SampleLoaderCard = ({
	note,
	onLoad,
}: {
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
				leftSection={<Sparkles size={15} strokeWidth={2} />}
				onClick={onLoad}
			>
				Load sample
			</Button>
		</Group>
	</Card>
);
