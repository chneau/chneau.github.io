export const ASTRONOMICAL_CONSTANTS = {
	MOON_CYCLE_DAYS: 29.5305882,
	JULIAN_DAY_OFFSET: 694039.09,
} as const;

export const PHYSICAL_CONSTANTS = {
	HEART_RATE_BPM: 80,
	BREATH_RATE_BPM: 16,
	SLEEP_FRACTION: 1 / 3,
	ORBITAL_SPEED_KM_DAY: 2570000,
} as const;

export const PLANET_ORBITS_DAYS = {
	mercury: 87.97,
	venus: 224.7,
	mars: 686.97,
	jupiter: 4332.59,
	saturn: 10759.22,
} as const;

export const GENERATION_BOUNDARIES = {
	GEN_ALPHA: 2013,
	GEN_Z: 1997,
	MILLENNIALS: 1981,
	GEN_X: 1965,
	BOOMERS: 1946,
	SILENT: 1928,
} as const;

export const AGE_THRESHOLDS = {
	BABY: 3,
	CHILD: 13,
	TEEN: 20,
	ADULT: 60,
} as const;

export const BIG_BIRTHDAYS = [
	1, 5, 10, 13, 15, 16, 18, 20, 21, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95,
	100,
];

export const WEDDING_MILESTONES: Record<number, string> = {
	1: "paper",
	5: "wood",
	10: "tin",
	15: "crystal",
	20: "china",
	25: "silver",
	30: "pearl",
	40: "ruby",
	50: "gold",
	60: "diamond",
};
