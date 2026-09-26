/**
 * The URL is the app's state: everything that changes what you see is encoded
 * in the query string, so any view can be shared or bookmarked.
 */

type UrlState = {
	item?: string;
	portion?: string;
	cur?: string;
	filters?: string[];
	facilities?: string[];
	open?: boolean;
	special?: boolean;
	closed?: boolean;
	/** Serialised round, e.g. "Guinness:2,Budweiser:1". */
	round?: string;
	/** Focused venue ref. */
	venue?: number;
	/** Map/ranking mode: "item" | "round" | "area". */
	view?: string;
	lat?: number;
	lng?: number;
	z?: number;
};

const list = (params: URLSearchParams, key: string): string[] | undefined => {
	const value = params.get(key);
	if (!value) {
		return undefined;
	}
	const parts = value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
	return parts.length ? parts : undefined;
};

const number = (params: URLSearchParams, key: string): number | undefined => {
	const value = params.get(key);
	if (value == null) {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
};

export const readUrl = (): UrlState => {
	const params = new URLSearchParams(window.location.search);
	return {
		item: params.get("item") ?? undefined,
		portion: params.get("portion") ?? undefined,
		cur: params.get("cur") ?? undefined,
		filters: list(params, "filters"),
		facilities: list(params, "facilities"),
		open: params.get("open") === "1" ? true : undefined,
		special: params.get("special") === "1" ? true : undefined,
		closed: params.get("closed") === "1" ? true : undefined,
		round: params.get("round") ?? undefined,
		venue: number(params, "venue"),
		view: params.get("view") ?? undefined,
		lat: number(params, "lat"),
		lng: number(params, "lng"),
		z: number(params, "z"),
	};
};

const buildQuery = (state: UrlState): string => {
	const params = new URLSearchParams();
	const put = (key: string, value: string | number | undefined) => {
		if (value != null && value !== "") {
			params.set(key, String(value));
		}
	};
	put("item", state.item);
	put("portion", state.portion);
	put("cur", state.cur);
	put("filters", state.filters?.join(","));
	put("facilities", state.facilities?.join(","));
	if (state.open) params.set("open", "1");
	if (state.special) params.set("special", "1");
	if (state.closed) params.set("closed", "1");
	put("round", state.round);
	put("venue", state.venue);
	put("view", state.view === "item" ? undefined : state.view);
	if (state.lat != null && state.lng != null && state.z != null) {
		params.set("lat", state.lat.toFixed(4));
		params.set("lng", state.lng.toFixed(4));
		params.set("z", state.z.toFixed(1));
	}
	const query = params.toString();
	return query ? `?${query}` : "";
};

export const writeUrl = (state: UrlState): void => {
	const url = `${window.location.pathname}${buildQuery(state)}`;
	window.history.replaceState(null, "", url);
};

export const shareUrl = (state: UrlState): string =>
	`${window.location.origin}${window.location.pathname}${buildQuery(state)}`;
