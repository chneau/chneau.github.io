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
	{ point: 1, name: "capricorn", symbol: "♑", element: "Earth 🜃" },
	{ point: 20, name: "aquarius", symbol: "♒", element: "Air 🜁" },
	{ point: 119, name: "pisces", symbol: "♓", element: "Water 🜄" },
	{ point: 221, name: "aries", symbol: "♈", element: "Fire 🜂" },
	{ point: 320, name: "taurus", symbol: "♉", element: "Earth 🜃" },
	{ point: 421, name: "gemini", symbol: "♊", element: "Air 🜁" },
	{ point: 522, name: "cancer", symbol: "♋", element: "Water 🜄" },
	{ point: 623, name: "leo", symbol: "♌", element: "Fire 🜂" },
	{ point: 723, name: "virgo", symbol: "♍", element: "Earth 🜃" },
	{ point: 823, name: "libra", symbol: "♎", element: "Air 🜁" },
	{ point: 923, name: "scorpio", symbol: "♏", element: "Water 🜄" },
	{ point: 1022, name: "sagittarius", symbol: "♐", element: "Fire 🜂" },
	{ point: 1122, name: "capricorn", symbol: "♑", element: "Earth 🜃" },
].reverse();

export const getSign = (date: Date) => {
	const month = date.getMonth();
	const day = date.getDate();
	const point = month * 100 + day;
	const sign = signs.find((x) => x.point <= point);
	if (!sign) throw new Error(`No sign found for ${date}`);
	return { name: sign.name, symbol: sign.symbol, element: sign.element };
};
