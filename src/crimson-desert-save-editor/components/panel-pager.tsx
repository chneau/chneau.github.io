import { Group, Pagination, Text } from "@mantine/core";
import type { ReactNode } from "react";

/**
 * The row under a paged table: how many rows matched, and the pager.
 *
 * Four panels wrote this pair out, and one of them omitted the `aria-live` the
 * others had — so a screen reader heard nothing when a filter changed the count.
 * The announcement belongs to the count, so it lives here with it.
 */
export const PanelPager = ({
	count,
	pages,
	current,
	onPageChange,
	/** Names the pager for assistive tech; each panel's pages are different things. */
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
