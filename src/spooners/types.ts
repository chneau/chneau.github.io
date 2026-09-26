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

/** A venue with the price of the currently selected item resolved. */
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
	/** Canonical price (the pint, else the largest portion). */
	price: number;
	portion: string;
	portions: Record<string, number>;
	/** ISO code this venue prices in (GBP, EUR...). */
	currency: string;
	/** Today's opening state, from the venue detail. */
	isOpenNow: boolean;
	hoursToday: string | null;
	facilities: string[];
	phone: string | null;
	/** Miles from the user, only when they shared their location. */
	distance?: number;
};
