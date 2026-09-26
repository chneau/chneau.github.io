/**
 * The round calculator: pick drinks and quantities, see what the whole round
 * costs at every venue. Each line uses the venue's own canonical portion for
 * that item, so the total is comparable across pubs.
 */

import { venueFacilities, venueOpenState, venueSpot } from "./derive";
import { choosePrice, itemNature } from "./portions";
import type { SpoonersCache, VenueSpot } from "./types";

export type BasketItem = { name: string; qty: number };

type BasketLine = {
	name: string;
	portion: string;
	/** Unit price at this venue, in the venue's own currency. */
	price: number;
};

export type BasketVenue = {
	ref: number;
	name: string;
	lat: number;
	lng: number;
	line1: string | null;
	town: string | null;
	county: string | null;
	postcode: string | null;
	spot: VenueSpot;
	status: string | null;
	isClosed: boolean;
	canOrder: boolean;
	isOpenNow: boolean;
	hoursToday: string | null;
	facilities: string[];
	phone: string | null;
	currency: string;
	/** Total for the whole round, in the venue's own currency. */
	total: number;
	lines: BasketLine[];
	/** Items of the round this venue does not sell. */
	missing: string[];
	distance?: number;
};

/** Every venue that sells at least one line of the round, with the total. */
export const basketVenues = (
	cache: SpoonersCache,
	basket: BasketItem[],
	now: Date = new Date(),
): BasketVenue[] => {
	const wanted = basket.filter((item) => item.qty > 0);
	if (!wanted.length) {
		return [];
	}
	const nature = new Map(
		wanted.map((item) => [
			item.name,
			itemNature(cache.items[item.name] ?? null),
		]),
	);

	const venues: BasketVenue[] = [];
	for (const entry of Object.values(cache.venues)) {
		const location = entry.venue.address?.location;
		if (!location || location.latitude == null || location.longitude == null) {
			continue;
		}
		let total = 0;
		const lines: BasketLine[] = [];
		const missing: string[] = [];
		for (const { name, qty } of wanted) {
			const portions = entry.items[name];
			const picked = portions
				? choosePrice(portions, null, nature.get(name) ?? "other")
				: null;
			if (!picked) {
				missing.push(name);
				continue;
			}
			total += picked.price * qty;
			lines.push({ name, portion: picked.portion, price: picked.price });
		}
		if (!lines.length) {
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
			spot: venueSpot(entry.venue, entry.detail),
			status: entry.venue.status ?? null,
			isClosed: Boolean(entry.venue.isClosed),
			canOrder:
				entry.venue.selectHandler?.type !== "message" &&
				entry.detail?.canPlaceOrder !== false,
			isOpenNow: open.open,
			hoursToday: open.hours,
			facilities: venueFacilities(entry.detail),
			phone: entry.detail?.contactDetails?.telephone || null,
			currency:
				entry.detail?.currency?.code ??
				entry.detail?.currency?.currencyCode ??
				"GBP",
			total,
			lines,
			missing,
		});
	}
	return venues;
};

/** "Guinness:2,Stowford Press Apple cider:1" <-> BasketItem[] */
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
