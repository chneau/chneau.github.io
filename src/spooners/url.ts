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

/** "1" -> true, "0" -> false, absent -> undefined (use the default). */
const bool = (params: URLSearchParams, key: string): boolean | undefined => {
	const value = params.get(key);
	return value == null ? undefined : value === "1";
};

export const readUrl = (): UrlState => {
	const params = new URLSearchParams(window.location.search);
	return {
		item: params.get("item") ?? undefined,
		portion: params.get("portion") ?? undefined,
		cur: params.get("cur") ?? undefined,
		filters: list(params, "filters"),
		facilities: list(params, "facilities"),
		open: bool(params, "open"),
		special: bool(params, "special"),
		closed: bool(params, "closed"),
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
	const putBool = (key: string, value: boolean | undefined) => {
		if (value === true) params.set(key, "1");
		else if (value === false) params.set(key, "0");
	};
	putBool("open", state.open);
	putBool("special", state.special);
	putBool("closed", state.closed);
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
