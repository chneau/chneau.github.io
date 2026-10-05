import { Group, Text } from "@mantine/core";
import { LockKeyhole } from "lucide-react";
import type { ParseResult } from "@/lib/inventory";

/**
 * The strip under the panels, once a save is open.
 *
 * It answers two questions a reader has while editing: is my original file
 * still on disk untouched, and how much of it am I looking at. Neither changes
 * during editing, which is the point — it is a fixed reassurance, not a status.
 */
export const SaveFileFooter = ({ result }: { result: ParseResult }) => (
	<Group
		h={36}
		px="md"
		justify="space-between"
		wrap="nowrap"
		style={{
			flexShrink: 0,
			borderTop: "1px solid var(--app-border)",
		}}
	>
		<Group gap={6} wrap="nowrap">
			<LockKeyhole size={12} color="var(--app-text-muted)" strokeWidth={2} />
			<Text size="xs" c="dimmed">
				Original file untouched
			</Text>
		</Group>
		<Text size="xs" c="dimmed" ff="monospace">
			{result.records.length} records
		</Text>
	</Group>
);
