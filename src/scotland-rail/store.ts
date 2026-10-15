import { debounce, throttle } from "es-toolkit";
import { proxy, subscribe } from "valtio";
import { STATIONS } from "./data/geography";
import TIMETABLE_DATA from "./data/timetable.json";
import {
	type AppSettings,
	type Category,
	DEFAULT_SETTINGS,
	type TrainService,
	TrainServicesSchema,
	type ViewPreset,
} from "./data/types";
import {
	type ActiveTrainState,
	resolveServiceAtTime,
} from "./engine/interpolator";
import { readUrlState, writeUrlState } from "./url";
import { clampReplayTime, cycleIndex, earliestServiceMinute } from "./utils";

type RailStore = {
	timeOffset: number;
	isPlaying: boolean;
	speed: number;
	viewPreset: ViewPreset;
	selectedService: TrainService | null;
	hoveredServiceId: string | null;
	searchQuery: string;
	selectedCategory: Category | "all";
	isInfoOpen: boolean;
	isSettingsOpen: boolean;
	settings: AppSettings;
};

const URL_WRITE_INTERVAL_MS = 1000;

const allServices: TrainService[] = TrainServicesSchema.parse(TIMETABLE_DATA);
const firstServiceMinute = earliestServiceMinute(allServices);
const stationNamesById = new Map(STATIONS.map((s) => [s.id, s.name]));

const getInitialState = (): RailStore => {
	const defaults: RailStore = {
		timeOffset: 480,
		isPlaying: true,
		speed: 2,
		viewPreset: "scotland",
		selectedService: null,
		hoveredServiceId: null,
		searchQuery: "",
		selectedCategory: "all",
		isInfoOpen: false,
		isSettingsOpen: false,
		settings: { ...DEFAULT_SETTINGS },
	};

	const urlState = readUrlState();
	if (urlState.timeOffset !== undefined) {
		defaults.timeOffset = urlState.timeOffset;
	}
	if (urlState.speed !== undefined) defaults.speed = urlState.speed;
	if (urlState.category !== undefined) {
		defaults.selectedCategory = urlState.category;
	}
	if (urlState.query !== undefined) defaults.searchQuery = urlState.query;
	if (urlState.serviceId) {
		defaults.selectedService =
			allServices.find((service) => service.id === urlState.serviceId) ?? null;
	}

	if (typeof localStorage === "undefined") {
		return defaults;
	}

	try {
		const saved = localStorage.getItem("scotland_rail_settings");
		if (saved) {
			const parsed = JSON.parse(saved);
			return {
				...defaults,
				settings: { ...DEFAULT_SETTINGS, ...parsed },
			};
		}
	} catch {}

	return defaults;
};

export const railStore = proxy<RailStore>(getInitialState());

const saveSettings = debounce(() => {
	if (typeof localStorage !== "undefined") {
		try {
			localStorage.setItem(
				"scotland_rail_settings",
				JSON.stringify(railStore.settings),
			);
		} catch {}
	}
}, 300);

subscribe(railStore, saveSettings);

const saveUrl = throttle(() => {
	writeUrlState({
		timeOffset: railStore.timeOffset,
		speed: railStore.speed,
		serviceId: railStore.selectedService?.id ?? null,
		category: railStore.selectedCategory,
		query: railStore.searchQuery,
	});
}, URL_WRITE_INTERVAL_MS);

subscribe(railStore, () => {
	saveUrl();
});

export const derivedStore = proxy<{
	filteredServices: TrainService[];
	activeTrains: ActiveTrainState[];
	activeCountsByCategory: Record<Category, number>;
}>({
	filteredServices: allServices,
	activeTrains: [],
	activeCountsByCategory: {
		Express: 0,
		Highland: 0,
		Commuter: 0,
		CrossBorder: 0,
		Sleeper: 0,
	},
});

const recomputeFilteredServices = () => {
	let result = allServices;
	const { selectedCategory, searchQuery } = railStore;

	if (selectedCategory !== "all") {
		result = result.filter((s) => s.category === selectedCategory);
	}

	if (searchQuery.trim()) {
		const q = searchQuery.toLowerCase().trim();
		result = result.filter((s) => {
			return (
				s.name.toLowerCase().includes(q) ||
				s.serviceNumber.toLowerCase().includes(q) ||
				s.operator.toLowerCase().includes(q) ||
				s.calls.some((c) => {
					const stName = stationNamesById.get(c.stationId)?.toLowerCase();
					return stName?.includes(q) || c.stationId.toLowerCase().includes(q);
				})
			);
		});
	}

	derivedStore.filteredServices = result;
};

export const recomputeActiveTrains = () => {
	const { timeOffset } = railStore;
	const trains: ActiveTrainState[] = [];
	const counts: Record<Category, number> = {
		Express: 0,
		Highland: 0,
		Commuter: 0,
		CrossBorder: 0,
		Sleeper: 0,
	};

	for (const service of derivedStore.filteredServices) {
		const state = resolveServiceAtTime(service, timeOffset, stationNamesById);
		if (state) {
			trains.push(state);
			counts[service.category] = (counts[service.category] || 0) + 1;
		}
	}

	derivedStore.activeTrains = trains;
	derivedStore.activeCountsByCategory = counts;
};

export const railActions = {
	setTimeOffset: (val: number) => {
		railStore.timeOffset = clampReplayTime(val);
		recomputeActiveTrains();
	},
	togglePlay: () => {
		railStore.isPlaying = !railStore.isPlaying;
	},
	setSpeed: (speed: number) => {
		railStore.speed = speed;
	},
	setViewPreset: (preset: ViewPreset) => {
		railStore.viewPreset = preset;
	},
	setSelectedService: (service: TrainService | null) => {
		railStore.selectedService = service;
	},
	setHoveredServiceId: (id: string | null) => {
		railStore.hoveredServiceId = id;
	},
	setSearchQuery: (query: string) => {
		railStore.searchQuery = query;
		recomputeFilteredServices();
		recomputeActiveTrains();
	},
	setSelectedCategory: (category: Category | "all") => {
		railStore.selectedCategory = category;
		recomputeFilteredServices();
		recomputeActiveTrains();
	},
	setIsInfoOpen: (open: boolean) => {
		railStore.isInfoOpen = open;
	},
	setIsSettingsOpen: (open: boolean) => {
		railStore.isSettingsOpen = open;
	},
	updateSetting: <K extends keyof AppSettings>(
		key: K,
		value: AppSettings[K],
	) => {
		railStore.settings[key] = value;
	},
	resetSettings: () => {
		railStore.settings = { ...DEFAULT_SETTINGS };
	},
	restart: () => {
		railActions.setTimeOffset(firstServiceMinute);
	},
	cycleSelectedTrain: (direction: 1 | -1) => {
		const trains = derivedStore.activeTrains;
		const ids = trains.map((train) => train.service.id);
		const currentIndex = railStore.selectedService
			? ids.indexOf(railStore.selectedService.id)
			: -1;
		const nextIndex = cycleIndex(ids.length, currentIndex, direction);
		if (nextIndex === null) return;
		const next = trains[nextIndex];
		if (next) railActions.setSelectedService(next.service);
	},
};

recomputeFilteredServices();
recomputeActiveTrains();

export const railUiStores = [railStore, derivedStore] as const;
