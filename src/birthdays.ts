import dayjs from "dayjs";
import { z } from "zod";
import rawBirthdaysJson from "./birthdays.json";
import { getBirthgem, getSign } from "./zodiac";

const birthdaySchema = z.object({
	name: z.string().min(1),
	date: z.string().refine((val) => dayjs(val).isValid(), {
		message: "Invalid date format",
	}),
	kind: z.enum(["♂️", "♀️", "💒"]),
});

const birthdaysArraySchema = z.array(birthdaySchema);

export type Kind = "♂️" | "♀️" | "💒";

export type Birthday = {
	name: string;
	kind: Kind;
	age: number;
	birthday: Date;
	birthdayString: string;
	nextBirthday: Date;
	sign: string;
	signSymbol: string;
	birthgem: string;
	year: number;
	month: number;
	monthString: string;
	day: number;
	daysBeforeBirthday: number;
	chineseZodiac: string;
	element: string;
	generation: string;
	season: string;
	dayOfWeek: string;
	ageGroup: string;
	decade: string;
	milestone?: string;
	milestoneStatus?: string;
	traits: string;
	compatible: string;
	progress: number;
	ageInDays: number;
	ageInWeeks: number;
	ageInMonths: number;
	halfBirthday: string;
};

const BIG_BIRTHDAYS = [
	1, 5, 10, 13, 15, 16, 18, 20, 21, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95,
	100,
];

const WEDDING_MILESTONES: Record<number, string> = {
	1: "1st Anniversary (Paper) 📄",
	5: "5th Anniversary (Wood) 🪵",
	10: "10th Anniversary (Tin) 🥫",
	15: "15th Anniversary (Crystal) 💎",
	20: "20th Anniversary (China) 🏺",
	25: "25th Anniversary (Silver) 🥈",
	30: "30th Anniversary (Pearl) ⚪",
	40: "40th Anniversary (Ruby) 🔴",
	50: "50th Anniversary (Gold) 🥇",
	60: "60th Anniversary (Diamond) 💎",
};

const getMilestoneInfo = (
	age: number,
	nextAge: number,
	isToday: boolean,
	kind: Kind,
) => {
	const isWedding = kind === "💒";
	const milestones = isWedding
		? Object.keys(WEDDING_MILESTONES).map(Number)
		: BIG_BIRTHDAYS;

	const milestoneNames = isWedding ? WEDDING_MILESTONES : null;

	const milestoneAge = milestones.includes(age)
		? age
		: milestones.includes(nextAge)
			? nextAge
			: undefined;

	const milestone =
		milestoneAge !== undefined
			? isWedding
				? milestoneNames?.[milestoneAge]
				: `Big ${milestoneAge}! 🎉`
			: undefined;

	const prevMilestone = [...milestones].reverse().find((m) => m < age);

	const nextMilestone = milestones.find((m) => m > age);

	let status = "";
	if (isToday && milestones.includes(age)) {
		status = "Today is the milestone!";
	} else {
		if (prevMilestone !== undefined) {
			const diff = age - prevMilestone;
			if (diff > 0) {
				status = `${diff} year${diff > 1 ? "s" : ""} since ${
					isWedding ? milestoneNames?.[prevMilestone] : `age ${prevMilestone}`
				}`;
			}
		}
		if (nextMilestone !== undefined) {
			const diff = nextMilestone - age;
			if (diff > 0) {
				const nextStatus = `${diff} year${diff > 1 ? "s" : ""} until ${
					isWedding ? milestoneNames?.[nextMilestone] : `age ${nextMilestone}`
				}`;
				status = status ? `${status}. ${nextStatus}` : nextStatus;
			}
		}
	}

	return { milestone, status };
};

export const monthNames = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
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

const getAgeGroup = (age: number, kind?: Kind): string => {
	if (kind === "💒") return "Weddings 💍";
	if (age < 3) return "Babies 👶 (<3)";
	if (age < 13) return "Children 🧒 (<13)";
	if (age < 20) return "Teens 🧒 (<20)";
	if (age < 60) return "Adults 🧑 (<60)";
	return "Seniors 🧓 (60+)";
};

const getChineseZodiac = (year: number): string => {
	const animals = [
		"Rat 🐀",
		"Ox 🐂",
		"Tiger 🐅",
		"Rabbit 🐇",
		"Dragon 🐉",
		"Snake 🐍",
		"Horse 🐎",
		"Goat 🐐",
		"Monkey 🐒",
		"Rooster 🐓",
		"Dog 🐕",
		"Pig 🐖",
	];
	return animals[(((year - 4) % 12) + 12) % 12] || "?";
};

const getDecade = (year: number): string => `${Math.floor(year / 10) * 10}s`;

const getGeneration = (year: number): string => {
	if (year >= 2013) return "Gen Alpha";
	if (year >= 1997) return "Gen Z";
	if (year >= 1981) return "Millennials";
	if (year >= 1965) return "Gen X";
	if (year >= 1946) return "Boomers";
	if (year >= 1928) return "Silent";
	return "Greatest";
};

const getSeason = (month: number): string => {
	if (month >= 3 && month <= 5) return "Spring 🌸";
	if (month >= 6 && month <= 8) return "Summer ☀️";
	if (month >= 9 && month <= 11) return "Autumn 🍂";
	return "Winter ❄️";
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
		const halfBirthday = birthday.add(6, "month").format("MMMM DD");

		return {
			...x,
			year,
			month,
			day,
			nextBirthday: nextBirthday.toDate(),
			birthday: birthdayDate,
			birthdayString: birthday.format("YYYY-MM-DD"),
			sign: sign.name,
			signSymbol: sign.symbol,
			birthgem: getBirthgem(birthdayDate),
			chineseZodiac: getChineseZodiac(year),
			element: sign.element,
			generation: getGeneration(year),
			season: getSeason(month),
			dayOfWeek: birthday.format("ddd"),
			ageGroup: getAgeGroup(age, x.kind),
			decade: getDecade(year),
			monthString: birthday.format("MMMM"),
			daysBeforeBirthday: daysBefore,
			age,
			milestone: milestoneInfo.milestone,
			milestoneStatus: milestoneInfo.status,
			traits: sign.traits,
			compatible: sign.compatible,
			progress,
			ageInDays,
			ageInWeeks,
			ageInMonths,
			halfBirthday,
		};
	})
	.sort((a, b) => a.daysBeforeBirthday - b.daysBeforeBirthday);
