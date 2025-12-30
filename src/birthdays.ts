import dayjs from "dayjs";
import { type Kind, rawBirthdays } from "./rawBirthdays";
import { getBirthgem, getSign } from "./zodiac";

export type Birthday = {
	isWedding?: boolean;
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

export const birthdays: Birthday[] = rawBirthdays
	.map((x) => {
		const birthday = x.date.startOf("day");
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
		};
	})
	.sort((a, b) => a.daysBeforeBirthday - b.daysBeforeBirthday);
