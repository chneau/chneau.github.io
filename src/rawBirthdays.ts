import dayjs, { type Dayjs } from "dayjs";

export type Kind = "♂️" | "♀️" | "💒";

export const rawBirthdays: {
	name: string;
	date: Dayjs;
	kind: Kind;
	isWedding?: boolean;
}[] = [
	{ name: "Ariimoana", date: dayjs("2013-07-11"), kind: "♂️" },
	{ name: "Brigitte", date: dayjs("1982-03-12"), kind: "♀️" },
	{ name: "Cécile", date: dayjs("1977-10-05"), kind: "♀️" },
	{ name: "Charles", date: dayjs("1992-08-13"), kind: "♂️" },
	{ name: "Christian", date: dayjs("1951-05-08"), kind: "♂️" },
	{ name: "Christian", date: dayjs("1975-10-23"), kind: "♂️" },
	{ name: "Christopher", date: dayjs("1982-02-12"), kind: "♂️" },
	{ name: "Dorothée", date: dayjs("1951-03-09"), kind: "♀️" },
	{ name: "Edouard", date: dayjs("2014-05-16"), kind: "♂️" },
	{ name: "Elena", date: dayjs("2016-07-30"), kind: "♀️" },
	{ name: "Georges", date: dayjs("2017-04-03"), kind: "♂️" },
	{ name: "Julien", date: dayjs("1970-11-27"), kind: "♂️" },
	{ name: "Justin", date: dayjs("2007-06-18"), kind: "♂️" },
	{ name: "Lucia", date: dayjs("2014-12-17"), kind: "♀️" },
	{ name: "Marie", date: dayjs("1945-09-01"), kind: "♀️" },
	{ name: "Martin", date: dayjs("1973-01-04"), kind: "♂️" },
	{ name: "Maximin", date: dayjs("1978-10-04"), kind: "♂️" },
	{ name: "Moanaragi", date: dayjs("2018-04-11"), kind: "♀️" },
	{ name: "Nadia", date: dayjs("1979-02-05"), kind: "♀️" },
	{ name: "Nicolas", date: dayjs("2019-01-30"), kind: "♂️" },
	{ name: "Ravahere", date: dayjs("1982-06-08"), kind: "♀️" },
	{ name: "Sandra", date: dayjs("1977-04-13"), kind: "♀️" },
	{ name: "Simon", date: dayjs("2005-03-24"), kind: "♂️" },
	{ name: "Sophie", date: dayjs("1997-10-11"), kind: "♀️" },
	{ name: "Vadim", date: dayjs("2014-04-15"), kind: "♂️" },
	{ name: "Vaimoana", date: dayjs("2005-04-13"), kind: "♀️" },
	{ name: "Victor", date: dayjs("2008-07-21"), kind: "♂️" },
	{
		name: "Brigitte & Julien",
		date: dayjs("2016-02-19"),
		isWedding: true,
		kind: "💒",
	},
	{
		name: "Cécile & Christian",
		date: dayjs("2005-02-26"),
		isWedding: true,
		kind: "💒",
	},
	{
		name: "Dorothée & Christian",
		date: dayjs("1977-03-25"),
		isWedding: true,
		kind: "💒",
	},
	{
		name: "Nadia & Christopher",
		date: dayjs("2010-09-04"),
		isWedding: true,
		kind: "💒",
	},
	{
		name: "Ravahere & Martin",
		date: dayjs("2005-03-26"),
		isWedding: true,
		kind: "💒",
	},
	{
		name: "Sandra & Maximin",
		date: dayjs("2014-10-03"),
		isWedding: true,
		kind: "💒",
	},
];
