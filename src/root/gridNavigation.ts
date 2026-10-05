/**
 * Where an arrow key should move focus to, or `null` for a key this does not
 * handle.
 *
 * Split out from `AppGrid` because the interesting part is the arithmetic and
 * it is the part worth testing: `columns` is measured from the DOM rather than
 * assumed, and a grid laid out with `auto-fill` has no fixed column count at
 * any width.
 *
 * Its own module rather than a private helper in the component file because a
 * component module that also exports a plain function cannot be Fast-Refreshed
 * without losing the grid's state; the test imports it from here instead.
 *
 * `columns` is clamped to at least 1 so a zero-width or not-yet-laid-out grid
 * still moves by one instead of trapping focus.
 */
export const nextGridIndex = (
	index: number,
	total: number,
	columns: number,
	key: string,
): number | null => {
	if (total === 0) return null;
	const last = total - 1;
	const step = Math.max(1, Math.floor(columns));

	// Vertical movement is clamped to the grid rather than wrapped, so ArrowDown
	// on the last row stays put instead of jumping back to the top — which is
	// what treating the grid as one long list did.
	const down = Math.min(index + step, last);
	const up = Math.max(index - step, 0);

	switch (key) {
		case "ArrowRight":
			return index === last ? 0 : index + 1;
		case "ArrowLeft":
			return index === 0 ? last : index - 1;
		case "ArrowDown":
			return down;
		case "ArrowUp":
			return up;
		case "Home":
			return 0;
		case "End":
			return last;
		default:
			return null;
	}
};

/**
 * How many cards share the focused card's row.
 *
 * Read off `offsetTop` rather than computed from the item count, because
 * `.app-grid` is `repeat(auto-fill, minmax(280px, 1fr))`: the column count is a
 * function of the viewport, and it changes when the window does.
 *
 * Beside `nextGridIndex` rather than in the component, because it is the other
 * half of the same measurement — the DOM read the arithmetic is fed — and the
 * two only make sense read together.
 */
export const columnsInRow = (links: HTMLAnchorElement[]): number => {
	const first = links[0];
	if (!first) return 1;
	let count = 0;
	for (const link of links) {
		// A card whose top differs starts the next row.
		if (link.offsetTop !== first.offsetTop) break;
		count += 1;
	}
	return count || 1;
};
