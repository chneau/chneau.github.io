import { useMemo } from "react";
import { type BasketItem, basketVenues } from "./basket";
import {
	availableFilters,
	buildItemIndex,
	cacheStats,
	itemTrend,
	matchesFilters,
} from "./derive";
import { metricText } from "./portions";
import { makeScale } from "./price";
import type { RateTable } from "./rates";
import type { SpoonersCache } from "./types";
import { usePricedVenues } from "./usePricedVenues";
import {
	premiumInsight,
	useAreaLayers,
	useDiscovery,
	useUnpricedVenues,
	useVenueFilter,
} from "./useVenueSets";

const DEFAULT_ITEM_HINT = "guinness";

/**
 * Everything the app derives from the round and the filters. Exported because
 * `ResultsSidebar` renders it and nothing else: naming the contract keeps that
 * panel honest about what it is.
 */
export type SpoonersView = ReturnType<typeof useSpoonersView>;

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
 *
 * Composed of narrower hooks — one currency mode, one filter pass, one map —
 * so each is read on its own rather than as one 400-line body. They are called
 * unconditionally and in order, and `useSpoonersView` just hands their results
 * on: this stays the single entry point the app imports.
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

	const { currencies, converting, displayCurrency, displayVenues, format } =
		usePricedVenues({ priced, selectedCurrency, convertCurrency, rates });

	const filtered = useVenueFilter({
		displayVenues,
		onlyComplete,
		openNowOnly,
		hideSpecial,
		hideClosed,
		activeFacilities,
		areaFilter,
		userLocation,
		singleName,
		roundQty: resolvedBasket.reduce((sum, item) => sum + item.qty, 0),
	});

	const itemMetric = useMemo(() => {
		if (!singleName) {
			return null;
		}
		const venue = filtered.completeVenues.find(
			(candidate) => candidate.metricKind && candidate.metricValue != null,
		);
		if (!venue?.metricKind || venue.metricValue == null) {
			return null;
		}
		return metricText(
			{ kind: venue.metricKind, value: venue.metricValue },
			displayCurrency,
		);
	}, [filtered.completeVenues, displayCurrency, singleName]);
	const trend = useMemo(
		() => (data && singleName ? itemTrend(data, singleName) : null),
		[data, singleName],
	);

	const premium = useMemo(
		() => premiumInsight(filtered.completeVenues, displayCurrency),
		[filtered.completeVenues, displayCurrency],
	);

	const { all: unpricedAll, points: unpricedPoints } = useUnpricedVenues({
		data,
		userLocation,
		venueFilters: filtered.venueFilters,
	});
	const { rare, fresh, sellers } = useDiscovery({
		visibleIndex,
		data,
		userLocation,
	});
	const { areas, areaPoints } = useAreaLayers({
		baseVenues: filtered.baseVenues,
		displayCurrency,
	});

	const mapData = view === "area" ? areaPoints : filtered.withDistance;
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
		completeVenues: filtered.completeVenues,
		completeCount: filtered.completeCount,
		partialCount: filtered.partialCount,
		itemMetric,
		trend,
		openCount: filtered.openCount,
		specialCount: filtered.specialCount,
		closedCount: filtered.closedCount,
		facilityOptions: filtered.facilityOptions,
		withDistance: filtered.withDistance,
		nearby: filtered.nearby,
		scale: filtered.scale,
		prices: filtered.prices,
		medianPrice: filtered.medianPrice,
		hiddenCount: filtered.hiddenCount,
		legendLabel: filtered.legendLabel,
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
