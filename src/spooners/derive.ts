import {
	canonicalPortion,
	choosePrice,
	classifyPortion,
	computeValue,
	itemNature,
	mergePortions,
	normalizePortions,
	parseAbv,
	parseUnits,
	parseVolumeMl,
	portionMl,
} from "./portions";
import { median } from "./price";
import type {
	CacheStats,
	HistoryPoint,
	ItemInfo,
	PricedVenue,
	SpoonersCache,
	VenueDetail,
	VenueInfo,
	VenueSpot,
} from "./types";

/**
 * Turns the cache into what the UI needs. The cache is keyed the "storage way"
 * (item definitions once, prices per venue); these helpers do the join.
 */

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
			nature: itemNature(definition),
			trend: trendPercent(historyOf(cache, name)),
		});
	}

	// most widely available first, then alphabetical
	items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
	return items;
};

/** Every portion label any venue uses for this item (for the portion switcher). */
export const portionsFor = (cache: SpoonersCache, itemName: string): string[] =>
	mergePortions(
		Object.values(cache.venues)
			.map((entry) => entry.items[itemName])
			.filter((portions): portions is Record<string, number> =>
				Boolean(portions),
			),
	);

/** All venues selling `itemName`, with their canonical price. */
export const pricedVenues = (
	cache: SpoonersCache,
	itemName: string,
	/** When set, use that portion's price (venues without it are skipped). */
	portion?: string | null,
	now: Date = new Date(),
): PricedVenue[] => {
	const definition = cache.items[itemName] ?? null;
	const nature = itemNature(definition);
	const descriptionUnits = parseUnits(definition?.description);
	const abv = parseAbv(definition?.description);
	const calories = definition?.calories ?? null;
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
		const picked = choosePrice(portions, portion ?? null, nature);
		if (!picked) {
			continue;
		}
		const portionKind = classifyPortion(picked.portion);
		const volumeMl =
			portionMl(picked.portion) ??
			(portionKind === "bottle" ||
			portionKind === "can" ||
			portionKind === "glass"
				? parseVolumeMl(definition?.description)
				: null);
		const units =
			abv != null && volumeMl != null
				? (abv * volumeMl) / 1000
				: nature === "spirit"
					? null
					: descriptionUnits;
		const value = computeValue({
			nature,
			price: picked.price,
			abv,
			ml: volumeMl,
			calories,
			descriptionUnits,
		});
		const changes = historyFor(cache, entry.venue.venueRef, itemName);
		let previousPrice: number | null = null;
		let previousAt: string | null = null;
		for (const [at, price] of changes) {
			if (price !== picked.price) {
				previousPrice = price;
				previousAt = at;
			}
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
			spot: venueSpot(entry.venue, entry.detail),
			canOrder:
				entry.venue.selectHandler?.type !== "message" &&
				entry.detail?.canPlaceOrder !== false,
			isClosed: Boolean(entry.venue.isClosed),
			status: entry.venue.status ?? null,
			price: picked.price,
			portion: picked.portion,
			portions: normalizePortions(portions),
			currency:
				entry.detail?.currency?.code ??
				entry.detail?.currency?.currencyCode ??
				"GBP",
			isOpenNow: open.open,
			hoursToday: open.hours,
			facilities: venueFacilities(entry.detail),
			phone: entry.detail?.contactDetails?.telephone || null,
			volumeMl,
			units,
			abv,
			calories,
			metricKind: value?.kind ?? null,
			metricValue: value?.value ?? null,
			previousPrice,
			previousAt,
		});
	}
	return venues;
};

/** The portion most venues use for this item (data-driven, format-aware). */
export const commonPortion = (
	cache: SpoonersCache,
	itemName: string,
): string | null =>
	canonicalPortion(
		itemNature(cache.items[itemName] ?? null),
		Object.values(cache.venues)
			.map((entry) => entry.items[itemName])
			.filter((portions): portions is Record<string, number> =>
				Boolean(portions),
			),
	);

export type CurrencyOption = { code: string; count: number };

