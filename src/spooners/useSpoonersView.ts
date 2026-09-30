import { useMemo } from "react";
import { type BasketItem, basketVenues } from "./basket";
import {
	areaStats,
	availableCurrencies,
	availableFacilities,
	availableFilters,
	buildItemIndex,
	cacheStats,
	haversineMiles,
	isCaptiveSpot,
	isTemporarilyClosed,
	itemTrend,
	matchesFilters,
	matchesVenueFilters,
	nearestSellers,
	newItems,
	rareItems,
	specialPremium,
	venuesWithoutPrices,
} from "./derive";
import { metricText } from "./portions";
import { makeScale, median, money } from "./price";
import { canConvertTo, convert, type RateTable } from "./rates";
import type { Formatter, MapPoint, SpoonersCache, ValueKind } from "./types";

const DEFAULT_ITEM_HINT = "guinness";

type SpoonersViewInput = {
	data: SpoonersCache | null;
	/** The round as edited, or `null` when it has not been touched yet. */
	basket: BasketItem[] | null;
	selectedCurrency: string | null;
	activeFilters: string[];
	activeFacilities: string[];
	openNowOnly: boolean;
	hideSpecial: boolean;
	hideClosed: boolean;
	onlyComplete: boolean;
	areaFilter: string | null;
	userLocation: { lat: number; lng: number } | null;
	view: "pubs" | "area";
	/** The "prices shown in" setting: "native" or an ISO code. */
	convertCurrency: string;
	rates: RateTable | null;
};

/**
 * Every derivation between the raw cache + UI state and what the pieces render.
 * App owns the state and the handlers; this hook owns the memos.
 */
