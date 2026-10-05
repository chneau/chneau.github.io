import { Box, Group, Loader, Progress, Text } from "@mantine/core";

/**
 * The banner a rebuild shows above the panels, and the one place progress is
 * reported for work that outlives the panel that started it.
 *
 * It sits in the chrome rather than on the page so it stays visible while the
 * reader moves between sections during a download — a save rebuild can run for
 * minutes, and a progress bar that vanishes with the view that began it tells
 * the reader nothing for all but the first one.
 */
export const DownloadProgressBanner = ({
	message,
	completed,
	total,
	elapsed,
}: {
	message: string;
	completed: number;
	total: number;
	elapsed: number;
}) => (
	<Box
		px="md"
		py="md"
		role="status"
		aria-live="polite"
		aria-busy="true"
		style={{
			flexShrink: 0,
			borderBottom: "1px solid var(--mantine-primary-color-filled)",
			background: "var(--mantine-primary-color-light)",
		}}
	>
		<Group justify="space-between" gap="md" mb="xs">
			<Group gap="xs">
				<Loader size={16} />
				<Text size="sm">{message}…</Text>
			</Group>
			<Text size="sm">
				{completed} / {total} steps
			</Text>
		</Group>
		<Progress
			value={(completed / total) * 100}
			aria-label="Save preparation progress"
		/>
		<Text mt="xs" size="xs" c="dimmed">
			{elapsed}s elapsed. Large saves can take several minutes; keep this tab
			open.
		</Text>
	</Box>
);
