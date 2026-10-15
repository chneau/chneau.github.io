import { useMemo } from "react";
import {
	areaStats,
	availableFacilities,
	haversineMiles,
	isCaptiveSpot,
	isTemporarilyClosed,
	matchesVenueFilters,
	nearestSellers,
	newItems,
	rareItems,
	specialPremium,
	venuesWithoutPrices,
} from "./derive";
import { makeScale, median, money } from "./price";
import type { MapPoint, PricedVenue, SpoonersCache } from "./types";

type FilterInput = {
	displayVenues: PricedVenue[];
	onlyComplete: boolean;
	openNowOnly: boolean;
	hideSpecial: boolean;
	hideClosed: boolean;
	activeFacilities: string[];
	areaFilter: string | null;
	userLocation: { lat: number; lng: number } | null;
	singleName: string | null;
	roundQty: number;
};

export const useVenueFilter = ({
	displayVenues,
	onlyComplete,
	openNowOnly,
	hideSpecial,
	hideClosed,
	activeFacilities,
	areaFilter,
	userLocation,
	singleName,
	roundQty,
}: FilterInput) => {
	const completeVenues = useMemo(
		() =>
			onlyComplete
				? displayVenues.filter((venue) => venue.missing.length === 0)
				: displayVenues,
		[displayVenues, onlyComplete],
	);
	const partialCount = useMemo(
		() => displayVenues.filter((venue) => venue.missing.length > 0).length,
		[displayVenues],
	);
	const completeCount = displayVenues.length - partialCount;

	const openCount = useMemo(
		() => completeVenues.filter((venue) => venue.isOpenNow).length,
		[completeVenues],
	);
	const specialCount = useMemo(
		() => completeVenues.filter((venue) => isCaptiveSpot(venue.spot)).length,
		[completeVenues],
	);
	const closedCount = useMemo(
		() =>
			completeVenues.filter(
				(venue) => venue.isClosed || isTemporarilyClosed(venue.status),
			).length,
		[completeVenues],
	);
	const facilityOptions = useMemo(
		() => availableFacilities(completeVenues),
		[completeVenues],
	);

	const venueFilters = useMemo(
		() => ({
			openNow: openNowOnly,
			hideSpecial,
			hideClosed,
			facilities: activeFacilities,
		}),
		[openNowOnly, hideSpecial, hideClosed, activeFacilities],
	);

	const baseVenues = useMemo(
		() =>
			completeVenues.filter((venue) =>
				matchesVenueFilters(venue, venueFilters),
			),
		[completeVenues, venueFilters],
	);

	const venues = useMemo(
		() =>
			areaFilter
				? baseVenues.filter(
						(venue) => venue.county === areaFilter || venue.town === areaFilter,
					)
				: baseVenues,
		[baseVenues, areaFilter],
	);

	const withDistance = useMemo(
		() =>
			userLocation
				? venues.map((venue) => ({
						...venue,
						distance: haversineMiles(userLocation, {
							lat: venue.lat,
							lng: venue.lng,
						}),
					}))
				: venues,
		[venues, userLocation],
	);
	const nearby = useMemo(
		() =>
			userLocation
				? [...withDistance]
						.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
						.slice(0, 12)
				: undefined,
		[withDistance, userLocation],
	);
	const scale = useMemo(
		() => makeScale(withDistance.map((venue) => venue.price)),
		[withDistance],
	);
	const prices = useMemo(
		() => withDistance.map((venue) => venue.price),
		[withDistance],
	);
	const medianPrice = useMemo(() => median(prices), [prices]);
	const hiddenCount = displayVenues.length - venues.length;
	const legendLabel = singleName
		? `${singleName}${
				displayVenues[0]?.portion ? ` · ${displayVenues[0].portion}` : ""
			}`
		: roundQty > 1
			? `${roundQty}-item round`
			: undefined;

	return {
		completeVenues,
		completeCount,
		partialCount,
		openCount,
		specialCount,
		closedCount,
		facilityOptions,
		venueFilters,
		baseVenues,
		venues,
		withDistance,
		nearby,
		scale,
		prices,
		medianPrice,
		hiddenCount,
		legendLabel,
	};
};