export const useSpoonersView = (input: SpoonersViewInput) => {
	const {
		data,
		basket,
		selectedCurrency,
		activeFilters,
		activeFacilities,
		openNowOnly,
		hideSpecial,
		hideClosed,
		onlyComplete,
		areaFilter,
		userLocation,
		view,
		convertCurrency,
		rates,
	} = input;

	const index = useMemo(() => (data ? buildItemIndex(data) : []), [data]);
	const filters = useMemo(() => availableFilters(index), [index]);
	const visibleIndex = useMemo(
		() => index.filter((item) => matchesFilters(item, activeFilters)),
		[index, activeFilters],
	);
	const stats = useMemo(
		() =>
			data
				? cacheStats(data)
				: { venues: 0, venuesWithData: 0, items: 0, updatedAt: null },
		[data],
	);

	const fallbackName = useMemo(
		() =>
			visibleIndex.find((item) =>
				item.name.toLowerCase().includes(DEFAULT_ITEM_HINT),
			)?.name ??
			visibleIndex[0]?.name ??
			null,
		[visibleIndex],
	);

	// resolve "untouched" to the fallback item, once the data is there
	const resolvedBasket = useMemo(
		() => basket ?? (fallbackName ? [{ name: fallbackName, qty: 1 }] : []),
		[basket, fallbackName],
	);
	const singleName =
		resolvedBasket.length === 1 ? (resolvedBasket[0]?.name ?? null) : null;

	// dietary filters only make sense when a round item actually carries a tag
	const dietaryRelevant = useMemo(() => {
		if (!data) {
			return false;
		}
		const types = new Set(["Vegan", "Vegetarian", "under500", "5fat"]);
		return resolvedBasket.some((item) =>
			(data.items[item.name]?.keywords ?? []).some((keyword) =>
				types.has(keyword.type ?? ""),
			),
		);
	}, [data, resolvedBasket]);

	const priced = useMemo(
		() =>
			data && resolvedBasket.length ? basketVenues(data, resolvedBasket) : [],
		[data, resolvedBasket],
	);

	// native mode: each pub keeps its own currency (switch between them)
	const currencies = useMemo(() => availableCurrencies(priced), [priced]);
	const effectiveCurrency =
		selectedCurrency &&
		currencies.some((option) => option.code === selectedCurrency)
			? selectedCurrency
			: (currencies.find((option) => option.code === "GBP")?.code ??
				currencies[0]?.code ??
				"GBP");
	const nativeVenues = useMemo(
		() => priced.filter((venue) => venue.currency === effectiveCurrency),
		[priced, effectiveCurrency],
	);

	// converted mode: everything into one currency, so EUR pubs show up too
	const convertTo = convertCurrency !== "native" ? convertCurrency : null;
	// `convert` silently returns the amount unchanged when a venue's own
	// currency is missing from the table, which would mix currencies - so only
	// convert when every pub can be converted.
	const allCurrenciesConvertible = priced.every((venue) =>
		canConvertTo(venue.currency, rates),
	);
	const converting = Boolean(
		convertTo && canConvertTo(convertTo, rates) && allCurrenciesConvertible,
	);
	const displayVenues = useMemo(() => {
		if (!(converting && convertTo)) {
			return nativeVenues;
		}
		return priced.map((venue) => {
			const rate = convert(1, venue.currency, convertTo, rates);
			return {
				...venue,
				price: convert(venue.price, venue.currency, convertTo, rates),
				previousPrice:
					venue.previousPrice != null
						? convert(venue.previousPrice, venue.currency, convertTo, rates)
						: null,
				// kcal/£ and £/unit both scale with the currency
				metricValue:
					venue.metricValue == null
						? null
						: venue.metricKind === "calorie"
							? venue.metricValue / rate
							: venue.metricValue * rate,
				lines: venue.lines.map((line) => ({
					...line,
					price: convert(line.price, venue.currency, convertTo, rates),
				})),
				currency: convertTo,
			};
		});
	}, [converting, convertTo, priced, nativeVenues, rates]);
	const displayCurrency =
		converting && convertTo ? convertTo : effectiveCurrency;

	// one place that knows how to show a price/metric in the display currency
	const targetCurrency = converting && convertTo ? convertTo : null;
	const format = useMemo<Formatter>(() => {
		const convertMoney = (value: number, from: string) =>
			targetCurrency ? convert(value, from, targetCurrency, rates) : value;
		const convertMetric = (kind: ValueKind, value: number, from: string) => {
			if (!targetCurrency) {
				return value;
			}
			const rate = convert(1, from, targetCurrency, rates);
			return kind === "calorie" ? value / rate : value * rate;
		};
		return {
			targetCurrency,
			convertMoney,
			convertMetric,
			money: (value, from) =>
				money(convertMoney(value, from), targetCurrency ?? from),
			metric: (kind, value, from) =>
				metricText(
					{ kind, value: convertMetric(kind, value, from) },
					targetCurrency ?? from,
				),
		};
	}, [targetCurrency, rates]);

	// only compare pubs that can serve every item of the round
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

	const itemMetric = useMemo(() => {
		if (!singleName) {
			return null;
		}
		const venue = completeVenues.find(
			(candidate) => candidate.metricKind && candidate.metricValue != null,
		);
		if (!venue?.metricKind || venue.metricValue == null) {
			return null;
		}
		return metricText(
			{ kind: venue.metricKind, value: venue.metricValue },
			displayCurrency,
		);
	}, [completeVenues, displayCurrency, singleName]);
	const trend = useMemo(
		() => (data && singleName ? itemTrend(data, singleName) : null),
		[data, singleName],
	);

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

	// optional drill-down from an area marker / the area panel
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
		: resolvedBasket.length > 1
			? `${resolvedBasket.reduce((sum, item) => sum + item.qty, 0)}-item round`
			: undefined;

	const premium = useMemo(() => {
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
		)} (${insight.specialCount} of ${
			insight.specialCount + insight.normalCount
		} pubs)`;
	}, [completeVenues, displayCurrency]);

	const areas = useMemo(() => areaStats(baseVenues), [baseVenues]);

	// pubs whose menu is not published at all - the panel lists every one,
	// whatever the map filters, while the grey markers follow the filters
	const unpricedAll = useMemo(() => {
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
	const unpricedMap = useMemo(
		() =>
			unpricedAll.filter((venue) => matchesVenueFilters(venue, venueFilters)),
		[unpricedAll, venueFilters],
	);
	const unpricedPoints = useMemo<MapPoint[]>(
		() =>
			unpricedMap.map((venue) => ({
				ref: venue.ref,
				name: venue.name,
				lat: venue.lat,
				lng: venue.lng,
				price: 0,
				currency: venue.currency,
				label: "no prices published",
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
		[unpricedMap],
	);

	// discovery: rare guest ales and new items
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
	const mapData = view === "area" ? areaPoints : withDistance;
	const mapScale = useMemo(
		() => makeScale(mapData.map((point) => point.price)),
		[mapData],
	);

	return {
		index,
		filters,
		visibleIndex,
		stats,
		fallbackName,
		resolvedBasket,
		singleName,
		dietaryRelevant,
		currencies,
		converting,
		displayCurrency,
		format,
		completeVenues,
		completeCount,
		partialCount,
		itemMetric,
		trend,
		openCount,
		specialCount,
		closedCount,
		facilityOptions,
		baseVenues,
		withDistance,
		nearby,
		scale,
		prices,
		medianPrice,
		hiddenCount,
		legendLabel,
		premium,
		areas,
		unpricedAll,
		unpricedPoints,
		rare,
		fresh,
		sellers,
		areaPoints,
		mapData,
		mapScale,
	};
};
