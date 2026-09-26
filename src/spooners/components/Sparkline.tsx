import { Box } from "@mantine/core";

/** A tiny SVG sparkline - no chart library. */
export const Sparkline = ({
	points,
	width = 120,
	height = 28,
	color = "var(--mantine-color-teal-5)",
}: {
	points: number[];
	width?: number;
	height?: number;
	color?: string;
}) => {
	if (points.length < 2) {
		return null;
	}
	const min = Math.min(...points);
	const max = Math.max(...points);
	const span = max - min || 1;
	const step = width / (points.length - 1);
	const path = points
		.map((value, index) => {
			const x = index * step;
			const y = height - ((value - min) / span) * (height - 4) - 2;
			return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(" ");
	return (
		<Box component="svg" width={width} height={height} aria-hidden>
			<path d={path} fill="none" stroke={color} strokeWidth={1.5} />
		</Box>
	);
};