export const premiumInsight = (
	completeVenues: PricedVenue[],
	displayCurrency: string,
): string | null => {
	const insight = specialPremium(completeVenues);
	if (!insight) {
		return null;
	}
	const sign = insight.premiumPercent >= 0 ? "+" : "−";
	const where = completeVenues.some((venue) => venue.spot === "airport")
		? "Airport"
		: "Travel";
	return `${where} venues charge ${sign}${Math.abs(
		Math.round(insight.premiumPercent),
	)}% more than the rest — median ${money(
		insight.specialMedian,
		displayCurrency,
	)} vs ${money(
		insight.normalMedian,
		displayCurrency,
	)} (${insight.specialCount} of ${insight.specialCount + insight.normalCount} pubs)`;
};

type UnpricedInput = {
	data: SpoonersCache | null;
	userLocation: { lat: number; lng: number } | null;
	venueFilters: Parameters<typeof matchesVenueFilters>[1];
};

export const useUnpricedVenues = ({
	data,
	userLocation,
	venueFilters,
}: UnpricedInput) => {
	const all = useMemo(() => {
		if (!data) {
			return [];
		}
		const list = venuesWithoutPrices(data);
		return userLocation
			? list.map((venue) => ({
					...venue,
					distance: haversineMiles(userLocation, {
						lat: venue.lat,
						lng: venue.lng,
					}),
				}))
			: list;
	}, [data, userLocation]);

	const points = useMemo<MapPoint[]>(
		() =>
			all
				.filter((venue) => matchesVenueFilters(venue, venueFilters))
				.map((venue) => ({
					ref: venue.ref,
					name: venue.name,
					lat: venue.lat,
					lng: venue.lng,
					price: 0,
					currency: venue.currency,
					label: "no published menu",
					line1: null,
					town: venue.town,
					postcode: venue.postcode,
					facilities: venue.facilities,
					phone: venue.phone,
					spot: venue.spot,
					isClosed: venue.isClosed,
					isOpenNow: venue.isOpenNow,
					hoursToday: venue.hoursToday,
					distance: venue.distance,
				})),
		[all, venueFilters],
	);

	return { all, points };
};

type DiscoveryInput = {
	visibleIndex: Parameters<typeof rareItems>[0];
	data: SpoonersCache | null;
	userLocation: { lat: number; lng: number } | null;
};

export const useDiscovery = ({
	visibleIndex,
	data,
	userLocation,
}: DiscoveryInput) => {
	const rare = useMemo(
		() => rareItems(visibleIndex).slice(0, 60),
		[visibleIndex],
	);
	const fresh = useMemo(
		() => newItems(visibleIndex).slice(0, 60),
		[visibleIndex],
	);
	const sellerNames = useMemo(
		() => [
			...new Set([
				...rare.slice(0, 40).map((item) => item.name),
				...fresh.slice(0, 40).map((item) => item.name),
			]),
		],
		[rare, fresh],
	);
	const sellers = useMemo(
		() =>
			data && userLocation && sellerNames.length
				? nearestSellers(data, sellerNames, userLocation)
				: null,
		[data, userLocation, sellerNames],
	);
	return { rare, fresh, sellers };
};

type AreaInput = {
	baseVenues: PricedVenue[];
	displayCurrency: string;
};

export const useAreaLayers = ({ baseVenues, displayCurrency }: AreaInput) => {
	const areas = useMemo(() => areaStats(baseVenues), [baseVenues]);
	const areaPoints = useMemo<MapPoint[]>(
		() =>
			areas.map((stat, position) => ({
				ref: -(position + 1),
				name: stat.area,
				lat: stat.lat,
				lng: stat.lng,
				price: stat.median,
				currency: displayCurrency,
				label: `${stat.count} pubs`,
				line1: null,
				town: null,
				postcode: null,
				facilities: [],
				phone: null,
				spot: "high-street" as const,
				kind: "area" as const,
				isClosed: false,
				isOpenNow: false,
				hoursToday: null,
			})),
		[areas, displayCurrency],
	);
	return { areas, areaPoints };
};
