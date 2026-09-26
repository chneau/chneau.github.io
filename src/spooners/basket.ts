/**
 * The round: a list of drinks (or dishes) with quantities. A round with a
 * single line is the "what does one pint cost" case, so the whole app is built
 * on this and there is no separate single-item code path.
 *
 * Each line uses the venue's own canonical portion for that item, so the total
 * is comparable across pubs.
 */

import {
	venueFacilities,
	venueImages,
	venueOpenState,
	venueSpot,
} from "./derive";
import {
	choosePrice,
	classifyPortion,
	computeValue,
	itemNature,
	parseAbv,
	parseUnits,
	parseVolumeMl,
	portionMl,
} from "./portions";
import type { PricedVenue, SpoonersCache, VenuePriceLine } from "./types";

export type BasketItem = { name: string; qty: number };

/** Every venue that sells at least one line of the round, with the total. */
export const basketVenues = (
	cache: SpoonersCache,
	basket: BasketItem[],
	now: Date = new Date(),
): PricedVenue[] => {
	const wanted = basket.filter((item) => item.qty > 0);
	if (!wanted.length) {
		return [];
	}
	const definitions = new Map(
		wanted.map((item) => [item.name, cache.items[item.name] ?? null]),
	);
	const natures = new Map(
		wanted.map((item) => [
			item.name,
			itemNature(cache.items[item.name] ?? null),
		]),
	);
	const single = wanted.length === 1 ? (wanted[0]?.name ?? null) : null;
	const totalQty = wanted.reduce((sum, item) => sum + item.qty, 0);

	const venues: PricedVenue[] = [];
	for (const entry of Object.values(cache.venues)) {
		const location = entry.venue.address?.location;
		if (!location || location.latitude == null || location.longitude == null) {
			continue;
		}
		let total = 0;
		const lines: VenuePriceLine[] = [];
		const missing: string[] = [];
		// filled in when the round is a single item
		let volumeMl: number | null = null;
		let units: number | null = null;
		let abvValue: number | null = null;
		let calories: number | null = null;
		let metricKind: VenuePriceLine["metricKind"] = null;
		let metricValue: number | null = null;
		let portion = `${totalQty} items`;

		for (const { name, qty } of wanted) {
			const portions = entry.items[name];
			const nature = natures.get(name) ?? "other";
			const picked = portions ? choosePrice(portions, null, nature) : null;
			if (!picked) {
				missing.push(name);
				continue;
			}
			const definition = definitions.get(name) ?? null;
			const kind = classifyPortion(picked.portion);
			const ml =
				portionMl(picked.portion) ??
				(kind === "bottle" || kind === "can" || kind === "glass"
					? parseVolumeMl(definition?.description)
					: null);
			const abv = parseAbv(definition?.description);
			const descriptionUnits = parseUnits(definition?.description);
			const lineUnits =
				abv != null && ml != null
					? (abv * ml) / 1000
					: nature === "spirit"
						? null
						: descriptionUnits;
			const value = computeValue({
				nature,
				price: picked.price,
				abv,
				ml,
				calories: definition?.calories ?? null,
				descriptionUnits,
			});
			if (single === name) {
				portion = picked.portion;
				volumeMl = ml;
				units = lineUnits;
				abvValue = abv;
				calories = definition?.calories ?? null;
				metricKind = value?.kind ?? null;
				metricValue = value?.value ?? null;
			}
			total += picked.price * qty;
			lines.push({
				name,
				portion: picked.portion,
				price: picked.price,
				metricKind: value?.kind ?? null,
				metricValue: value?.value ?? null,
			});
		}
		if (!lines.length) {
			continue;
		}
		const open = venueOpenState(entry.detail, now);
		let previousPrice: number | null = null;
		let previousAt: string | null = null;
		if (single) {
			const changes =
				cache.history?.venues?.[String(entry.venue.venueRef)]?.[single] ?? [];
			for (const [at, price] of changes) {
				if (price !== (lines[0]?.price ?? 0)) {
					previousPrice = price;
					previousAt = at;
				}
			}
		}
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
			price: total,
			portion,
			portions: {},
			lines,
			missing,
			images: venueImages(entry.detail),
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
			abv: abvValue,
			calories,
			metricKind,
			metricValue,
			previousPrice,
			previousAt,
		});
	}
	return venues;
};

/** "Guinness:2,Budweiser:1" <-> BasketItem[] */
export const parseBasket = (value: string | null): BasketItem[] => {
	if (!value) {
		return [];
	}
	const items: BasketItem[] = [];
	for (const part of value.split(",")) {
		const separator = part.lastIndexOf(":");
		if (separator < 0) {
			continue;
		}
		const name = part.slice(0, separator).trim();
		const qty = Number.parseInt(part.slice(separator + 1), 10);
		if (name && Number.isFinite(qty) && qty > 0) {
			const existing = items.find((item) => item.name === name);
			if (existing) {
				existing.qty += qty;
			} else {
				items.push({ name, qty: Math.min(qty, 99) });
			}
		}
	}
	return items;
};

export const serializeBasket = (items: BasketItem[]): string =>
	items
		.filter((item) => item.qty > 0)
		.map((item) => `${item.name}:${item.qty}`)
		.join(",");
