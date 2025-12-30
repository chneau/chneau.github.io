import { getBirthgem, getSign } from "./zodiac";

export type Birthday = {
	isWedding?: boolean | null | undefined;
	name: string;
	kind: string;
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

export const getKindColor = (kind: string) => {
	if (kind === "💒") return "gold";
	if (kind === "♂️") return "blue";
	if (kind === "♀️") return "magenta";
	return undefined;
};

export const getAgeEmoji = (age: number, kind?: string) => {
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

const _birthdays = [
	{ name: "Ariimoana", year: 2013, month: 7, day: 11, kind: "♂️" },
	{ name: "Brigitte", year: 1982, month: 3, day: 12, kind: "♀️" },
	{ name: "Cécile", year: 1977, month: 10, day: 5, kind: "♀️" },
	{ name: "Charles", year: 1992, month: 8, day: 13, kind: "♂️" },
	{ name: "Christian", year: 1951, month: 5, day: 8, kind: "♂️" },
	{ name: "Christian", year: 1975, month: 10, day: 23, kind: "♂️" },
	{ name: "Christopher", year: 1982, month: 2, day: 12, kind: "♂️" },
	{ name: "Dorothée", year: 1951, month: 3, day: 9, kind: "♀️" },
	{ name: "Edouard", year: 2014, month: 5, day: 16, kind: "♂️" },
	{ name: "Elena", year: 2016, month: 7, day: 30, kind: "♀️" },
	{ name: "Georges", year: 2017, month: 4, day: 3, kind: "♂️" },
	{ name: "Julien", year: 1970, month: 11, day: 27, kind: "♂️" },
	{ name: "Justin", year: 2007, month: 6, day: 18, kind: "♂️" },
	{ name: "Lucia", year: 2014, month: 12, day: 17, kind: "♀️" },
	{ name: "Marie", year: 1945, month: 9, day: 1, kind: "♀️" },
	{ name: "Martin", year: 1973, month: 1, day: 4, kind: "♂️" },
	{ name: "Maximin", year: 1978, month: 10, day: 4, kind: "♂️" },
	{ name: "Moanaragi", year: 2018, month: 4, day: 11, kind: "♀️" },
	{ name: "Nadia", year: 1979, month: 2, day: 5, kind: "♀️" },
	{ name: "Nicolas", year: 2019, month: 1, day: 30, kind: "♂️" },
	{ name: "Ravahere", year: 1982, month: 6, day: 8, kind: "♀️" },
	{ name: "Sandra", year: 1977, month: 4, day: 13, kind: "♀️" },
	{ name: "Simon", year: 2005, month: 3, day: 24, kind: "♂️" },
	{ name: "Sophie", year: 1997, month: 10, day: 11, kind: "♀️" },
	{ name: "Vadim", year: 2014, month: 4, day: 15, kind: "♂️" },
	{ name: "Vaimoana", year: 2005, month: 4, day: 13, kind: "♀️" },
	{ name: "Victor", year: 2008, month: 7, day: 21, kind: "♂️" },
	{
		name: "Brigitte & Julien",
		year: 2016,
		month: 2,
		day: 19,
		isWedding: true,
		kind: "💒",
	},
	{
		name: "Cécile & Christian",
		year: 2005,
		month: 2,
		day: 26,
		isWedding: true,
		kind: "💒",
	},
	{
		name: "Dorothée & Christian",
		year: 1977,
		month: 3,
		day: 25,
		isWedding: true,
		kind: "💒",
	},
	{
		name: "Nadia & Christopher",
		year: 2010,
		month: 9,
		day: 4,
		isWedding: true,
		kind: "💒",
	},
	{
		name: "Ravahere & Martin",
		year: 2005,
		month: 3,
		day: 26,
		isWedding: true,
		kind: "💒",
	},
	{
		name: "Sandra & Maximin",
		year: 2014,
		month: 10,
		day: 3,
		isWedding: true,
		kind: "💒",
	},
];

const getNextBirthday = (birthday: Pick<Birthday, "month" | "day">): Date => {
	const now = new Date();
	const next = new Date(now.getFullYear(), birthday.month - 1, birthday.day);
	if (next < now) next.setFullYear(next.getFullYear() + 1);
	return next;
};

const getCurrentAge = (
	birthday: Pick<Birthday, "year" | "month" | "day">,
): number => {
	const now = new Date();
	const next = new Date(now.getFullYear(), birthday.month - 1, birthday.day);
	if (next > now) return now.getFullYear() - birthday.year - 1;
	return now.getFullYear() - birthday.year;
};

const getDaysBeforeBirthday = (nextBirthday: Date): number => {
	const now = new Date(Date.now() - 1000 * 60 * 60 * 24 * 1);
	const next = new Date(
		now.getFullYear(),
		nextBirthday.getMonth(),
		nextBirthday.getDate(),
	);
	if (next < now) next.setFullYear(next.getFullYear() + 1);
	return Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

export const birthdays: Birthday[] = _birthdays
	.map((x) => {
		const birthday = new Date(x.year, x.month - 1, x.day);
		const birthdayString = `${x.year}-${String(x.month).padStart(2, "0")}-${String(
			x.day,
		).padStart(2, "0")}`;
		const nextBirthday = getNextBirthday(x);
		const sign = getSign(birthday);
		const birthgem = getBirthgem(nextBirthday);
		const chineseZodiac = getChineseZodiac(x.year);
		const generation = getGeneration(x.year);
		const season = getSeason(x.month);
		const dayOfWeek = getDayOfWeek(birthday);
		const age = getCurrentAge(x);
		const ageGroup = getAgeGroup(age);
		const decade = getDecade(x.year);
		return {
			...x,
			nextBirthday,
			birthday,
			birthdayString,
			sign: sign.name,
			signSymbol: sign.symbol,
			birthgem,
			chineseZodiac,
			element: sign.element,
			generation,
			season,
			dayOfWeek,
			ageGroup,
			decade,
			monthString: nextBirthday.toLocaleString("en-GB", { month: "long" }),
			daysBeforeBirthday: getDaysBeforeBirthday(nextBirthday),
			age,
		};
	})
	.sort((a, b) => a.daysBeforeBirthday - b.daysBeforeBirthday);
