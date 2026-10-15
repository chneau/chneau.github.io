import { z } from "zod";
import { categoryColors, categoryInkColors } from "../theme";

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
	ink: string;
	shape: "circle" | "diamond" | "square" | "triangle" | "hexagon";
};

export const CATEGORIES: Record<Category, CategoryConfig> = {
	Express: {
		category: "Express",
		label: "Central Belt Express",
		color: categoryColors.Express,
		ink: categoryInkColors.Express,
		shape: "circle",
	},
	Highland: {
		category: "Highland",
		label: "Highland & Scenic",
		color: categoryColors.Highland,
		ink: categoryInkColors.Highland,
		shape: "diamond",
	},
	Commuter: {
		category: "Commuter",
		label: "Suburban / Commuter",
		color: categoryColors.Commuter,
		ink: categoryInkColors.Commuter,
		shape: "square",
	},
	CrossBorder: {
		category: "CrossBorder",
		label: "InterCity / Cross-Border",
		color: categoryColors.CrossBorder,
		ink: categoryInkColors.CrossBorder,
		shape: "triangle",
	},
	Sleeper: {
		category: "Sleeper",
		label: "Caledonian Sleeper",
		color: categoryColors.Sleeper,
		ink: categoryInkColors.Sleeper,
		shape: "hexagon",
	},
};

const CoordinateSchema = z.tuple([z.number(), z.number()]);

const ServiceCallSchema = z.object({
	stationId: z.string(),
	arrivalOffset: z.number().nullable(),
	departureOffset: z.number().nullable(),
});

const TrainServiceSchema = z.object({
	id: z.string(),
	serviceNumber: z.string(),
	name: z.string(),
	category: z.enum([
		"Express",
		"Highland",
		"Commuter",
		"CrossBorder",
		"Sleeper",
	]),
	operator: z.string(),
	rollingStock: z.string().optional(),
	pathCoordinates: z.array(CoordinateSchema),
	calls: z.array(ServiceCallSchema),
});

export const TrainServicesSchema = z
	.array(TrainServiceSchema)
	.refine(
		(services) =>
			new Set(services.map((service) => service.id)).size === services.length,
		{
			message:
				"duplicate service id: a deep link would resolve to the wrong service",
		},
	);

export type TrainService = z.infer<typeof TrainServiceSchema>;

type LandmarkKind = "viaduct" | "bridge" | "crossing" | "summit" | "hall";

export type Landmark = {
	id: string;
	name: string;
	coordinate: Coordinate;
	kind: LandmarkKind;
	description: string;
};

export type Loch = {
	id: string;
	name: string;
	coordinates: Coordinate[];
};

export type AppSettings = {
	dayNightCycle: boolean;
	trainHeadlights: boolean;
	showLandmarks: boolean;
	showLochs: boolean;
	congestionHeatmap: boolean;
	cameraFollowTrain: boolean;
	weatherEffects: boolean;
	cityLights: boolean;
	soundEffects: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
	dayNightCycle: true,
	trainHeadlights: true,
	showLandmarks: true,
	showLochs: true,
	congestionHeatmap: false,
	cameraFollowTrain: false,
	weatherEffects: true,
	cityLights: true,
	soundEffects: false,
};

export type ViewPreset = "scotland" | "central-belt" | "highlands";

export type Bounds = [west: number, south: number, east: number, north: number];

export const VIEW_BOUNDS: Record<ViewPreset, Bounds> = {
	scotland: [-7.8, 54.7, -1.6, 58.8],
	"central-belt": [-4.9, 55.6, -2.9, 56.2],
	highlands: [-6.5, 56.4, -3.4, 58.7],
};
