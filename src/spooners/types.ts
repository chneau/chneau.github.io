/**
 * Shapes of `.api-cache/data.json` (the deduplicated cache produced by
 * `build_map_data.py`), plus the view-model types the UI works with.
 *
 * The cache keeps each item's definition once (`items`) and, per venue, only
 * that venue's prices (`venues[ref].items[itemName][portion] = price`).
 */

// --------------------------------------------------------------------------- #
// raw API objects                                                                #
// --------------------------------------------------------------------------- #

type Keyword = {
	type?: string;
	name?: string;
	id?: string | number;
	label?: string;
	value?: unknown;
	isFlag?: boolean;
	isBadge?: boolean;
	isAddOn?: boolean;
	icon?: string;
	iconUrl?: string;
	tags?: unknown;
};

type ItemOption = {
	id?: string | number;
	label?: string;
	name?: string;
	description?: string;
	calories?: number | null;
	price?: number;
	initialPrice?: number;
	currency?: string;
	discount?: number;
	keywords?: string[];
};

type ItemDefinition = {
	id: number | string;
	name: string;
	description: string | null;
	calories: number | null;
	itemType: string | null;
	ageRestriction: number | null;
	/** Only present on items that sit in a multi-course menu. */
	courseId?: number | null;
	category: string | null;
	menu: string | null;
	keywords: Keyword[];
	/** `portion` always exists; other groups (`tags`, `addOns`, ...) vary. */
	optionGroups: Record<string, ItemOption[]>;
};

type VenueLocation = {
	latitude: number;
	longitude: number;
	distanceTolerance?: number;
};

type VenueAddress = {
	line1?: string | null;
	line2?: string | null;
	line3?: string | null;
	town?: string | null;
	county?: string | null;
	postcode?: string | null;
	country?: { name?: string; code?: string } | null;
	location?: VenueLocation | null;
	/** Present when the API is queried with coordinates. */
	distance?: number;
};

type VenueInfo = {
	franchise?: string;
	id: number;
	venueRef: number;
	name: string;
	status?: string | null;
	subType?: string | null;
	address?: VenueAddress | null;
	hotel?: unknown;
	type?: string | null;
	isClosed?: boolean | null;
	closureDates?: unknown;
	selectHandler?: { type?: string } | null;
};

type VenueMenu = {
	id?: string;
	name?: string;
	description?: string;
	sortOrder?: number;
};

/** The venue detail endpoint: we only read a few fields, keep the rest as-is. */
type VenueDetail = {
	[field: string]: unknown;
};

type VenueEntry = {
	venue: VenueInfo;
	detail: VenueDetail | null;
	menus: VenueMenu[];
	/** item name -> portion label -> price */
	items: Record<string, Record<string, number>>;
	fetchedAt?: string;
	error?: string;
};

// --------------------------------------------------------------------------- #
// cache file                                                                     #
// --------------------------------------------------------------------------- #

export type SpoonersCache = {
	venueList: VenueInfo[];
	items: Record<string, ItemDefinition>;
	venues: Record<string, VenueEntry>;
	fetchedAt?: string;
};

// --------------------------------------------------------------------------- #
// view model                                                                     #
// --------------------------------------------------------------------------- #

/** One searchable entry in the item picker. */
export type ItemInfo = {
	name: string;
	menu: string | null;
	category: string | null;
	description: string | null;
	calories: number | null;
	keywords: Keyword[];
	/** How many venues currently sell it. */
	count: number;
};

export type CacheStats = {
	venues: number;
	venuesWithData: number;
	items: number;
	updatedAt: string | null;
};

/** A venue with the price of the currently selected item resolved. */
export type PricedVenue = {
	ref: number;
	name: string;
	lat: number;
	lng: number;
	town: string | null;
	county: string | null;
	postcode: string | null;
	type: string | null;
	isClosed: boolean;
	/** Canonical price (the pint, else the largest portion). */
	price: number;
	portion: string;
	portions: Record<string, number>;
};
