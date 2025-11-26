const birthgems = [
	["garnet"],
	["amethyst"],
	["aquamarine", "bloodstone"],
	["diamond"],
	["emerald"],
	["alexandrite", "moonstone", "pearl"],
	["ruby"],
	["peridot", "sardonyx", "spinel"],
	["sapphire"],
	["opal", "tourmaline"],
	["citrine", "topaz"],
	["tanzanite", "turquoise", "zircon"],
];

export const getBirthgem = (date: Date) => {
	const month = date.getMonth();
	const gems = birthgems[month];
	if (!gems) throw new Error(`No birthgem found for ${date}`);
	const gem = gems[0];
	if (!gem) throw new Error(`No birthgem found for ${date}`);
	return gem;
};

const signs = [
	{ point: 1, name: "capricorn", symbol: "♑" },
	{ point: 20, name: "aquarius", symbol: "♒" },
	{ point: 119, name: "pisces", symbol: "♓" },
	{ point: 221, name: "aries", symbol: "♈" },
	{ point: 320, name: "taurus", symbol: "♉" },
	{ point: 421, name: "gemini", symbol: "♊" },
	{ point: 522, name: "cancer", symbol: "♋" },
	{ point: 623, name: "leo", symbol: "♌" },
	{ point: 723, name: "virgo", symbol: "♍" },
	{ point: 823, name: "libra", symbol: "♎" },
	{ point: 923, name: "scorpio", symbol: "♏" },
	{ point: 1022, name: "sagittarius", symbol: "♐" },
	{ point: 1122, name: "capricorn", symbol: "♑" },
].reverse();

export const getSign = (date: Date) => {
	const month = date.getMonth();
	const day = date.getDate();
	const point = month * 100 + day;
	const sign = signs.find((x) => x.point <= point);
	if (!sign) throw new Error(`No sign found for ${date}`);
	return { name: sign.name, symbol: sign.symbol };
};
