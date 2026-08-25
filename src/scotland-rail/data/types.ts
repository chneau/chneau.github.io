export type Coordinate = [longitude: number, latitude: number];

export type Station = {
	id: string;
	name: string;
	coordinate: Coordinate;
	isMajor?: boolean;
};

export type RailPath = {
	id: string;
	name: string;
	coordinates: Coordinate[];
};

export type Category =
	| "Express"
	| "Highland"
	| "Commuter"
	| "CrossBorder"
	| "Sleeper";

type CategoryConfig = {
	category: Category;
	label: string;
	color: string;
	shape: "circle" | "diamond" | "square" | "triangle" | "hexagon";
};

export const CATEGORIES: Record<Category, CategoryConfig> = {
	Express: {
		category: "Express",
		label: "Central Belt Express",
		color: "#59d7ff", // Cyan
		shape: "circle",
	},
	Highland: {
		category: "Highland",
		label: "Highland & Scenic",
		color: "#a6e36a", // Lime Green
		shape: "diamond",
	},
	Commuter: {
		category: "Commuter",
		label: "Suburban / Commuter",
		color: "#ffba63", // Amber
		shape: "square",
	},
	CrossBorder: {
		category: "CrossBorder",
		label: "InterCity / Cross-Border",
		color: "#b347ff", // Purple
		shape: "triangle",
	},
	Sleeper: {
		category: "Sleeper",
		label: "Caledonian Sleeper",
		color: "#ff2bd6", // Magenta
		shape: "hexagon",
	},
};

type ServiceCall = {
	stationId: string;
	arrivalOffset: number | null; // minutes from 00:00
	departureOffset: number | null;
};

export type TrainService = {
	id: string;
	serviceNumber: string;
	name: string;
	category: Category;
	operator: string;
	rollingStock?: string;
	pathCoordinates: Coordinate[];
	calls: ServiceCall[];
};

export type ViewPreset = "scotland" | "central-belt" | "highlands";

export type Bounds = [west: number, south: number, east: number, north: number];

export const VIEW_BOUNDS: Record<ViewPreset, Bounds> = {
	scotland: [-7.8, 54.7, -1.6, 58.8],
	"central-belt": [-4.9, 55.6, -2.9, 56.2],
	highlands: [-6.5, 56.4, -3.4, 58.7],
};
