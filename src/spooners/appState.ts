import { useCallback, useEffect, useMemo, useState } from "react";
import { type BasketItem, parseBasket, serializeBasket } from "./basket";
import { type MapView, UK_CENTER, UK_ZOOM } from "./mapView";
import type { SpoonersSettings } from "./settings";
import type { MapPoint } from "./types";
import { type readUrl, shareUrl, writeUrl } from "./url";

type UrlState = ReturnType<typeof readUrl>;

export const useRound = (initial: BasketItem[] | null) => {
	const [basket, setBasket] = useState<BasketItem[] | null>(initial);
	const [undo, setUndo] = useState<{
		basket: BasketItem[];
		text: string;
	} | null>(null);

	const update = useCallback(
		(
			change: (current: BasketItem[]) => BasketItem[],
			fallback: BasketItem[],
		) => {
			setUndo(null);
			setBasket((current) => change(current ?? fallback));
		},
		[],
	);

	const add = useCallback(
		(name: string, fallback: BasketItem[]) =>
			update((current) => {
				const existing = current.find((item) => item.name === name);
				if (existing) {
					return current.map((item) =>
						item.name === name ? { ...item, qty: item.qty + 1 } : item,
					);
				}
				return [...current, { name, qty: 1 }];
			}, fallback),
		[update],
	);

	const setQty = useCallback(
		(name: string, qty: number, fallback: BasketItem[]) =>
			update(
				(current) =>
					current
						.map((item) => (item.name === name ? { ...item, qty } : item))
						.filter((item) => item.qty > 0),
				fallback,
			),
		[update],
	);

	const remove = useCallback(
		(name: string, fallback: BasketItem[]) =>
			update(
				(current) => current.filter((item) => item.name !== name),
				fallback,
			),
		[update],
	);

	const clear = useCallback((resolved: BasketItem[]) => {
		setUndo({ basket: resolved, text: "Round cleared" });
		setBasket([]);
	}, []);

	const restore = useCallback(() => {
		if (!undo) {
			return;
		}
		setBasket(undo.basket);
		setUndo(null);
	}, [undo]);

	const replace = useCallback((name: string, resolved: BasketItem[]) => {
		const already =
			resolved.length === 1 &&
			resolved[0]?.name === name &&
			resolved[0]?.qty === 1;
		if (already || !resolved.length) {
			setUndo(null);
		} else {
			setUndo({ basket: resolved, text: "Round replaced" });
		}
		setBasket([{ name, qty: 1 }]);
	}, []);

	return {
		basket,
		undo,
		undoText: undo?.text ?? null,
		update,
		add,
		setQty,
		remove,
		clear,
		restore,
		replace,
	};
};

type RoundState = ReturnType<typeof useRound>;

export const useRoundActions = (
	round: RoundState,
	resolved: BasketItem[],
	fallback: BasketItem[],
	setView: (view: MapView) => void,
) => {
	const { add, setQty, remove, clear, replace } = round;
	return useMemo(
		() => ({
			add: (name: string) => add(name, fallback),
			setQty: (name: string, qty: number) => setQty(name, qty, fallback),
			remove: (name: string) => remove(name, fallback),
			clear: () => clear(resolved),
			replace: (name: string) => {
				replace(name, resolved);
				setView("pubs");
			},
		}),
		[add, setQty, remove, clear, replace, resolved, fallback, setView],
	);
};

export const roundFromUrl = (url: UrlState): BasketItem[] | null => {
	const fromRound = parseBasket(url.round ?? null);
	if (fromRound.length) {
		return fromRound;
	}
	return url.item ? [{ name: url.item, qty: 1 }] : null;
};

export const fallbackRound = (fallbackName: string | null): BasketItem[] =>
	fallbackName ? [{ name: fallbackName, qty: 1 }] : [];

const mapViewFromUrl = (url: UrlState): MapView =>
	url.view === "area" ? "area" : "pubs";

export const useLinkedSelections = (url: UrlState) => {
	const [selectedCurrency, setSelectedCurrency] = useState<string | null>(
		url.cur ?? null,
	);
	const [venueRef, setVenueRef] = useState<number | null>(url.venue ?? null);
	const [areaFilter, setAreaFilter] = useState<string | null>(url.area ?? null);
	const [view, setView] = useState<MapView>(() => mapViewFromUrl(url));
	return {
		selectedCurrency,
		setSelectedCurrency,
		venueRef,
		setVenueRef,
		areaFilter,
		setAreaFilter,
		view,
		setView,
	};
};

