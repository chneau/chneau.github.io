import type {
	CacheStats,
	ItemInfo,
	PricedVenue,
	SpoonersCache,
	VenueDetail,
} from "./types";

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
	now: Date = new Date(),
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
		const open = venueOpenState(entry.detail, now);
		venues.push({
			ref: entry.venue.venueRef,
			name: entry.venue.name,
			lat: location.latitude,
			lng: location.longitude,
			line1: entry.venue.address?.line1 ?? null,
			town: entry.venue.address?.town ?? null,
			county: entry.venue.address?.county ?? null,
			postcode: entry.venue.address?.postcode ?? null,
			type: entry.venue.type ?? null,
			isClosed: Boolean(entry.venue.isClosed),
			price: picked.price,
			portion: picked.portion,
			portions,
			isOpenNow: open.open,
			hoursToday: open.hours,
			facilities: venueFacilities(entry.detail),
			phone: entry.detail?.contactDetails?.telephone || null,
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

// --------------------------------------------------------------------------- #
// opening times, facilities, distance                                            #
// --------------------------------------------------------------------------- #

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const toMinutes = (time: string): number => {
	const [hours, minutes] = time.split(":");
	return Number(hours ?? 0) * 60 + Number(minutes ?? 0);
};

type OpenState = {
	open: boolean;
	/** "08:00–23:30" for today, when the venue publishes hours. */
	hours: string | null;
};

/**
 * Whether the venue is open right now, from its weekly schedule (or today's
 * date override). Times are compared against the device clock, so this assumes
 * the viewer is in the UK.
 */
const venueOpenState = (
	detail: VenueDetail | null,
	now: Date = new Date(),
): OpenState => {
	const times = detail?.openingTimes;
	if (!times) {
		return { open: false, hours: null };
	}
	const dateKey = now.toISOString().slice(0, 10);
	const dayKey = DAY_KEYS[now.getDay()] ?? "mon";
	const day = times.dates?.[dateKey] ?? times.days?.[dayKey] ?? null;
	if (!day?.open || day.isClosed) {
		return { open: false, hours: null };
	}
	const hours = `${day.open}–${day.close ?? ""}`;
	const current = now.getHours() * 60 + now.getMinutes();
	const openAt = toMinutes(day.open);
	let closeAt = day.close ? toMinutes(day.close) : openAt;
	if (closeAt <= openAt) {
		closeAt += 24 * 60; // closes after midnight
	}
	// before opening, but last night's session ran past midnight
	const adjusted =
		current < openAt && closeAt > 24 * 60 ? current + 24 * 60 : current;
	return { open: adjusted >= openAt && adjusted < closeAt, hours };
};

/** Venue facilities ("Baby change", "Licensed outside area", ...). */
const venueFacilities = (detail: VenueDetail | null): string[] =>
	(detail?.facilities ?? []).filter(
		(facility: unknown): facility is string => typeof facility === "string",
	);

/** Great-circle distance in miles. */
export const haversineMiles = (
	from: { lat: number; lng: number },
	to: { lat: number; lng: number },
): number => {
	const radius = 3958.8;
	const toRad = (degrees: number) => (degrees * Math.PI) / 180;
	const dLat = toRad(to.lat - from.lat);
	const dLng = toRad(to.lng - from.lng);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(from.lat)) *
			Math.cos(toRad(to.lat)) *
			Math.sin(dLng / 2) ** 2;
	return 2 * radius * Math.asin(Math.sqrt(a));
};

// --------------------------------------------------------------------------- #
// item filters (dietary / nutritional)                                          #
// --------------------------------------------------------------------------- #

type FilterRule = { id: string; label: string; type: string };

const FILTER_RULES: FilterRule[] = [
	{ id: "vegan", label: "Vegan", type: "Vegan" },
	{ id: "vegetarian", label: "Vegetarian", type: "Vegetarian" },
	{ id: "light", label: "Under 500 kcal", type: "under500" },
	{ id: "lowfat", label: "5% fat or less", type: "5fat" },
];

type FilterOption = { id: string; label: string; count: number };

const hasKeywordType = (item: ItemInfo, type: string): boolean =>
	item.keywords.some((keyword) => keyword.type === type);

/** The filters that actually apply to something in the current item list. */
export const availableFilters = (items: ItemInfo[]): FilterOption[] =>
	FILTER_RULES.map((rule) => ({
		id: rule.id,
		label: rule.label,
		count: items.filter((item) => hasKeywordType(item, rule.type)).length,
	})).filter((option) => option.count > 0);

/** True when the item satisfies every active filter. */
export const matchesFilters = (item: ItemInfo, active: string[]): boolean =>
	active.every((id) => {
		const rule = FILTER_RULES.find((candidate) => candidate.id === id);
		return !rule || hasKeywordType(item, rule.type);
	});
