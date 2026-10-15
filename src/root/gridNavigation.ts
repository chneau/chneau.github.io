export const nextGridIndex = (
	index: number,
	total: number,
	columns: number,
	key: string,
): number | null => {
	if (total === 0) return null;
	const last = total - 1;
	const step = Math.max(1, Math.floor(columns));

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

export const columnsInRow = (links: HTMLAnchorElement[]): number => {
	const first = links[0];
	if (!first) return 1;
	let count = 0;
	for (const link of links) {
		if (link.offsetTop !== first.offsetTop) break;
		count += 1;
	}
	return count || 1;
};
