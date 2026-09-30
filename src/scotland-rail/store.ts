import { debounce } from "es-toolkit";
import { proxy, subscribe } from "valtio";
import { STATIONS } from "./data/geography";
import TIMETABLE_DATA from "./data/timetable.json";
import {
	type AppSettings,
	type Category,
	DEFAULT_SETTINGS,
	type TrainService,
	type ViewPreset,
} from "./data/types";
import {
	type ActiveTrainState,
	resolveServiceAtTime,
} from "./engine/interpolator";
import { readUrlState, writeUrlState } from "./url";

type RailStore = {
	timeOffset: number; // minutes from 00:00 (default 480 = 08:00)
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

// All loaded static services and station index
const allServices: TrainService[] = TIMETABLE_DATA as TrainService[];
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
		// A COPY, not the shared constant. `proxy()` wraps whatever object it is
		// given, so assigning `DEFAULT_SETTINGS` by reference meant every user
		// toggle mutated the module-level constant - and `resetSettings` then
		// spread that already-mutated object, making "reset to defaults" a no-op.
		settings: { ...DEFAULT_SETTINGS },
	};

	// Deep links override the defaults; invalid/unknown values are ignored.
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
	} catch {
		// ignore fallback
	}

	return defaults;
};

export const railStore = proxy<RailStore>(getInitialState());

// Debounced localStorage persist to avoid synchronous I/O overhead on rapid setting toggles
const saveSettings = debounce(() => {
	if (typeof localStorage !== "undefined") {
		try {
			localStorage.setItem(
				"scotland_rail_settings",
				JSON.stringify(railStore.settings),
			);
		} catch {
			// ignore storage quota error
		}
	}
}, 300);

// Persist settings changes.
//
// Subscribed to the ROOT proxy, not `railStore.settings`: `resetSettings`
// replaces the nested settings object wholesale, which would orphan a listener
// bound to the old one and silently stop persisting every later change.
subscribe(railStore, saveSettings);

// Mirror the shareable subset of the store into the URL. Debounced because
// timeOffset changes on every animation frame while the replay is playing.
const saveUrl = debounce(() => {
	writeUrlState({
		timeOffset: railStore.timeOffset,
		speed: railStore.speed,
		serviceId: railStore.selectedService?.id ?? null,
		category: railStore.selectedCategory,
		query: railStore.searchQuery,
	});
}, 250);

subscribe(railStore, () => {
	saveUrl();
});

// Derived computed store for filtered services & active trains
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

// Actions helper for clean mutation anywhere
export const railActions = {
	setTimeOffset: (val: number) => {
		railStore.timeOffset = val;
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
		// A fresh object, and `saveSettings` runs on the root proxy so the
		// restored defaults are actually written to storage.
		railStore.settings = { ...DEFAULT_SETTINGS };
	},
	restart: () => {
		railStore.timeOffset = 300; // 05:00
		recomputeActiveTrains();
	},
};

// Initial compute
recomputeFilteredServices();
recomputeActiveTrains();

/**
 * Stable store bundle for the throttled UI hook (`useThrottledSnapshots`).
 * Kept module-level so the subscription identity never changes between renders.
 */
export const railUiStores = [railStore, derivedStore] as const;
