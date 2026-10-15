import { Group, Pagination, Text } from "@mantine/core";
import type { ReactNode } from "react";

export const PanelPager = ({
	count,
	pages,
	current,
	onPageChange,
	ariaLabel,
	withEdges,
}: {
	count: ReactNode;
	pages: number;
	current: number;
	onPageChange: (page: number) => void;
	ariaLabel?: string;
	withEdges?: boolean;
}) => (
	<Group justify="space-between" gap="md" mt="sm">
		<Text size="xs" c="dimmed" aria-live="polite">
			{count}
		</Text>
		{pages > 1 && (
			<Pagination
				size="sm"
				total={pages}
				value={current + 1}
				onChange={(next) => onPageChange(next - 1)}
				aria-label={ariaLabel}
				withEdges={withEdges}
			/>
		)}
	</Group>
);
