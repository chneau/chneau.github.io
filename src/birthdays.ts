import dayjs from "dayjs";
import { z } from "zod";
import { getMoonPhase, type MoonPhase } from "./astronomy";
import rawBirthdaysJson from "./birthdays.json";
import type en from "./locales/en.json";
import {
	type BirthGem,
	type Element,
	getBirthgem,
	getSign,
	type ZodiacSign,
} from "./zodiac";

export type { Element };

const birthdaySchema = z.object({
	name: z.string().min(1),
	date: z.string().refine((val) => dayjs(val).isValid(), {
		message: "Invalid date format",
	}),
	kind: z.enum(["♂️", "♀️", "💒"]),
});

const birthdaysArraySchema = z.array(birthdaySchema);

export type Kind = "♂️" | "♀️" | "💒";

export type MilestoneKey =
	| `data.milestone.${Exclude<keyof typeof en.data.milestone, "status">}`
	| `data.milestone.status.${keyof typeof en.data.milestone.status}`;

export type MilestoneData = {
	key: MilestoneKey;
	params?: Record<string, string | number>;
};

export type ChineseZodiac = keyof typeof en.data.chinese_zodiac;

export type Season = keyof typeof en.data.seasons;

export type AgeGroup = keyof typeof en.data.age_groups;

export type Generation = keyof typeof en.data.generations;

export type MonthName = keyof typeof en.data.months;

export type PlanetName = keyof typeof en.data.planets;

export type LifePathMeaning = keyof typeof en.data.life_path;

export type DailyInsight = keyof typeof en.data.insights;

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
};

const BIG_BIRTHDAYS = [
	1, 5, 10, 13, 15, 16, 18, 20, 21, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95,
	100,
];

const WEDDING_MILESTONES: Record<number, string> = {
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
		// Simplified status logic for now to avoid complex key composition
		if (nextMilestone !== undefined) {
			const diff = nextMilestone - age;
			if (diff > 0) {
				status = {
					key: "data.milestone.status.until",
					params: {
						diff,
						count: diff,
						target: isWedding
							? `${nextMilestone}` // We'll handle translation in UI
							: `${nextMilestone}`,
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
	if (age < 3) return "👶";
	if (age < 20) {
		if (kind === "♂️") return "👦";
		if (kind === "♀️") return "👧";
		return "🧒";
	}
	if (age >= 60) {
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
	if (age < 3) return "babies";
	if (age < 13) return "children";
	if (age < 20) return "teens";
	if (age < 60) return "adults";
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

const getDecade = (year: number): string => `${Math.floor(year / 10) * 10}s`;

const getGeneration = (year: number): Generation => {
	if (year >= 2013) return "gen_alpha";
	if (year >= 1997) return "gen_z";
	if (year >= 1981) return "millennials";
	if (year >= 1965) return "gen_x";
	if (year >= 1946) return "boomers";
	if (year >= 1928) return "silent";
	return "greatest";
};

const getSeason = (month: number): Season => {
	if (month >= 3 && month <= 5) return "spring";
	if (month >= 6 && month <= 8) return "summer";
	if (month >= 9 && month <= 11) return "autumn";
	return "winter";
};

const getLifePath = (date: Date) => {
	const sumDigits = (n: number): number => {
		let s = 0;
		let temp = n;
		while (temp > 0) {
			s += temp % 10;
			temp = Math.floor(temp / 10);
		}
		return s;
	};

	const reduce = (n: number): number => {
		let res = sumDigits(n);
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
	const today = new Date().toDateString();
	const str = name + today;
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	const index = Math.abs(hash) % count;
	return `insight_${index}` as DailyInsight;
};

const validatedBirthdays = birthdaysArraySchema.parse(rawBirthdaysJson);

export const birthdays: Birthday[] = validatedBirthdays
	.map((x) => {
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

		// Life in numbers calculations
		const heartbeats = ageInDays * 24 * 60 * 80;
		const breaths = ageInDays * 24 * 60 * 16;
		const sleepYears = age / 3;
		const distanceTraveled = ageInDays * 2570000; // km in Earth's orbit

		const planetAges: { name: PlanetName; age: number; icon: string }[] = [
			{ name: "mercury", age: ageInDays / 87.97, icon: "☿️" },
			{ name: "venus", age: ageInDays / 224.7, icon: "♀️" },
			{ name: "mars", age: ageInDays / 686.97, icon: "♂️" },
			{ name: "jupiter", age: ageInDays / 4332.59, icon: "♃" },
			{ name: "saturn", age: ageInDays / 10759.22, icon: "♄" },
		];

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
			sleepYears,
			distanceTraveled,
			planetAges,
			dailyInsight,
			moonPhase: moon.phase,
			moonPhaseIcon: moon.icon,
		};
	})
	.sort((a, b) => a.daysBeforeBirthday - b.daysBeforeBirthday);
