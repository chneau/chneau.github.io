import type { CacheStats, ItemInfo, PricedVenue, SpoonersCache } from "./types";

/**
 * Turns the cache into what the UI needs. The cache is keyed the "storage way"
 * (item definitions once, prices per venue); these helpers do the join.
 */

const pickPrice = (
	portions: Record<string, number>,
): { portion: string; price: number } | null => {
	const entries = Object.entries(portions);
	if (!entries.length) {
		return null;
	}
	const pint = entries.find(([label]) => {
		const low = label.toLowerCase();
		return low.includes("pint") && !low.includes("half");
	});
	const [portion, price] =
		pint ?? entries.reduce((a, b) => (b[1] > a[1] ? b : a));
	return { portion, price };
};

export const cacheStats = (cache: SpoonersCache): CacheStats => ({
	venues: Object.keys(cache.venues).length,
	venuesWithData: Object.values(cache.venues).filter(
		(v) => v.detail && !v.error,
	).length,
	items: Object.keys(cache.items).length,
	updatedAt: cache.fetchedAt ?? null,
});

/** Every item that at least one venue sells, with its availability count. */
export const buildItemIndex = (cache: SpoonersCache): ItemInfo[] => {
	const counts = new Map<string, number>();
	for (const entry of Object.values(cache.venues)) {
		if (!entry.detail || entry.error) {
			continue;
		}
		for (const name of Object.keys(entry.items)) {
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
	}

	const items: ItemInfo[] = [];
	for (const [name, definition] of Object.entries(cache.items)) {
		const count = counts.get(name) ?? 0;
		if (!count) {
			continue;
		}
		items.push({
			name,
			menu: definition.menu,
			category: definition.category,
			description: definition.description,
			calories: definition.calories,
			keywords: definition.keywords ?? [],
			count,
		});
	}
	// most widely available first, then alphabetical
	items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
	return items;
};

/** Pints first, then halves, bottles, jugs, ... */
const portionRank = (label: string): number => {
	const low = label.toLowerCase();
	if (low === "pint") return 0;
	if (low.includes("half")) return 1;
	if (low.includes("bottle") || low.includes("can")) return 2;
	if (low.includes("jug")) return 3;
	if (low.includes("single")) return 4;
	if (low.includes("double")) return 5;
	return 10;
};

/** Every portion label any venue uses for this item (for the portion switcher). */
export const portionsFor = (
	cache: SpoonersCache,
	itemName: string,
): string[] => {
	const seen = new Set<string>();
	for (const entry of Object.values(cache.venues)) {
		const portions = entry.items[itemName];
		if (!portions) {
			continue;
		}
		for (const label of Object.keys(portions)) {
			seen.add(label);
		}
	}
	return [...seen].sort(
		(a, b) => portionRank(a) - portionRank(b) || a.localeCompare(b),
	);
};

/** All venues selling `itemName`, with their canonical price. */
export const pricedVenues = (
	cache: SpoonersCache,
	itemName: string,
	/** When set, use that portion's price (venues without it are skipped). */
	portion?: string | null,
): PricedVenue[] => {
	const venues: PricedVenue[] = [];
	for (const entry of Object.values(cache.venues)) {
		const portions = entry.items[itemName];
		if (!portions) {
			continue;
		}
		const location = entry.venue.address?.location;
		if (!location || location.latitude == null || location.longitude == null) {
			continue;
		}
		const exact = portion ? portions[portion] : undefined;
		const picked =
			exact != null && portion
				? { portion, price: exact }
				: pickPrice(portions);
		if (!picked) {
			continue;
		}
		venues.push({
			ref: entry.venue.venueRef,
			name: entry.venue.name,
			lat: location.latitude,
			lng: location.longitude,
			town: entry.venue.address?.town ?? null,
			county: entry.venue.address?.county ?? null,
			postcode: entry.venue.address?.postcode ?? null,
			type: entry.venue.type ?? null,
			isClosed: Boolean(entry.venue.isClosed),
			price: picked.price,
			portion: picked.portion,
			portions,
		});
	}
	return venues;
};

/** The portion label most venues use, e.g. "Pint". */
export const commonPortion = (venues: PricedVenue[]): string | null => {
	const counts = new Map<string, number>();
	for (const venue of venues) {
		counts.set(venue.portion, (counts.get(venue.portion) ?? 0) + 1);
	}
	let best: string | null = null;
	let bestCount = 0;
	for (const [portion, count] of counts) {
		if (count > bestCount) {
			best = portion;
			bestCount = count;
		}
	}
	return best;
};
