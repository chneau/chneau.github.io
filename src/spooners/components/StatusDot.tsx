import { Box } from "@mantine/core";

/**
 * A breathing status light: green (and pulsing) when open, red when closed.
 * The pulse is pure CSS on transform/opacity, so it never re-renders React.
 */
export const StatusDot = ({ open }: { open: boolean }) => (
	<Box
		component="span"
		aria-hidden
		className="spooners-status-dot"
		style={{
			display: "inline-block",
			width: 7,
			height: 7,
			marginRight: 5,
			borderRadius: "50%",
			verticalAlign: "middle",
			background: open
				? "var(--mantine-color-teal-5)"
				: "var(--mantine-color-red-5)",
			animation: open
				? "spooners-breathe 2.4s ease-in-out infinite"
				: undefined,
		}}
	/>
);
