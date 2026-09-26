export type SpoonersItem = {
	id: number;
	name: string;
	menu: string | null;
	category: string | null;
	description: string | null;
	portion: string | null;
};

type SpoonersVenue = {
	id: number;
	ref: number;
	name: string;
	lat: number;
	lng: number;
	line1: string | null;
	town: string | null;
	county: string | null;
	postcode: string | null;
	type: string | null;
	isClosed: boolean | null;
	status: string | null;
	prices: [number, number][];
};

export type SpoonersDataset = {
	generatedAt: string;
	currency: string;
	venueCount: number;
	itemCount: number;
	items: SpoonersItem[];
	itemAvailability: Record<string, number>;
	venues: SpoonersVenue[];
	errors: string[];
};

/** A venue with the price of the currently selected item resolved. */
export type PricedVenue = {
	ref: number;
	name: string;
	lat: number;
	lng: number;
	town: string | null;
	postcode: string | null;
	isClosed: boolean;
	price: number;
};
