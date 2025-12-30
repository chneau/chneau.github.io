import dayjs from "dayjs";
import { type Kind, rawBirthdays } from "./rawBirthdays";
import { getBirthgem, getSign } from "./zodiac";

export type { Kind };

export type Birthday = {
	isWedding?: boolean | null | undefined;
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
	if (kind === "💒") return "gold";
	if (kind === "♂️") return "blue";
	if (kind === "♀️") return "magenta";
	return undefined;
};

export const getAgeEmoji = (age: number, kind?: Kind | string) => {
	if (kind === "💒") return "💍";
	if (age < 3) return "👶";
	if (age < 13) return "🧒";
	if (age >= 60) return "🧓";
	return "🧑";
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

const getAgeGroup = (age: number): string => {
	if (age < 3) return `Babies ${getAgeEmoji(age)} (<3)`;
	if (age < 13) return `Children ${getAgeEmoji(age)} (<13)`;
	if (age < 60) return `Adults ${getAgeEmoji(age)} (<60)`;
	return `Seniors ${getAgeEmoji(age)} (60+)`;
};

const getDecade = (year: number): string => {
	const d = Math.floor(year / 10) * 10;
	return `${d}s`;
};

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

const getDayOfWeek = (date: Date): string => {
	const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	return dayNames[date.getDay()] || "?";
};

export const birthdays: Birthday[] = rawBirthdays
	.map((x) => {
		// Use dayjs for the birth date, normalized to start of day
		const birthday = dayjs(new Date(x.year, x.month - 1, x.day)).startOf(
			"day",
		);
		const today = dayjs().startOf("day");

		// Calculate next birthday
		// dayjs.year(y) automatically handles leap years (Feb 29 -> Feb 28)
		let nextBirthday = birthday.year(today.year());

		// If the birthday has already occurred this year, move to next year
		if (nextBirthday.isBefore(today)) {
			nextBirthday = nextBirthday.add(1, "year");
		}

		// Calculate age
		// We calculate age based on the *next* birthday minus 1 year if it hasn't happened yet?
		// Actually, standard age is diff in years from birth to now.
		const age = today.diff(birthday, "year");

		const daysBefore = nextBirthday.diff(today, "day");

		const birthdayDate = birthday.toDate();
		const nextBirthdayDate = nextBirthday.toDate();

		const sign = getSign(birthdayDate);
		const birthgem = getBirthgem(nextBirthdayDate);

		return {
			...x,
			nextBirthday: nextBirthdayDate,
			birthday: birthdayDate,
			birthdayString: birthday.format("YYYY-MM-DD"),
			sign: sign.name,
			signSymbol: sign.symbol,
			birthgem,
			chineseZodiac: getChineseZodiac(x.year),
			element: sign.element,
			generation: getGeneration(x.year),
			season: getSeason(x.month),
			dayOfWeek: getDayOfWeek(birthdayDate),
			ageGroup: getAgeGroup(age),
			decade: getDecade(x.year),
			monthString: dayjs(nextBirthdayDate).format("MMMM"), // "long" month
			daysBeforeBirthday: daysBefore,
			age,
		};
	})
	.sort((a, b) => a.daysBeforeBirthday - b.daysBeforeBirthday);
