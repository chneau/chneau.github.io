/**
 * The round: a list of drinks (or dishes) with quantities. A round with a
 * single line is the "what does one pint cost" case, so the whole app is built
 * on this and there is no separate single-item code path.
 *
 * Each line uses the venue's own canonical portion for that item, so the total
 * is comparable across pubs.
 */

import {
	venueCurrency,
	venueFacilities,
	venueImages,
	venueOpenState,
	venueSpot,
} from "./derive";
import { pickItemValue } from "./portions";
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
		let metricKind: VenuePriceLine["metricKind"] = null;
		let metricValue: number | null = null;
		let portion = `${totalQty} items`;

		for (const { name, qty } of wanted) {
			const portions = entry.items[name];
			const definition = definitions.get(name) ?? null;
			const picked = portions ? pickItemValue(portions, definition) : null;
			if (!picked) {
				missing.push(name);
				continue;
			}
			if (single === name) {
				portion = picked.portion;
				metricKind = picked.value?.kind ?? null;
				metricValue = picked.value?.value ?? null;
			}
			total += picked.price * qty;
			lines.push({
				name,
				portion: picked.portion,
				price: picked.price,
				metricKind: picked.value?.kind ?? null,
				metricValue: picked.value?.value ?? null,
			});
		}
		if (!lines.length) {
			continue;
		}
		const open = venueOpenState(entry.detail, now);
		let previousPrice: number | null = null;
		if (single) {
			const changes =
				cache.history?.venues?.[String(entry.venue.venueRef)]?.[single] ?? [];
			for (const [, price] of changes) {
				if (price !== (lines[0]?.price ?? 0)) {
					previousPrice = price;
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
			lines,
			missing,
			images: venueImages(entry.detail),
			currency: venueCurrency(entry.detail),
			isOpenNow: open.open,
			hoursToday: open.hours,
			facilities: venueFacilities(entry.detail),
			phone: entry.detail?.contactDetails?.telephone || null,
			metricKind,
			metricValue,
			previousPrice,
		});
	}
	return venues;
};

/**
 * Names travel inside a comma/colon-delimited string, so they are
 * percent-encoded. Older links stored raw names, and hand-typed names may not
 * be valid escapes, so a failure falls back to the raw text.
 */
const decodeBasketName = (value: string): string => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
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
		const name = decodeBasketName(part.slice(0, separator)).trim();
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
		.map((item) => `${encodeURIComponent(item.name)}:${item.qty}`)
		.join(",");
