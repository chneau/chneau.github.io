export interface Birthday {
  name: string;
  isWedding?: boolean;
  year: number;
  month: number;
  day: number;
}

export const birthdays: Birthday[] = [
  { name: `Ariimoana`, year: 2013, month: 7, day: 11 },
  { name: `Brigitte`, year: 1982, month: 3, day: 12 },
  { name: `Cécile`, year: 1977, month: 10, day: 5 },
  { name: `Charles`, year: 1992, month: 8, day: 13 },
  { name: `Christian`, year: 1951, month: 5, day: 8 },
  { name: `Christian`, year: 1975, month: 10, day: 23 },
  { name: `Christopher`, year: 1982, month: 2, day: 12 },
  { name: `Dorothée`, year: 1951, month: 3, day: 9 },
  { name: `Edouard`, year: 2014, month: 5, day: 16 },
  { name: `Elena`, year: 2016, month: 7, day: 30 },
  { name: `Georges`, year: 2017, month: 4, day: 3 },
  { name: `Julien`, year: 1970, month: 11, day: 27 },
  { name: `Justin`, year: 2007, month: 6, day: 18 },
  { name: `Lucia`, year: 2014, month: 12, day: 17 },
  { name: `Marie`, year: 1945, month: 9, day: 1 },
  { name: `Martin`, year: 1973, month: 1, day: 4 },
  { name: `Maximin`, year: 1978, month: 10, day: 4 },
  { name: `Moanaragi`, year: 2018, month: 4, day: 11 },
  { name: `Nadia`, year: 1979, month: 2, day: 5 },
  { name: `Nicolas`, year: 2019, month: 1, day: 30 },
  { name: `Ravahere`, year: 1982, month: 6, day: 8 },
  { name: `Sandra`, year: 1977, month: 4, day: 13 },
  { name: `Simon`, year: 2005, month: 3, day: 24 },
  { name: `Sophie`, year: 1997, month: 10, day: 11 },
  { name: `Vadim`, year: 2014, month: 4, day: 15 },
  { name: `Vaimoana`, year: 2005, month: 4, day: 13 },
  { name: `Victor`, year: 2008, month: 7, day: 21 },
  { name: `Brigitte & Julien`, year: 2016, month: 2, day: 19, isWedding: true },
  { name: `Cécile & Christian`, year: 2005, month: 2, day: 26, isWedding: true },
  { name: `Dorothée & Christian`, year: 1977, month: 3, day: 25, isWedding: true },
  { name: `Nadia & Christopher`, year: 2010, month: 9, day: 4, isWedding: true },
  { name: `Ravahere & Martin`, year: 2005, month: 3, day: 26, isWedding: true },
  { name: `Sandra & Maximin`, year: 2014, month: 10, day: 3, isWedding: true },
];
