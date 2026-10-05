import { portionRank } from "./portions";
import type { ItemDefinition, SpoonersCache } from "./types";

/** One pub's block of the cache. `VenueEntry` is internal to the cache schema. */
type VenueEntry = SpoonersCache["venues"][string];

/**
 * One line of a pub's menu, flattened out of the cache's nested
 * `item -> portion -> price` shape and annotated with the item's own facts, so
 * sorting and rendering never have to walk back into the cache.
 */
export type MenuRow = {
	name: string;
	menu: string;
	category: string;
	description: string | null;
	calories: number | null;
	badges: string[];
	portions: [string, number][];
	/** Price of the pub's canonical portion, for sorting. */
	from: number;
};

/** How the menu can be ordered; `"menu"` keeps the grouped default. */
export type MenuSort = "menu" | "cheapest" | "dearest";

/** Flags and badges this pub's keyword list carries, as display labels. */
const badgeLabels = (definition: ItemDefinition | undefined): string[] =>
	(definition?.keywords ?? [])
		.filter((keyword) => keyword.isFlag || keyword.isBadge)
		.map((keyword) => keyword.label ?? keyword.name ?? "")
		.filter(Boolean);

/** Portions in canonical order (pint before half, name as the tie-break). */
const orderedPortions = (
	portions: Record<string, number>,
): [string, number][] =>
	Object.entries(portions).sort(
		(a, b) => portionRank(a[0]) - portionRank(b[0]) || a[0].localeCompare(b[0]),
	);

/**
 * The pub's whole menu, grouped the way it reads: menu, then category, then
 * item name. The grouping is what the header rows in `VenueMenu` follow, so
 * the sort and the headers cannot drift apart.
 */
export const buildMenuRows = (
	entry: VenueEntry | undefined,
	items: Record<string, ItemDefinition>,
): MenuRow[] => {
	if (!entry) {
		return [];
	}
	const out: MenuRow[] = [];
	for (const [name, portions] of Object.entries(entry.items)) {
		const definition = items[name];
		const sorted = orderedPortions(portions);
		out.push({
			name,
			menu: definition?.menu ?? "Other",
			category: definition?.category ?? "",
			description: definition?.description ?? null,
			calories: definition?.calories ?? null,
			badges: badgeLabels(definition),
			portions: sorted,
			from: sorted[0]?.[1] ?? 0,
		});
	}
	return out.sort(
		(a, b) =>
			a.menu.localeCompare(b.menu) ||
			a.category.localeCompare(b.category) ||
			a.name.localeCompare(b.name),
	);
};

/**
 * The rows the menu shows: narrowed to one menu and/or a search term, then
 * ordered by the chosen sort.
 */
export const filterMenuRows = (
	rows: MenuRow[],
	{
		query,
		sort,
		menuFilter,
	}: {
		query: string;
		sort: MenuSort;
		menuFilter: string | null;
	},
): MenuRow[] => {
	const needle = query.trim().toLowerCase();
	const base = menuFilter
		? rows.filter((row) => row.menu === menuFilter)
		: rows;
	const list = needle
		? base.filter(
				(row) =>
					row.name.toLowerCase().includes(needle) ||
					row.category.toLowerCase().includes(needle) ||
					row.menu.toLowerCase().includes(needle),
			)
		: base;
	if (sort === "menu") {
		return list;
	}
	return [...list].sort((a, b) =>
		sort === "cheapest" ? a.from - b.from : b.from - a.from,
	);
};
