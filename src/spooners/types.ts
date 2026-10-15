import { z } from "zod";

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
	courseId?: number | null;
	category: string | null;
	menu: string | null;
	keywords: Keyword[];
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
	days?: Record<string, OpeningDay>;
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

export type VenueDetail = {
	facilities?: string[] | null;
	openingTimes?: OpeningTimes | null;
	contactDetails?: ContactDetails | null;
	paymentConfig?: { methods?: Record<string, PaymentMethod> } | null;
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
	items: Record<string, Record<string, number>>;
	fetchedAt?: string;
	error?: string;
};

export type HistoryPoint = {
	t: string;
	median: number;
	min: number;
	max: number;
	n: number;
};

type DatasetHistory = {
	items?: Record<string, HistoryPoint[]>;
	venues?: Record<string, Record<string, [string, number][]>>;
};

const SpoonersCacheSchema = z.object({
	venueList: z.array(z.custom<VenueInfo>()),
	items: z.record(z.string(), z.custom<ItemDefinition>()),
	venues: z.record(z.string(), z.custom<VenueEntry>()),
	fetchedAt: z.string().optional(),
	history: z.custom<DatasetHistory>().optional(),
});

export type SpoonersCache = z.infer<typeof SpoonersCacheSchema>;

export const parseSpoonersCache = (value: unknown): SpoonersCache | null => {
	const result = SpoonersCacheSchema.safeParse(value);
	return result.success ? result.data : null;
};

export type ItemInfo = {
	name: string;
	menu: string | null;
	category: string | null;
	description: string | null;
	calories: number | null;
	keywords: Keyword[];
	count: number;
	nature: ItemNature;
	trend: number | null;
};

export type ItemNature = "beer" | "wine" | "spirit" | "soft" | "food" | "other";

export type CacheStats = {
	venues: number;
	venuesWithData: number;
	items: number;
	updatedAt: string | null;
};

export type VenueSpot =
	| "high-street"
	| "airport"
	| "haven"
	| "concession"
	| "hotel";

export type VenuePriceLine = {
	name: string;
	portion: string;
	price: number;
	metricKind: ValueKind | null;
	metricValue: number | null;
};

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
	spot: VenueSpot;
	canOrder: boolean;
	isClosed: boolean;
	status: string | null;
	price: number;
	portion: string;
	lines: VenuePriceLine[];
	missing: string[];
	images: string[];
	currency: string;
	isOpenNow: boolean;
	hoursToday: string | null;
	facilities: string[];
	phone: string | null;
	metricKind: ValueKind | null;
	metricValue: number | null;
	previousPrice: number | null;
	distance?: number;
};

export type ValueKind = "unit" | "volume" | "calorie";

export type Formatter = {
	money: (value: number, currency: string) => string;
	metric: (kind: ValueKind, value: number, currency: string) => string;
	targetCurrency: string | null;
	convertMoney: (value: number, currency: string) => number;
	convertMetric: (kind: ValueKind, value: number, currency: string) => number;
};

export type MapPoint = {
	ref: number;
	name: string;
	lat: number;
	lng: number;
	price: number;
	currency: string;
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
	kind?: "pub" | "area";
	previousPrice?: number | null;
	previousAt?: string | null;
	images?: string[];
};

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
	reason: string | null;
	images: string[];
	distance?: number;
};