type FilterState = {
	activeFilters: string[];
	setActiveFilters: (ids: string[]) => void;
	activeFacilities: string[];
	setActiveFacilities: (labels: string[]) => void;
	openNowOnly: boolean;
	setOpenNowOnly: (value: boolean) => void;
	hideSpecial: boolean;
	setHideSpecial: (value: boolean) => void;
	hideClosed: boolean;
	setHideClosed: (value: boolean) => void;
	onlyComplete: boolean;
	setOnlyComplete: (value: boolean) => void;
	resetFilters: () => void;
	applySettings: (next: SpoonersSettings) => void;
};

export const useFilters = (
	url: UrlState,
	settings: SpoonersSettings,
): FilterState => {
	const [activeFilters, setActiveFilters] = useState<string[]>(
		url.filters ?? [],
	);
	const [activeFacilities, setActiveFacilities] = useState<string[]>(
		url.facilities ?? [],
	);
	const [openNowOnly, setOpenNowOnly] = useState(url.open ?? settings.openNow);
	const [hideSpecial, setHideSpecial] = useState(
		url.special ?? settings.hideSpecial,
	);
	const [hideClosed, setHideClosed] = useState(
		url.closed ?? settings.hideClosed,
	);
	const [onlyComplete, setOnlyComplete] = useState(
		url.complete ?? settings.onlyComplete,
	);

	const resetFilters = useCallback(() => {
		setActiveFilters([]);
		setActiveFacilities([]);
		setOpenNowOnly(settings.openNow);
		setHideSpecial(settings.hideSpecial);
		setHideClosed(settings.hideClosed);
		setOnlyComplete(settings.onlyComplete);
	}, [
		settings.openNow,
		settings.hideSpecial,
		settings.hideClosed,
		settings.onlyComplete,
	]);

	const applySettings = useCallback(
		(next: SpoonersSettings) => {
			if (next.openNow !== settings.openNow) {
				setOpenNowOnly(next.openNow);
			}
			if (next.hideSpecial !== settings.hideSpecial) {
				setHideSpecial(next.hideSpecial);
			}
			if (next.hideClosed !== settings.hideClosed) {
				setHideClosed(next.hideClosed);
			}
			if (next.onlyComplete !== settings.onlyComplete) {
				setOnlyComplete(next.onlyComplete);
			}
		},
		[
			settings.openNow,
			settings.hideSpecial,
			settings.hideClosed,
			settings.onlyComplete,
		],
	);

	return {
		activeFilters,
		setActiveFilters,
		activeFacilities,
		setActiveFacilities,
		openNowOnly,
		setOpenNowOnly,
		hideSpecial,
		setHideSpecial,
		hideClosed,
		setHideClosed,
		onlyComplete,
		setOnlyComplete,
		resetFilters,
		applySettings,
	};
};

export const linkedVenue = (
	url: UrlState,
	withDistance: MapPoint[],
): MapPoint | null => {
	if (url.venue == null) {
		return null;
	}
	return withDistance.find((venue) => venue.ref === url.venue) ?? null;
};

export const useAreaSelection = ({
	areaPoints,
	setAreaFilter,
	setSelectedArea,
	setView,
	setFocused,
}: {
	areaPoints: MapPoint[];
	setAreaFilter: (name: string | null) => void;
	setSelectedArea: (name: string | null) => void;
	setView: (view: MapView) => void;
	setFocused: (point: MapPoint) => void;
}) => {
	const focusArea = useCallback(
		(name: string) => {
			const point = areaPoints.find((candidate) => candidate.name === name);
			if (point) {
				setFocused(point);
			}
		},
		[areaPoints, setFocused],
	);

	const openArea = useCallback(
		(name: string) => {
			setAreaFilter(name);
			setView("pubs");
			focusArea(name);
		},
		[setAreaFilter, setView, focusArea],
	);

	const selectArea = useCallback(
		(stat: { area: string }) => {
			setSelectedArea(stat.area);
			setView("area");
			focusArea(stat.area);
		},
		[setSelectedArea, setView, focusArea],
	);

	return { openArea, selectArea };
};

