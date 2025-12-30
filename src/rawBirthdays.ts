export type Kind = "♂️" | "♀️" | "💒";

export const rawBirthdays: {
	name: string;
	year: number;
	month: number;
	day: number;
	kind: Kind;
	isWedding?: boolean;
}[] = [
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
