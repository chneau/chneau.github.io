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

export type Keyword = {
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
	iconColor?: string;
	tags?: unknown;
};

export type ItemOption = {
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

export type ItemDefinition = {
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

export type VenueInfo = {
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

type OpeningDay = {
	open?: string | null;
	close?: string | null;
	label?: string | null;
	isClosed?: boolean | null;
};

type OpeningTimes = {
	/** keyed mon..sun */
	days?: Record<string, OpeningDay>;
	/** keyed YYYY-MM-DD (holidays/one-offs) */
	dates?: Record<string, OpeningDay>;
	children?: unknown;
};

type ContactDetails = {
	email?: string;
	telephone?: string;
	website?: string;
};

type PaymentMethod = {
	label?: string;
	name?: string;
	enabled?: boolean;
};

type CurrencyInfo = {
	code?: string;
	currencyCode?: string;
	countryCode?: string;
	symbol?: string;
	htmlName?: string;
	htmlNumber?: string;
};

/** The venue detail endpoint: fields we read are typed, the rest kept as-is. */
export type VenueDetail = {
	facilities?: string[] | null;
	openingTimes?: OpeningTimes | null;
	contactDetails?: ContactDetails | null;
	paymentConfig?: { methods?: Record<string, PaymentMethod> } | null;
	/** GBP for Great Britain, EUR for the pubs in the Republic of Ireland. */
	currency?: CurrencyInfo | null;
	displayImages?: unknown;
	allergensUrl?: string | null;
	canPlaceOrder?: boolean | null;
	orderingEnabled?: boolean | null;
	employeeDiscountAllowed?: boolean | null;
	comingSoon?: boolean | null;
	isClosed?: boolean | null;
	closureDates?: unknown;
	menuUrl?: { dairyFree?: string | null; glutenFree?: string | null } | null;
	/** Meal-deal drink offsets, e.g. how much a "meal + drink" adds. */
	pricing?: { includeDrink?: { offset?: number; wineOffset?: number } } | null;
	salesAreas?:
		| { id?: number; name?: string; description?: string | null }[]
		| null;
	franchise?: string | null;
	thumbnail?: string | null;
	[key: string]: unknown;
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
// price history                                                                  #
// --------------------------------------------------------------------------- #

/** One dated snapshot of an item's national price distribution. */
export type HistoryPoint = {
	/** ISO date, YYYY-MM-DD. */
	t: string;
	median: number;
	min: number;
	max: number;
	n: number;
};

/**
 * Optional price history kept by `build_map_data.py`: a national distribution
 * per item, plus a per-venue change log (only entries where the price changed).
 */
type DatasetHistory = {
	items?: Record<string, HistoryPoint[]>;
	/** ref -> item -> [date, price][] (only when the price changed). */
	venues?: Record<string, Record<string, [string, number][]>>;
};

// --------------------------------------------------------------------------- #
// cache file                                                                     #
// --------------------------------------------------------------------------- #

export type SpoonersCache = {
	venueList: VenueInfo[];
	items: Record<string, ItemDefinition>;
	venues: Record<string, VenueEntry>;
	fetchedAt?: string;
	history?: DatasetHistory;
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
	/** What kind of item it is (beer / wine / spirit / soft / food). */
	nature: ItemNature;
	/** Percent change of the national median vs the oldest snapshot. */
	trend: number | null;
};

/** What kind of item it is - used for portion and value rules. */
export type ItemNature = "beer" | "wine" | "spirit" | "soft" | "food" | "other";

export type CacheStats = {
	venues: number;
	venuesWithData: number;
	items: number;
	updatedAt: string | null;
};

/**
 * What kind of site a pub is. Airports/havens/concessions are captive-audience
 * venues and are usually priced above the high street.
 */
export type VenueSpot =
	| "high-street"
	| "airport"
	| "haven"
	| "concession"
	| "hotel";

/** One line of a round at one venue. */
export type VenuePriceLine = {
	name: string;
	portion: string;
	/** Unit price at this venue, in the venue's own currency. */
	price: number;
	metricKind: ValueKind | null;
	metricValue: number | null;
};

/**
 * A venue with the price of the current round resolved. A "round" can be a
 * single drink (the default), in which case the value metric and price history
 * are filled in as well.
 */
export type PricedVenue = {
	ref: number;
	name: string;
	lat: number;
	lng: number;
	line1: string | null;
	town: string | null;
	county: string | null;
	postcode: string | null;
	type: string | null;
	/** Airport / haven / concession / hotel / high street. */
	spot: VenueSpot;
	/** False for venues the app cannot take orders at (`selectHandler` "message"). */
	canOrder: boolean;
	isClosed: boolean;
	/** "open" | "closing_temporary" | "opening_soon" | ... */
	status: string | null;
	/** Canonical price for the whole round. */
	price: number;
	/** The single item's portion, or "N items" for a multi-item round. */
	portion: string;
	lines: VenuePriceLine[];
	/** Round items this venue does not sell. */
	missing: string[];
	/** Pub photos from the venue detail. */
	images: string[];
	/** ISO code this venue prices in (GBP, EUR...). */
	currency: string;
	/** Today's opening state, from the venue detail. */
	isOpenNow: boolean;
	hoursToday: string | null;
	facilities: string[];
	phone: string | null;
	/** The comparable metric for this portion (single-drink rounds only). */
	metricKind: ValueKind | null;
	metricValue: number | null;
	/** The price recorded before this one, when the history has an older entry. */
	previousPrice: number | null;
	/** Miles from the user, only when they shared their location. */
	distance?: number;
};

export type ValueKind = "unit" | "volume" | "calorie";

/** Currency-aware formatting shared by the modals. */
export type Formatter = {
	money: (value: number, currency: string) => string;
	/** Converts a value metric into the display currency before formatting. */
	metric: (kind: ValueKind, value: number, currency: string) => string;
	/** The ISO code everything is converted to, or null in "native" mode. */
	targetCurrency: string | null;
	/** Numeric conversions, for comparing/sorting rather than displaying. */
	convertMoney: (value: number, currency: string) => number;
	convertMetric: (kind: ValueKind, value: number, currency: string) => number;
};

/**
 * The minimum a map marker needs. `PricedVenue` satisfies it directly, and the
 * round calculator / area league map their own rows onto it.
 */
export type MapPoint = {
	ref: number;
	name: string;
	lat: number;
	lng: number;
	price: number;
	currency: string;
	/** What the price is for: "Pint", "200ml bottle", "round of 4", "Camden". */
	label?: string;
	line1: string | null;
	town: string | null;
	postcode: string | null;
	facilities: string[];
	phone: string | null;
	distance?: number;
	spot: VenueSpot;
	isClosed: boolean;
	isOpenNow: boolean;
	hoursToday: string | null;
	canOrder?: boolean;
	/** "area" for a county/town aggregate marker. */
	kind?: "pub" | "area";
	previousPrice?: number | null;
	previousAt?: string | null;
	/** Pub photos. */
	images?: string[];
};

/** A pub we know about but have no prices for (menu not published by the API). */
export type SparseVenue = {
	ref: number;
	name: string;
	lat: number;
	lng: number;
	town: string | null;
	county: string | null;
	postcode: string | null;
	spot: VenueSpot;
	status: string | null;
	isClosed: boolean;
	isOpenNow: boolean;
	hoursToday: string | null;
	facilities: string[];
	phone: string | null;
	currency: string;
	/** Why there are no prices, e.g. "no menus" or "no sales areas". */
	reason: string | null;
	/** Pub photos from the venue detail. */
	images: string[];
	distance?: number;
};
