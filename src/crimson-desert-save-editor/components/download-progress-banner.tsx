import { Box, Group, Loader, Progress, Text } from "@mantine/core";

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
