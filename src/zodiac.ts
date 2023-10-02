const birthgems = [["garnet"], ["amethyst"], ["aquamarine", "bloodstone"], ["diamond"], ["emerald"], ["alexandrite", "moonstone", "pearl"], ["ruby"], ["peridot", "sardonyx", "spinel"], ["sapphire"], ["opal", "tourmaline"], ["citrine", "topaz"], ["tanzanite", "turquoise", "zircon"]];

export const getBirthgem = (date: Date) => {
  const month = date.getMonth();
  const gems = birthgems[month];
  const gem = gems[0];
  if (!gem) throw new Error(`No birthgem found for ${date}`);
  return gem;
};

const signs = [
  { point: 1, name: "capricorn", symbol: "♑" },
  { point: 21, name: "aquarius", symbol: "♒" },
  { point: 120, name: "pisces", symbol: "♓" },
  { point: 221, name: "aries", symbol: "♈" },
  { point: 321, name: "taurus", symbol: "♉" },
  { point: 422, name: "gemini", symbol: "♊" },
  { point: 522, name: "cancer", symbol: "♋" },
  { point: 623, name: "leo", symbol: "♌" },
  { point: 723, name: "virgo", symbol: "♍" },
  { point: 824, name: "libra", symbol: "♎" },
  { point: 924, name: "scorpio", symbol: "♏" },
  { point: 1023, name: "sagittarius", symbol: "♐" },
  { point: 1122, name: "capricorn", symbol: "♑" },
];

export const getSign = (date: Date) => {
  const month = date.getMonth();
  const day = date.getDate();
  const point = month * 100 + day;
  const sign = signs.find((x) => x.point <= point);
  if (!sign) throw new Error(`No sign found for ${date}`);
  return { name: sign.name, symbol: sign.symbol };
};