export const useUserLocation = () => {
	const [userLocation, setUserLocation] = useState<{
		lat: number;
		lng: number;
	} | null>(null);
	const [geoState, setGeoState] = useState<"idle" | "loading" | "error">(
		"idle",
	);

	const requestLocation = useCallback(() => {
		if (!navigator.geolocation) {
			setGeoState("error");
			return;
		}
		setGeoState("loading");
		navigator.geolocation.getCurrentPosition(
			(position) => {
				setUserLocation({
					lat: position.coords.latitude,
					lng: position.coords.longitude,
				});
				setGeoState("idle");
			},
			() => setGeoState("error"),
			{ timeout: 8000 },
		);
	}, []);

	const clearLocation = useCallback(() => setUserLocation(null), []);

	return { userLocation, geoState, requestLocation, clearLocation };
};

export const useMapViewport = (url: UrlState) => {
	const [mapView, setMapView] = useState<{
		center: [number, number];
		zoom: number;
	} | null>(
		url.lat != null && url.lng != null && url.z != null
			? { center: [url.lat, url.lng], zoom: url.z }
			: null,
	);
	const setViewport = useCallback(
		(center: [number, number], zoom: number) => setMapView({ center, zoom }),
		[],
	);
	return { mapView, setViewport };
};

type UrlSyncInput = {
	isDefaultBasket: boolean;
	resolvedBasket: BasketItem[];
	selectedCurrency: string | null;
	activeFilters: string[];
	activeFacilities: string[];
	openNowOnly: boolean;
	hideSpecial: boolean;
	hideClosed: boolean;
	onlyComplete: boolean;
	settings: SpoonersSettings;
	venueRef: number | null;
	view: MapView;
	areaFilter: string | null;
	mapView: { center: [number, number]; zoom: number } | null;
};

export const useUrlSync = (input: UrlSyncInput) => {
	const [copied, setCopied] = useState(false);

	const atDefaultView =
		!input.mapView ||
		(Math.abs(input.mapView.center[0] - UK_CENTER[0]) < 0.05 &&
			Math.abs(input.mapView.center[1] - UK_CENTER[1]) < 0.05 &&
			Math.abs(input.mapView.zoom - UK_ZOOM) < 0.05);
	const urlState = useMemo(
		() => ({
			round: input.isDefaultBasket
				? undefined
				: serializeBasket(input.resolvedBasket) || undefined,
			cur: input.selectedCurrency ?? undefined,
			filters: input.activeFilters,
			facilities: input.activeFacilities,
			open:
				input.openNowOnly !== input.settings.openNow
					? input.openNowOnly
					: undefined,
			special:
				input.hideSpecial !== input.settings.hideSpecial
					? input.hideSpecial
					: undefined,
			closed:
				input.hideClosed !== input.settings.hideClosed
					? input.hideClosed
					: undefined,
			complete:
				input.onlyComplete !== input.settings.onlyComplete
					? input.onlyComplete
					: undefined,
			venue: input.venueRef ?? undefined,
			view: input.view,
			area: input.areaFilter ?? undefined,
			lat: atDefaultView ? undefined : input.mapView?.center[0],
			lng: atDefaultView ? undefined : input.mapView?.center[1],
			z: atDefaultView ? undefined : input.mapView?.zoom,
		}),
		[
			input.isDefaultBasket,
			input.resolvedBasket,
			input.selectedCurrency,
			input.activeFilters,
			input.activeFacilities,
			input.openNowOnly,
			input.hideSpecial,
			input.hideClosed,
			input.onlyComplete,
			input.settings.openNow,
			input.settings.hideSpecial,
			input.settings.hideClosed,
			input.settings.onlyComplete,
			input.venueRef,
			input.view,
			input.areaFilter,
			atDefaultView,
			input.mapView,
		],
	);

	useEffect(() => {
		writeUrl(urlState);
	}, [urlState]);

	const copyShare = useCallback(async () => {
		const link = shareUrl(urlState);
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			window.prompt("Copy this link", link);
		}
	}, [urlState]);

	return { copied, copyShare };
};