/** Currencies present among these venues (GBP for GB, EUR for Ireland). */
export const availableCurrencies = (
	venues: PricedVenue[],
): CurrencyOption[] => {
	const counts = new Map<string, number>();
	for (const venue of venues) {
		counts.set(venue.currency, (counts.get(venue.currency) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([code, count]) => ({ code, count }))
		.sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
};

// --------------------------------------------------------------------------- #
// special venues (airports, havens, hotels, ...)                                 #
// --------------------------------------------------------------------------- #

export const SPOT_META: Record<VenueSpot, { label: string; emoji: string }> = {
	"high-street": { label: "High street", emoji: "🏙" },
	airport: { label: "Airport", emoji: "✈️" },
	haven: { label: "Haven park", emoji: "⛱️" },
	concession: { label: "Concession", emoji: "🏪" },
	hotel: { label: "Hotel", emoji: "🏨" },
};

export const venueSpot = (
	venue: VenueInfo,
	detail: VenueDetail | null,
): VenueSpot => {
	const subType = (venue.subType ?? "").toLowerCase();
	if (subType === "airport") return "airport";
	if (subType === "haven") return "haven";
	if (subType === "concession") return "concession";
	if (venue.type === "pub_hotel" || venue.hotel || detail?.hotel)
		return "hotel";
	return "high-street";
};

/**
 * Airport / haven / concession - venues with a captive audience. Hotels are
 * flagged as special too, but priced like the high street, so they stay out of
 * the premium comparison (and of the "hide" filter).
 */
export const isCaptiveSpot = (spot: VenueSpot): boolean =>
	spot === "airport" || spot === "haven" || spot === "concession";

type Premium = {
	normalMedian: number;
	specialMedian: number;
	premiumPercent: number;
	specialCount: number;
	normalCount: number;
};

/** How much the captive venues charge over everywhere else, for this item. */
export const specialPremium = (venues: PricedVenue[]): Premium | null => {
	const normal = venues
		.filter((v) => !isCaptiveSpot(v.spot))
		.map((v) => v.price);
	const special = venues
		.filter((v) => isCaptiveSpot(v.spot))
		.map((v) => v.price);
	if (!normal.length || !special.length) return null;
	const normalMedian = median(normal);
	const specialMedian = median(special);
	if (!normalMedian) return null;
	return {
		normalMedian,
		specialMedian,
		premiumPercent: ((specialMedian - normalMedian) / normalMedian) * 100,
		specialCount: special.length,
		normalCount: normal.length,
	};
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
export const venueOpenState = (
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
export const venueFacilities = (detail: VenueDetail | null): string[] =>
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

export type FilterOption = { id: string; label: string; count: number };

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

// --------------------------------------------------------------------------- #
// price history (kept by the pipeline, optional)                                 #
// --------------------------------------------------------------------------- #

/** National distribution snapshots for one item. */
const historyOf = (cache: SpoonersCache, itemName: string): HistoryPoint[] =>
	cache.history?.items?.[itemName] ?? [];

/** The recorded price changes of one item at one venue. */
const historyFor = (
	cache: SpoonersCache,
	ref: number,
	itemName: string,
): [string, number][] => cache.history?.venues?.[String(ref)]?.[itemName] ?? [];

const trendPercent = (points: HistoryPoint[]): number | null => {
	if (points.length < 2) {
		return null;
	}
	const first = points[0];
	const last = points[points.length - 1];
	if (!first?.median || !last) {
		return null;
	}
	return ((last.median - first.median) / first.median) * 100;
};

export type Trend = {
	/** Oldest median recorded. */
	from: number;
	/** Newest median recorded. */
	to: number;
	percent: number;
	/** Number of snapshots kept. */
	points: HistoryPoint[];
};

export const itemTrend = (
	cache: SpoonersCache,
	itemName: string,
): Trend | null => {
	const points = historyOf(cache, itemName);
	if (points.length < 2) {
		return null;
	}
	const percent = trendPercent(points);
	const first = points[0];
	const last = points[points.length - 1];
	if (percent == null || !first || !last) {
		return null;
	}
	return { from: first.median, to: last.median, percent, points };
};

// --------------------------------------------------------------------------- #
// facilities                                                                     #
// --------------------------------------------------------------------------- #

export type FacilityOption = { label: string; count: number };

/** The facilities that appear often enough to be worth filtering on. */
export const availableFacilities = (
	venues: PricedVenue[],
	limit = 8,
): FacilityOption[] => {
	const counts = new Map<string, number>();
	for (const venue of venues) {
		for (const facility of venue.facilities) {
			counts.set(facility, (counts.get(facility) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([label, count]) => ({ label, count }))
		.filter((option) => option.count > 0)
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
		.slice(0, limit);
};

export const matchesFacilities = (
	venue: PricedVenue,
	active: string[],
): boolean => active.every((facility) => venue.facilities.includes(facility));

// --------------------------------------------------------------------------- #
// geography                                                                      #
// --------------------------------------------------------------------------- #

export type AreaStat = {
	area: string;
	median: number;
	count: number;
	lat: number;
	lng: number;
};

/** Median price per county (falling back to town) for areas with enough pubs. */
export const areaStats = (venues: PricedVenue[], min = 5): AreaStat[] => {
	const groups = new Map<string, PricedVenue[]>();
	for (const venue of venues) {
		const area = venue.county?.trim() || venue.town?.trim();
		if (!area) {
			continue;
		}
		const list = groups.get(area);
		if (list) {
			list.push(venue);
		} else {
			groups.set(area, [venue]);
		}
	}
	const stats: AreaStat[] = [];
	for (const [area, list] of groups) {
		if (list.length < min) {
			continue;
		}
		stats.push({
			area,
			median: median(list.map((venue) => venue.price)),
			count: list.length,
			lat: list.reduce((sum, v) => sum + v.lat, 0) / list.length,
			lng: list.reduce((sum, v) => sum + v.lng, 0) / list.length,
		});
	}
	return stats.sort((a, b) => a.median - b.median);
};

// --------------------------------------------------------------------------- #
// discovery: rare guest items, new items and where to find them                  #
// --------------------------------------------------------------------------- #

export const rareItems = (items: ItemInfo[], maxCount = 3): ItemInfo[] =>
	items.filter((item) => item.count <= maxCount);

export const newItems = (items: ItemInfo[]): ItemInfo[] =>
	items.filter((item) =>
		item.keywords.some((keyword) => keyword.name === "PI::new"),
	);

export type Seller = {
	ref: number;
	name: string;
	town: string | null;
	price: number;
	portion: string;
	currency: string;
	distance: number;
};

/** For each item, the nearest venue selling it (needs a location). */
export const nearestSellers = (
	cache: SpoonersCache,
	itemNames: string[],
	from: { lat: number; lng: number },
): Record<string, Seller | null> => {
	const out: Record<string, Seller | null> = {};
	const wanted = new Set(itemNames);
	for (const entry of Object.values(cache.venues)) {
		const location = entry.venue.address?.location;
		if (!location || location.latitude == null || location.longitude == null) {
			continue;
		}
		const distance = haversineMiles(from, {
			lat: location.latitude,
			lng: location.longitude,
		});
		for (const name of Object.keys(entry.items)) {
			if (!wanted.has(name)) {
				continue;
			}
			const current = out[name];
			if (current && current.distance <= distance) {
				continue;
			}
			const picked = choosePrice(
				entry.items[name] ?? {},
				null,
				itemNature(cache.items[name] ?? null),
			);
			if (!picked) {
				continue;
			}
			out[name] = {
				ref: entry.venue.venueRef,
				name: entry.venue.name,
				town: entry.venue.address?.town ?? null,
				price: picked.price,
				portion: picked.portion,
				currency:
					entry.detail?.currency?.code ??
					entry.detail?.currency?.currencyCode ??
					"GBP",
				distance,
			};
		}
	}
	return out;
};

/** Pubs that are closed, closing, or not open yet (temporarily unavailable). */
export const isTemporarilyClosed = (
	status: string | null | undefined,
): boolean =>
	status === "closing_temporary" ||
	status === "closed_temporary" ||
	status === "opening_soon" ||
	status === "closed";
