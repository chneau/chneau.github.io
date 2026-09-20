import { Box } from "@mantine/core";
import { type ReactNode, useRef, useState } from "react";

type VirtualListProps<T> = {
	items: T[];
	/** Every row must render at exactly this height for the window to line up. */
	rowHeight: number;
	/** Height of the scroll viewport. */
	height: number;
	/** Rows kept mounted above and below the viewport while scrolling. */
	overscan?: number;
	getKey: (item: T, index: number) => string | number;
	renderRow: (item: T, index: number) => ReactNode;
	ariaLabel?: string;
};

const VirtualWindow = <T,>({
	items,
	rowHeight,
	height,
	overscan = 3,
	getKey,
	renderRow,
	ariaLabel,
}: VirtualListProps<T>) => {
	const viewport = useRef<HTMLDivElement>(null);
	const [scrollTop, setScrollTop] = useState(0);

	const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
	const count = Math.ceil(height / rowHeight) + overscan * 2;
	const rows = items.slice(first, Math.min(items.length, first + count));

	return (
		<Box
			ref={viewport}
			h={height}
			tabIndex={0}
			aria-label={ariaLabel}
			onScroll={(event) => {
				const next = event.currentTarget.scrollTop;
				// Only re-render when the window moves to another row.
				setScrollTop((current) =>
					Math.floor(current / rowHeight) === Math.floor(next / rowHeight)
						? current
						: next,
				);
			}}
			style={{ overflowY: "auto", overflowX: "hidden" }}
		>
			<Box style={{ height: items.length * rowHeight, position: "relative" }}>
				<Box
					style={{
						position: "absolute",
						top: first * rowHeight,
						left: 0,
						right: 0,
					}}
				>
					{rows.map((item, offset) => (
						<Box
							key={getKey(item, first + offset)}
							h={rowHeight}
							style={{ overflow: "hidden" }}
						>
							{renderRow(item, first + offset)}
						</Box>
					))}
				</Box>
			</Box>
		</Box>
	);
};

/**
 * Fixed-row-height windowed list: only the rows near the viewport are mounted,
 * over a spacer sized to the full list, so a list of thousands of rows costs
 * what a list of ten costs.
 *
 * Item pictures are sliced out of the picture archives on demand and each mount
 * creates a blob URL for its icon, which is why mounting 4,000 rows at once is
 * expensive — windowing keeps that to the rows on screen.
 *
 * A new list (another filter, another search) remounts the window. Resetting
 * `scrollTop` is not enough: when the content shrinks the browser clamps and
 * then restores the old offset, which would leave the window scrolled past the
 * shorter list.
 */
export const VirtualList = <T,>(props: VirtualListProps<T>) => {
	const [previous, setPrevious] = useState(props.items);
	const [generation, setGeneration] = useState(0);
	if (previous !== props.items) {
		setPrevious(props.items);
		setGeneration((current) => current + 1);
	}
	return <VirtualWindow key={generation} {...props} />;
};
