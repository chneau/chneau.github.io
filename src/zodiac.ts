const birthgems = [
	[{ name: "garnet", emoji: "🔴" }],
	[{ name: "amethyst", emoji: "🟣" }],
	[
		{ name: "aquamarine", emoji: "🔵" },
		{ name: "bloodstone", emoji: "🔴" },
	],
	[{ name: "diamond", emoji: "💎" }],
	[{ name: "emerald", emoji: "🟢" }],
	[
		{ name: "alexandrite", emoji: "🟣" },
		{ name: "moonstone", emoji: "⚪" },
		{ name: "pearl", emoji: "⚪" },
	],
	[{ name: "ruby", emoji: "🔴" }],
	[
		{ name: "peridot", emoji: "🟢" },
		{ name: "sardonyx", emoji: "🔴" },
		{ name: "spinel", emoji: "🔴" },
	],
	[{ name: "sapphire", emoji: "🔵" }],
	[
		{ name: "opal", emoji: "⚪" },
		{ name: "tourmaline", emoji: "🟢" },
	],
	[
		{ name: "citrine", emoji: "🟡" },
		{ name: "topaz", emoji: "🟠" },
	],
	[
		{ name: "tanzanite", emoji: "🔵" },
		{ name: "turquoise", emoji: "🔵" },
		{ name: "zircon", emoji: "🔵" },
	],
];

export const getBirthgem = (date: Date) => {
	const month = date.getMonth();
	const gems = birthgems[month];
	if (!gems) throw new Error(`No birthgem found for ${date}`);
	const gem = gems[0];
	if (!gem) throw new Error(`No birthgem found for ${date}`);
	return { key: gem.name, emoji: gem.emoji };
};

const signs = [
	{
		point: 1,
		name: "capricorn",
		symbol: "♑",
		element: "earth",
	},
	{
		point: 20,
		name: "aquarius",
		symbol: "♒",
		element: "air",
	},
	{
		point: 119,
		name: "pisces",
		symbol: "♓",
		element: "water",
	},
	{
		point: 221,
		name: "aries",
		symbol: "♈",
		element: "fire",
	},
	{
		point: 320,
		name: "taurus",
		symbol: "♉",
		element: "earth",
	},
	{
		point: 421,
		name: "gemini",
		symbol: "♊",
		element: "air",
	},
	{
		point: 522,
		name: "cancer",
		symbol: "♋",
		element: "water",
	},
	{
		point: 623,
		name: "leo",
		symbol: "♌",
		element: "fire",
	},
	{
		point: 723,
		name: "virgo",
		symbol: "♍",
		element: "earth",
	},
	{
		point: 823,
		name: "libra",
		symbol: "♎",
		element: "air",
	},
	{
		point: 923,
		name: "scorpio",
		symbol: "♏",
		element: "water",
	},
	{
		point: 1022,
		name: "sagittarius",
		symbol: "♐",
		element: "fire",
	},
	{
		point: 1122,
		name: "capricorn",
		symbol: "♑",
		element: "earth",
	},
].reverse();

export const getSign = (date: Date) => {
	const month = date.getMonth();
	const day = date.getDate();
	const point = month * 100 + day;
	const sign = signs.find((x) => x.point <= point);
	if (!sign) throw new Error(`No sign found for ${date}`);
	return {
		name: sign.name,
		symbol: sign.symbol,
		element: sign.element,
	};
};
