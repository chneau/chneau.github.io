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
	return `${gem.name} ${gem.emoji}`;
};

const signs = [
	{
		point: 1,
		name: "capricorn",
		symbol: "♑",
		element: "Earth 🜃",
		traits: "Disciplined, ambitious, and practical.",
	},
	{
		point: 20,
		name: "aquarius",
		symbol: "♒",
		element: "Air 🜁",
		traits: "Innovative, independent, and humanitarian.",
	},
	{
		point: 119,
		name: "pisces",
		symbol: "♓",
		element: "Water 🜄",
		traits: "Compassionate, artistic, and intuitive.",
	},
	{
		point: 221,
		name: "aries",
		symbol: "♈",
		element: "Fire 🜂",
		traits: "Eager, dynamic, and competitive.",
	},
	{
		point: 320,
		name: "taurus",
		symbol: "♉",
		element: "Earth 🜃",
		traits: "Strong, dependable, and sensual.",
	},
	{
		point: 421,
		name: "gemini",
		symbol: "♊",
		element: "Air 🜁",
		traits: "Versatile, expressive, and curious.",
	},
	{
		point: 522,
		name: "cancer",
		symbol: "♋",
		element: "Water 🜄",
		traits: "Intuitive, sentimental, and compassionate.",
	},
	{
		point: 623,
		name: "leo",
		symbol: "♌",
		element: "Fire 🜂",
		traits: "Dramatic, outgoing, and self-assured.",
	},
	{
		point: 723,
		name: "virgo",
		symbol: "♍",
		element: "Earth 🜃",
		traits: "Loyal, analytical, and kind-hearted.",
	},
	{
		point: 823,
		name: "libra",
		symbol: "♎",
		element: "Air 🜁",
		traits: "Diplomatic, artistic, and social.",
	},
	{
		point: 923,
		name: "scorpio",
		symbol: "♏",
		element: "Water 🜄",
		traits: "Passionate, stubborn, and resourceful.",
	},
	{
		point: 1022,
		name: "sagittarius",
		symbol: "♐",
		element: "Fire 🜂",
		traits: "Extroverted, optimistic, and funny.",
	},
	{
		point: 1122,
		name: "capricorn",
		symbol: "♑",
		element: "Earth 🜃",
		traits: "Disciplined, ambitious, and practical.",
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
		traits: sign.traits,
		compatible: sign.element.includes("Fire")
			? "Air & Fire"
			: sign.element.includes("Air")
				? "Fire & Air"
				: sign.element.includes("Earth")
					? "Water & Earth"
					: "Earth & Water",
	};
};
