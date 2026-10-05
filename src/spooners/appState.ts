import { useCallback, useEffect, useMemo, useState } from "react";
import { type BasketItem, parseBasket, serializeBasket } from "./basket";
import { type MapView, UK_CENTER, UK_ZOOM } from "./mapView";
import type { SpoonersSettings } from "./settings";
import type { MapPoint } from "./types";
import { type readUrl, shareUrl, writeUrl } from "./url";

/** The query string as it stands. Not exported from `url.ts`; only used here. */
type UrlState = ReturnType<typeof readUrl>;

/**
 * The round as edited, with the one-level undo a clear or a replace earns.
 *
 * `null` is not "empty": it means the visitor has not touched the round, which
 * the view resolves to the fallback item once the data arrives. Keeping the two
 * apart is what lets a shared link land on a round without that round becoming
 * the thing a later "Clear" compares against.
 *
 * The undo entries need the *resolved* round, which only exists after the view
 * has run, so the two handlers that write one take it as an argument rather
 * than closing over state this hook does not own. `null` is never written back:
 * the view resolves it on every render and every mutation starts from the same
 * fallback, so resolving it into state as well would only add a render.
 */
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

	/**
	 * Replace the whole round with one item. The undo entry is written only when
	 * the round would actually change, so re-choosing the item already in the
	 * round does not leave a "Round replaced" banner offering to undo nothing.
	 */
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

/** The round's own state and handlers, as `useRound` returns them. */
type RoundState = ReturnType<typeof useRound>;

/**
 * The round's handlers, already bound to the round on screen.
 *
 * Every mutation needs two things the round hook cannot see: the *resolved*
 * round (what a clear would undo) and the landing default (what an untouched
 * round resolves to). Binding them once here keeps that pairing out of every
 * call site, and keeps the identities stable, which the round card relies on.
 */
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
			// Replacing the round is a move back to the pub view: an area or
			// ranking chosen for the old round says nothing about the new one.
			replace: (name: string) => {
				replace(name, resolved);
				setView("pubs");
			},
		}),
		[add, setQty, remove, clear, replace, resolved, fallback, setView],
	);
};

/** The round a shared link asked for, or `null` for "not touched yet". */
export const roundFromUrl = (url: UrlState): BasketItem[] | null => {
	const fromRound = parseBasket(url.round ?? null);
	if (fromRound.length) {
		return fromRound;
	}
	return url.item ? [{ name: url.item, qty: 1 }] : null;
};

/** The round an untouched visit lands on: the one item the data suggests. */
export const fallbackRound = (fallbackName: string | null): BasketItem[] =>
	fallbackName ? [{ name: fallbackName, qty: 1 }] : [];

/** The map mode a shared link asked for. Anything else means the pub view. */
const mapViewFromUrl = (url: UrlState): MapView =>
	url.view === "area" ? "area" : "pubs";

/**
 * The four selections a shared link can set: which currency to show, which pub
 * to open, which area to narrow to, and which map mode.
 *
 * Seeded from the URL once and then owned by the app, because they are choices
 * the visitor makes afterwards: reading them straight from the URL on every
 * render would undo the first click.
 */
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
	/** Adopt the switches the settings dialog just changed. */
	applySettings: (next: SpoonersSettings) => void;
};

/**
 * The filters, seeded from the link and falling back to the saved settings.
 *
 * Each is separate state rather than one filter object because the round card
 * binds each one to its own control, and a filter object would hand every
 * control a new identity on every keystroke elsewhere in the card.
 */
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

	/**
	 * Settings own the same four switches, so a change made in the dialog has
	 * to reach the round card too or the two would disagree on screen.
	 */
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

/**
 * The pub a shared link named, once the data has produced it.
 *
 * Derived rather than pushed into state: the link is fixed at load, so an
 * effect would only ever write it once and cost an extra render to do so. A
 * click on the map or a ranking outranks it, which is why the caller reads this
 * only when it has no focus of its own.
 */
export const linkedVenue = (
	url: UrlState,
	withDistance: MapPoint[],
): MapPoint | null => {
	if (url.venue == null) {
		return null;
	}
	return withDistance.find((venue) => venue.ref === url.venue) ?? null;
};

/**
 * Choosing an area, from either end: a marker on the map, or a row in the
 * by-area panel. Both resolve to the same two things — the filter, and the
 * marker to focus — and differ only in which mode the map then shows.
 */
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

/** Where the browser thinks the visitor is, and how that was established. */
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

/** The map's centre and zoom, plus the shared link's, if it carried any. */
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

/**
 * The address bar as a mirror of the app, and the "copy link" that shares it.
 *
 * Only what differs from the landing defaults is written, so a shared link
 * stays short and a visitor who opens one lands on the same view rather than on
 * a frozen copy of every default.
 */
export const useUrlSync = (input: UrlSyncInput) => {
	const [copied, setCopied] = useState(false);

	// The URL only carries what differs from the landing defaults.
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

	// The clipboard is unavailable over plain http and can be refused by a
	// permission policy, so a prompt is the fallback rather than a dead button.
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

/** The palette's entries live in `commands.tsx`, which may hold JSX. */
