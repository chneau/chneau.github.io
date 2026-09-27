import type { CSSProperties } from "react";

/** A shimmering placeholder block. */
export const Skeleton = ({
	width,
	height = 12,
	radius,
	style,
}: {
	width?: number | string;
	height?: number | string;
	radius?: number | string;
	style?: CSSProperties;
}) => (
	<span
		className="app-skeleton"
		aria-hidden="true"
		style={{ width, height, borderRadius: radius, ...style }}
	/>
);
