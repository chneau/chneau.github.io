import dayjs from "dayjs";
import { orderBy } from "es-toolkit";
import { z } from "zod";
import type en from "./locales/en.json";

// --- Constants ---

export const ASTRONOMICAL_CONSTANTS = {
	MOON_CYCLE_DAYS: 29.5305882,
	JULIAN_DAY_OFFSET: 694039.09,
} as const;

export const PHYSICAL_CONSTANTS = {
	HEART_RATE_BPM: 80,
	BREATH_RATE_BPM: 16,
	SLEEP_FRACTION: 1 / 3,
	ORBITAL_SPEED_KM_DAY: 2570000,
	MINUTES_IN_DAY: 24 * 60,
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

// --- Astronomy ---

export type MoonPhase = keyof typeof en.data.moon_phases;

export const getMoonPhase = (
	date: Date,
): { phase: MoonPhase; icon: string } => {
	let year = date.getFullYear();
	let month = date.getMonth() + 1;
	const day = date.getDate();

	if (month < 3) {
		year--;
		month += 12;
	}

	const c = 365.25 * year;
	const e = 30.6 * month;
	const jd = c + e + day - ASTRONOMICAL_CONSTANTS.JULIAN_DAY_OFFSET;
	const b = jd / ASTRONOMICAL_CONSTANTS.MOON_CYCLE_DAYS;
	const ip = Math.floor(b);
	const diff = b - ip;

	const phaseIndex = Math.round(diff * 8) % 8;

	return MOON_PHASES[phaseIndex] as { phase: MoonPhase; icon: string };
};

const MOON_PHASES = [
	{ phase: "new_moon", icon: "🌑" },
	{ phase: "waxing_crescent", icon: "🌒" },
	{ phase: "first_quarter", icon: "🌓" },
	{ phase: "waxing_gibbous", icon: "🌔" },
	{ phase: "full_moon", icon: "🌕" },
	{ phase: "waning_gibbous", icon: "🌖" },
	{ phase: "last_quarter", icon: "🌗" },
	{ phase: "waning_crescent", icon: "🌘" },
];

// --- Zodiac & Birthgems ---

export type BirthGem = keyof typeof en.data.birthgems;

const birthgems: { name: BirthGem; emoji: string }[] = [
	{ name: "garnet", emoji: "🔴" },
	{ name: "amethyst", emoji: "🟣" },
	{ name: "aquamarine", emoji: "🔵" },
	{ name: "diamond", emoji: "💎" },
	{ name: "emerald", emoji: "🟢" },
	{ name: "alexandrite", emoji: "🟣" },
	{ name: "ruby", emoji: "🔴" },
	{ name: "peridot", emoji: "🟢" },
	{ name: "sapphire", emoji: "🔵" },
	{ name: "opal", emoji: "⚪" },
	{ name: "citrine", emoji: "🟡" },
	{ name: "tanzanite", emoji: "🔵" },
];

export const getBirthgem = (date: Date): { key: BirthGem; emoji: string } => {
	const month = date.getMonth();
	const gem = birthgems[month];
	if (!gem) throw new Error(`No birthgem found for month ${month}`);
	return { key: gem.name, emoji: gem.emoji };
};

export type ZodiacSign = keyof typeof en.data.zodiac;

export type Element = keyof typeof en.data.elements;

const signs: {
	point: number;
	name: ZodiacSign;
	symbol: string;
	element: Element;
}[] = [
	{ point: 1122, name: "capricorn", symbol: "♑", element: "earth" },
	{ point: 1022, name: "sagittarius", symbol: "♐", element: "fire" },
	{ point: 923, name: "scorpio", symbol: "♏", element: "water" },
	{ point: 823, name: "libra", symbol: "♎", element: "air" },
	{ point: 723, name: "virgo", symbol: "♍", element: "earth" },
	{ point: 623, name: "leo", symbol: "♌", element: "fire" },
	{ point: 522, name: "cancer", symbol: "♋", element: "water" },
	{ point: 421, name: "gemini", symbol: "♊", element: "air" },
	{ point: 320, name: "taurus", symbol: "♉", element: "earth" },
	{ point: 221, name: "aries", symbol: "♈", element: "fire" },
	{ point: 119, name: "pisces", symbol: "♓", element: "water" },
	{ point: 20, name: "aquarius", symbol: "♒", element: "air" },
	{ point: 0, name: "capricorn", symbol: "♑", element: "earth" },
];

export const getSign = (
	date: Date,
): {
	name: ZodiacSign;
	symbol: string;
	element: Element;
} => {
	const point = date.getMonth() * 100 + date.getDate();
	const sign = signs.find((x) => x.point <= point);
	if (!sign) throw new Error(`No sign found for point ${point}`);
	return sign;
};

// --- Birthday Logic ---

const birthdaySchema = z.object({
	name: z.string().min(1),
	date: z.string().refine((val) => dayjs(val).isValid(), {
		message: "Invalid date format",
	}),
	kind: z.enum(["♂️", "♀️", "💒"]),
});

const birthdaysArraySchema = z.array(birthdaySchema);

type Kind = "♂️" | "♀️" | "💒";
type MilestoneKey =
	| `data.milestone.${Exclude<keyof typeof en.data.milestone, "status">}`
	| `data.milestone.status.${keyof typeof en.data.milestone.status}`
	| "data.milestone.status.until"
	| "data.milestone.status.since";
type MilestoneData = {
	key: MilestoneKey;
	params?: Record<string, string | number>;
};
type ChineseZodiac = keyof typeof en.data.chinese_zodiac;
type Season = keyof typeof en.data.seasons;
type AgeGroup = keyof typeof en.data.age_groups;
type Generation = keyof typeof en.data.generations;
type MonthName = keyof typeof en.data.months;
type PlanetName = keyof typeof en.data.planets;
type LifePathMeaning = keyof typeof en.data.life_path;
type DailyInsight = keyof typeof en.data.insights;
export type Birthday = {
	name: string;
	kind: Kind;
	age: number;
	birthday: Date;
	birthdayString: string;
	nextBirthday: Date;
	sign: ZodiacSign;
	signSymbol: string;
	birthgem: BirthGem;
	birthgemEmoji: string;
	year: number;
	month: number;
	monthName: MonthName;
	day: number;
	daysBeforeBirthday: number;
	chineseZodiac: ChineseZodiac;
	element: Element;
	generation: Generation;
	season: Season;
	ageGroup: AgeGroup;
	decade: string;
	milestone?: MilestoneData;
	milestoneStatus?: MilestoneData;
	progress: number;
	ageInDays: number;
	ageInWeeks: number;
	ageInMonths: number;
	halfBirthday: string;
	halfBirthdayMonth: MonthName;
	halfBirthdayDay: number;
	lifePathNumber: number;
	lifePathMeaning: LifePathMeaning;
	heartbeats: number;
	breaths: number;
	sleepYears: number;
	distanceTraveled: number;
	dailyInsight: DailyInsight;
	moonPhase: MoonPhase;
	moonPhaseIcon: string;
	planetAges: readonly { name: PlanetName; age: number; icon: string }[];
	etymology?: string;
};

const getMilestoneInfo = (
	age: number,
	nextAge: number,
	isToday: boolean,
	kind: Kind,
): { milestone?: MilestoneData; status?: MilestoneData } => {
	const isWedding = kind === "💒";
	const milestones = isWedding
		? Object.keys(WEDDING_MILESTONES).map(Number)
		: BIG_BIRTHDAYS;

	const milestoneAge = milestones.includes(age)
		? age
		: milestones.includes(nextAge)
			? nextAge
			: undefined;

	let milestone: MilestoneData | undefined;
	if (milestoneAge !== undefined) {
		if (isWedding) {
			const material = WEDDING_MILESTONES[milestoneAge];
			milestone = {
				key: "data.milestone.wedding",
				params: { year: milestoneAge, material: material || "" },
			};
		} else {
			milestone = {
				key: "data.milestone.birthday",
				params: { age: milestoneAge },
			};
		}
	}

	const nextMilestone = milestones.find((m) => m > age);

	let status: MilestoneData | undefined;

	if (isToday && milestones.includes(age)) {
		status = { key: "data.milestone.status.today" };
	} else {
		if (nextMilestone !== undefined) {
			const diff = nextMilestone - age;
			if (diff > 0) {
				status = {
					key: "data.milestone.status.until",
					params: {
						diff,
						count: diff,
						target: nextMilestone,
					},
				};
			}
		}
	}

	return { milestone, status };
};

export const monthNames: MonthName[] = [
	"jan",
	"feb",
	"mar",
	"apr",
	"may",
	"jun",
	"jul",
	"aug",
	"sep",
	"oct",
	"nov",
	"dec",
];

export const getKindColor = (kind: Kind) => {
	switch (kind) {
		case "💒":
			return "gold";
		case "♂️":
			return "blue";
		case "♀️":
			return "magenta";
		default:
			return undefined;
	}
};

export const getAgeEmoji = (age: number, kind?: Kind) => {
	if (kind === "💒") return "💍";
	if (age < AGE_THRESHOLDS.BABY) return "👶";
	if (age < AGE_THRESHOLDS.TEEN) {
		if (kind === "♂️") return "👦";
		if (kind === "♀️") return "👧";
		return "🧒";
	}
	if (age >= AGE_THRESHOLDS.ADULT) {
		if (kind === "♂️") return "👴";
		if (kind === "♀️") return "👵";
		return "🧓";
	}
	if (kind === "♂️") return "👨";
	if (kind === "♀️") return "👩";
	return "🧑";
};

const getAgeGroup = (age: number, kind?: Kind): AgeGroup => {
	if (kind === "💒") return "weddings";
	if (age < AGE_THRESHOLDS.BABY) return "babies";
	if (age < AGE_THRESHOLDS.CHILD) return "children";
	if (age < AGE_THRESHOLDS.TEEN) return "teens";
	if (age < AGE_THRESHOLDS.ADULT) return "adults";
	return "seniors";
};

const getChineseZodiac = (year: number): ChineseZodiac => {
	const animals: ChineseZodiac[] = [
		"rat",
		"ox",
		"tiger",
		"rabbit",
		"dragon",
		"snake",
		"horse",
		"goat",
		"monkey",
		"rooster",
		"dog",
		"pig",
	];
	const index = (((year - 4) % 12) + 12) % 12;
	const found = animals[index];
	if (!found) throw new Error(`No zodiac animal found for year ${year}`);
	return found;
};

const getDecade = (year: number) => `${Math.floor(year / 10) * 10}s`;

const getGeneration = (year: number): Generation => {
	if (year >= GENERATION_BOUNDARIES.GEN_ALPHA) return "gen_alpha";
	if (year >= GENERATION_BOUNDARIES.GEN_Z) return "gen_z";
	if (year >= GENERATION_BOUNDARIES.MILLENNIALS) return "millennials";
	if (year >= GENERATION_BOUNDARIES.GEN_X) return "gen_x";
	if (year >= GENERATION_BOUNDARIES.BOOMERS) return "boomers";
	if (year >= GENERATION_BOUNDARIES.SILENT) return "silent";
	return "greatest";
};

const getSeason = (month: number): Season => {
	if (month >= 3 && month <= 5) return "spring";
	if (month >= 6 && month <= 8) return "summer";
	if (month >= 9 && month <= 11) return "autumn";
	return "winter";
};

const getLifePath = (date: Date) => {
	const sumDigits = (n: number) =>
		n
			.toString()
			.split("")
			.reduce((s, d) => s + Number.parseInt(d, 0), 0);

	const reduce = (n: number) => {
		let res = n;
		while (res > 9 && res !== 11 && res !== 22 && res !== 33) {
			res = sumDigits(res);
		}
		return res;
	};

	const d = date.getDate();
	const m = date.getMonth() + 1;
	const y = date.getFullYear();

	const lifePathNumber = reduce(reduce(d) + reduce(m) + reduce(y));

	return {
		number: lifePathNumber,
		meaning: `life_path_${lifePathNumber}` as LifePathMeaning,
	};
};

const getDailyInsight = (name: string): DailyInsight => {
	const count = 15;
	const today = dayjs().format("YYYY-MM-DD");
	const str = name + today;
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	const index = Math.abs(hash) % count;
	return `insight_${index}` as DailyInsight;
};

import rawBirthdaysJson from "./birthdays.json";

const validatedBirthdays = birthdaysArraySchema.parse(rawBirthdaysJson);

const mappedBirthdays = validatedBirthdays.map((x) => {
	const birthday = dayjs(x.date).startOf("day");
	const today = dayjs().startOf("day");

	const year = birthday.year();
	const month = birthday.month() + 1;
	const day = birthday.date();

	let nextBirthday = birthday.year(today.year());
	if (nextBirthday.isBefore(today)) {
		nextBirthday = nextBirthday.add(1, "year");
	}

	const age = today.diff(birthday, "year");
	const daysBefore = nextBirthday.diff(today, "day");

	const birthdayDate = birthday.toDate();
	const sign = getSign(birthdayDate);
	const nextAge = nextBirthday.diff(birthday, "year");
	const milestoneInfo = getMilestoneInfo(
		age,
		nextAge,
		daysBefore === 0,
		x.kind,
	);

	const totalDaysInYear = nextBirthday.diff(
		nextBirthday.subtract(1, "year"),
		"day",
	);
	const progress = ((totalDaysInYear - daysBefore) / totalDaysInYear) * 100;

	const ageInDays = today.diff(birthday, "day");
	const ageInWeeks = today.diff(birthday, "week");
	const ageInMonths = today.diff(birthday, "month");
	const halfBirthdayDate = birthday.add(6, "month");
	const halfBirthday = halfBirthdayDate.format("MMMM DD");
	const halfBirthdayMonth = monthNames[halfBirthdayDate.month()];
	const halfBirthdayDay = halfBirthdayDate.date();
	const lifePath = getLifePath(birthdayDate);

	if (!halfBirthdayMonth) {
		throw new Error(
			`Invalid half birthday month for birthday ${x.name}: ${halfBirthdayDate.month()}`,
		);
	}

	const heartbeats =
		ageInDays *
		PHYSICAL_CONSTANTS.MINUTES_IN_DAY *
		PHYSICAL_CONSTANTS.HEART_RATE_BPM;
	const breaths =
		ageInDays *
		PHYSICAL_CONSTANTS.MINUTES_IN_DAY *
		PHYSICAL_CONSTANTS.BREATH_RATE_BPM;
	const distanceTraveled = ageInDays * PHYSICAL_CONSTANTS.ORBITAL_SPEED_KM_DAY;

	const planetAges = [
		{ name: "mercury", age: ageInDays / PLANET_ORBITS_DAYS.mercury, icon: "☿️" },
		{ name: "venus", age: ageInDays / PLANET_ORBITS_DAYS.venus, icon: "♀️" },
		{ name: "mars", age: ageInDays / PLANET_ORBITS_DAYS.mars, icon: "♂️" },
		{ name: "jupiter", age: ageInDays / PLANET_ORBITS_DAYS.jupiter, icon: "♃" },
		{ name: "saturn", age: ageInDays / PLANET_ORBITS_DAYS.saturn, icon: "♄" },
	] as const;

	const dailyInsight = getDailyInsight(x.name);
	const moon = getMoonPhase(birthdayDate);
	const bg = getBirthgem(birthdayDate);

	const monthName = monthNames[month - 1];

	if (!monthName) {
		throw new Error(`Invalid month ${month} for birthday ${x.name}`);
	}

	return {
		...x,
		year,
		month,
		monthName,
		day,
		nextBirthday: nextBirthday.toDate(),
		birthday: birthdayDate,
		birthdayString: birthday.format("YYYY-MM-DD"),
		sign: sign.name,
		signSymbol: sign.symbol,
		birthgem: bg.key,
		birthgemEmoji: bg.emoji,
		chineseZodiac: getChineseZodiac(year),
		element: sign.element,
		generation: getGeneration(year),
		season: getSeason(month),
		ageGroup: getAgeGroup(age, x.kind),
		decade: getDecade(year),
		daysBeforeBirthday: daysBefore,
		age,
		milestone: milestoneInfo.milestone,
		milestoneStatus: milestoneInfo.status,
		progress,
		ageInDays,
		ageInWeeks,
		ageInMonths,
		halfBirthday,
		halfBirthdayMonth,
		halfBirthdayDay,
		lifePathNumber: lifePath.number,
		lifePathMeaning: lifePath.meaning,
		heartbeats,
		breaths,
		sleepYears: age * PHYSICAL_CONSTANTS.SLEEP_FRACTION,
		distanceTraveled,
		planetAges,
		dailyInsight,
		moonPhase: moon.phase,
		moonPhaseIcon: moon.icon,
	};
});

export const birthdays: Birthday[] = orderBy(
	mappedBirthdays,
	["daysBeforeBirthday"],
	["asc"],
);
