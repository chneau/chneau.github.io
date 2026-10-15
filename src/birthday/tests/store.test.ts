import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	setSystemTime,
	test,
} from "bun:test";
import dayjs from "dayjs";
import Fuse from "fuse.js";
import {
	type Birthday,
	birthdays,
	monthNames,
	recomputeBirthdays,
	subscribeBirthdays,
} from "../birthdays";
import { WEATHER_CACHE_TTL } from "../wttr";

type StoreModule = typeof import("../store");

const BOY = "\u2642\uFE0F";
const GIRL = "\u2640\uFE0F";
const WEDDING = "\u{1F492}";

const FUSE_KEYS = [
	"name",
	"sign",
	"signSymbol",
	"birthgem",
	"birthdayString",
	"age",
	"chineseZodiac",
	"kind",
	"generation",
	"decade",
	"ageGroup",
	"element",
	"monthName",
] as const;

const fuseOptions = {
	threshold: 0.4,
	ignoreLocation: true,
	useExtendedSearch: true,
} as const;

const singleKeyFuse = (
	key: (typeof FUSE_KEYS)[number],
	collection: Birthday[],
) => new Fuse(collection, { ...fuseOptions, keys: [key] });

const names = (list: Birthday[]) => list.map((x) => x.name);
const sorted = (list: Birthday[]) => names(list).sort();
const isWedding = (x: Birthday) => x.kind === WEDDING;
const visible = (list: Birthday[]) => list.filter((x) => !isWedding(x));

const globals = globalThis as unknown as Record<string, unknown>;

const createStorage = (seed?: string) => {
	const map = new Map<string, string>();
	if (seed !== undefined) map.set("store", seed);
	return {
		map,
		storage: {
			getItem: (k: string) => map.get(k) ?? null,
			setItem: (k: string, v: string) => {
				map.set(k, v);
			},
			removeItem: (k: string) => {
				map.delete(k);
			},
			clear: () => map.clear(),
			key: (i: number) => [...map.keys()][i] ?? null,
			get length() {
				return map.size;
			},
		},
	};
};

const documentListeners: Record<string, (() => void)[]> = {};
const intervalCallbacks: (() => void)[] = [];

const createDocument = () => ({
	hidden: false,
	addEventListener: (type: string, cb: () => void) => {
		const existing = documentListeners[type] ?? [];
		existing.push(cb);
		documentListeners[type] = existing;
	},
	removeEventListener: (type: string, cb: () => void) => {
		documentListeners[type] = (documentListeners[type] ?? []).filter(
			(x) => x !== cb,
		);
	},
});

let sharedDocument: ReturnType<typeof createDocument> | null = null;

const GUARD_EPOCH = Date.parse("2030-03-15T12:00:00Z");
const ROLL_EPOCH = Date.parse("2031-06-20T12:00:00Z");

const reanchor = (epoch: number): void => {
	setSystemTime(new Date(epoch));
	dispatchVisibilityChange();
	recomputeBirthdays();
};

const dispatchVisibilityChange = () => {
	for (const cb of documentListeners.visibilitychange ?? []) cb();
};

const disposers: (() => void)[] = [];
let instanceCounter = 0;

const quietly = async <T>(fn: () => Promise<T>): Promise<T> => {
	const original = console.error;
	console.error = () => {};
	try {
		return await fn();
	} finally {
		console.error = original;
	}
};

type LoadedStore = { mod: StoreModule };

const loadStore = async (
	raw?: string,
	{ withDom = false } = {},
): Promise<LoadedStore> => {
	const { storage } = createStorage(raw);
	const previous = {
		localStorage: globals.localStorage,
		window: globals.window,
		document: globals.document,
		setInterval: globals.setInterval,
	};

	globals.localStorage = storage;
	if (withDom) {
		globals.window = {};
		sharedDocument = createDocument();
		globals.document = sharedDocument;
		globals.setInterval = (cb: () => void) => {
			intervalCallbacks.push(cb);
			return intervalCallbacks.length;
		};
	} else {
		globals.window = undefined;
		globals.document = undefined;
		globals.setInterval = undefined;
	}

	let mod: StoreModule;
	try {
		mod = (await import(
			`../store?instance=${instanceCounter++}`
		)) as StoreModule;
	} finally {
		const restore = () => {
			globals.localStorage = previous.localStorage;
			globals.window = previous.window;
			globals.document = previous.document;
			globals.setInterval = previous.setInterval;
		};
		if (withDom) disposers.push(restore);
		else restore();
	}

	return { mod };
};

let store: StoreModule["store"];
let dataStore: StoreModule["dataStore"];

const settle = () => new Promise<void>((r) => setTimeout(r, 260));

const search = async (query: string): Promise<Birthday[]> => {
	store.search = query;
	await settle();
	return [...dataStore.filtered];
};

const setKinds = async (kinds: {
	showBoys?: boolean;
	showGirls?: boolean;
	showWeddings?: boolean;
}) => {
	if (kinds.showBoys !== undefined) store.showBoys = kinds.showBoys;
	if (kinds.showGirls !== undefined) store.showGirls = kinds.showGirls;
	if (kinds.showWeddings !== undefined) store.showWeddings = kinds.showWeddings;
	await settle();
};

beforeAll(async () => {
	const { mod } = await loadStore(undefined, { withDom: true });
	store = mod.store;
	dataStore = mod.dataStore;
	recomputeBirthdays();
	await settle();
	expect(birthdays.length).toBeGreaterThan(0);
});

afterAll(() => {
	for (const dispose of disposers) dispose();
	disposers.length = 0;
	setSystemTime(new Date());
	recomputeBirthdays();
});

beforeEach(() => {
	store.search = "";
	store.showBoys = true;
	store.showGirls = true;
	store.showWeddings = false;
});

describe("store / Fuse index: which fields are searchable", () => {
	test("a name query matches, best match first", async () => {
		const results = await search("Christian");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.name).toBe("Christian");
	});

	test("every configured key is indexed", () => {
		for (const key of FUSE_KEYS) {
			const sample = birthdays.find((x) => !isWedding(x)) as Birthday;
			const raw = sample[key];
			const query = typeof raw === "number" ? String(raw) : raw;
			expect(typeof query).toBe("string");
			expect(
				`${key}:${singleKeyFuse(key, [sample]).search(query).length}`,
			).toBe(`${key}:1`);
		}
	});

	test("fields present on Birthday but absent from the key list are unsearchable", async () => {
		expect(
			birthdays.filter((x) => x.season === "spring").length,
		).toBeGreaterThan(0);
		expect(await search("spring")).toEqual([]);
		expect(await search("full_moon")).toEqual([]);
		expect(await search("insight_3")).toEqual([]);
		expect(await search("life_path_5")).toEqual([]);
	});

	test("numbers match `age`, and they also match the date string", async () => {
		const sample = birthdays.find((x) => !isWedding(x)) as Birthday;
		expect(names(await search(String(sample.age)))).toContain(sample.name);

		const byDay = await search("30");
		for (const hit of byDay) {
			const explainable = hit.age === 30 || hit.birthdayString.endsWith("30");
			expect(`${hit.name}:${explainable}`).toBe(`${hit.name}:true`);
		}
		for (const thirty of birthdays.filter((x) => x.age === 30)) {
			expect(names(byDay)).toContain(thirty.name);
		}
	});

	test("a single digit is not a usable query", async () => {
		expect((await search("0")).length).toBeGreaterThan(birthdays.length / 2);
	});

	test("a full date finds its record first, and is fuzzy around it", async () => {
		const subject = birthdays.find((x) => !isWedding(x)) as Birthday;
		const results = await search(subject.birthdayString);
		expect(names(results)[0]).toBe(subject.name);
		expect(results.length).toBeGreaterThan(1);
	});

	test("translated (non-English) values are not searchable", async () => {
		const signs = [...new Set(birthdays.map((x) => x.sign))];
		expect(signs.length).toBeGreaterThan(1);
		const counts = new Map<string, number>();
		for (const x of birthdays) {
			counts.set(x.sign, (counts.get(x.sign) ?? 0) + 1);
		}
		for (const sign of signs) {
			const expected = visible(birthdays.filter((x) => x.sign === sign)).length;
			expect(expected).toBeGreaterThan(0);
			expect((await search(sign)).length).toBeGreaterThanOrEqual(expected);
		}

		for (const [translated, english, field, nonLatin] of [
			["Bélier", "aries", "sign", false],
			["Génération Z", "gen_z", "generation", false],
			["Ados", "teens", "ageGroup", false],
			["Septembre", "sep", "monthName", false],
			["Widder", "aries", "sign", false],
			["Teenager", "teens", "ageGroup", false],
			["Mayores", "seniors", "ageGroup", false],
			["Adolescentes", "teens", "ageGroup", false],
			["白羊座", "aries", "sign", true],
			["青少年", "teens", "ageGroup", true],
			["长者", "seniors", "ageGroup", true],
			["Z世代", "gen_z", "generation", true],
			["Teens \u{1F9D2} (<20)", "teens", "ageGroup", false],
			["Seniors \u{1F9D3} (60+)", "seniors", "ageGroup", false],
		] as const) {
			const viaKey = await search(english);
			const viaTranslation = await search(translated);
			expect(`${english}/${field}=${viaKey.length}`).not.toBe(
				`${english}/${field}=0`,
			);
			expect(sorted(viaTranslation)).not.toEqual(sorted(viaKey));
			if (nonLatin) {
				expect(`${translated}=${viaTranslation.length}`).toBe(
					`${translated}=0`,
				);
			}
		}
	}, 20000);

	test("fuzzy noise: a translated word can land on the wrong English record", async () => {
		for (const hit of await search("Senioren")) {
			expect(hit.ageGroup).toBe("seniors");
		}
	});
});

describe("store / Filter.tsx shortcut chips", () => {
	const chipQueries = () => {
		const month = dayjs().month();
		return {
			thisMonth: monthNames[month] as string,
			nextMonth: monthNames[(month + 1) % 12] as string,
			genZ: "gen_z",
			teens: "teens",
			seniors: "seniors",
		};
	};

	test("no chip query returns an empty list", async () => {
		const chips = chipQueries();
		for (const [label, query] of Object.entries(chips)) {
			const n = (await search(query)).length;
			expect(`${label}(${query})=${n}`).not.toBe(`${label}(${query})=0`);
		}
	}, 20000);

	test("teens and seniors chips are exact", async () => {
		for (const [label, query] of [
			["teens", "teens"],
			["seniors", "seniors"],
		] as const) {
			const got = await search(query);
			const expected = visible(birthdays.filter((x) => x.ageGroup === label));
			expect(got.length).toBeGreaterThan(0);
			expect(sorted(got)).toEqual(sorted(expected));
		}
	});

	test("BUG: the gen_z chip matches far more than the gen_z generation", async () => {
		const got = await search("gen_z");
		const expected = visible(birthdays.filter((x) => x.generation === "gen_z"));

		for (const x of expected) expect(names(got)).toContain(x.name);
		const wrong = got.filter((x) => x.generation !== "gen_z");
		expect(wrong.length).toBeGreaterThan(0);
		expect(got.length).toBeGreaterThan(expected.length);

		expect(sorted(await search("Gen Z"))).toEqual(sorted(expected));
	});

	test("a month chip matches exactly that month and nothing else", async () => {
		for (let month = 0; month < 12; month += 1) {
			const { mod } = await loadStore();
			mod.store.facets.month = month + 1;
			mod.store.facets.monthDay = dayjs().format("YYYY-MM-DD");
			await settle();

			const expected = visible(
				birthdays.filter((x) => x.monthName === monthNames[month]),
			);
			expect(expected.length).toBeGreaterThan(0);
			expect(names([...mod.dataStore.filtered])).toEqual(names(expected));
		}
	});

	test("a month facet is not stale after midnight", async () => {
		const { mod } = await loadStore();
		mod.store.facets.month = 8;
		mod.store.facets.monthDay = dayjs().format("YYYY-MM-DD");
		await settle();
		expect(mod.dataStore.filtered.length).toBeGreaterThan(0);

		mod.store.facets.monthDay = dayjs().subtract(1, "day").format("YYYY-MM-DD");
		await settle();
		expect(mod.isMonthFacetActive()).toBe(false);
		expect(mod.dataStore.filtered.length).toBe(visible(birthdays).length);
	});
});

describe("store / kind toggles", () => {
	const weddingCount = () => birthdays.filter(isWedding).length;
	const boyCount = () => birthdays.filter((x) => x.kind === BOY).length;
	const girlCount = () => birthdays.filter((x) => x.kind === GIRL).length;

	test("the default hides weddings and shows everybody else", async () => {
		const got = await search("");
		expect(got.length).toBe(birthdays.length - weddingCount());
		expect(got.filter(isWedding).length).toBe(0);
		expect(got.length).toBe(boyCount() + girlCount());
	});

	test("showWeddings adds the wedding records back", async () => {
		await setKinds({ showWeddings: true });
		const got = await search("");
		expect(got.length).toBe(birthdays.length);
		expect(got.filter(isWedding).length).toBe(weddingCount());
	});

	test("showBoys and showGirls drop exactly one kind each", async () => {
		await setKinds({ showBoys: false });
		let got = await search("");
		expect(got.filter((x) => x.kind === BOY).length).toBe(0);
		expect(got.length).toBe(girlCount());

		await setKinds({ showBoys: true, showGirls: false });
		got = await search("");
		expect(got.filter((x) => x.kind === GIRL).length).toBe(0);
		expect(got.length).toBe(boyCount());
	});

	test("the three toggles compose additively", async () => {
		await setKinds({ showBoys: false, showWeddings: true });
		const expected = birthdays.filter((x) => x.kind === GIRL || isWedding(x));
		expect(sorted(await search(""))).toEqual(sorted(expected));

		await setKinds({ showBoys: false, showGirls: false });
		expect(sorted(await search(""))).toEqual(
			sorted(birthdays.filter(isWedding)),
		);
	}, 20000);

	test("search results go through the kind filter too", async () => {
		expect(await search("weddings")).toEqual([]);
		await setKinds({ showWeddings: true });
		expect(sorted(await search("weddings"))).toEqual(
			sorted(birthdays.filter(isWedding)),
		);
		expect(sorted(await search(WEDDING))).toEqual(
			sorted(birthdays.filter(isWedding)),
		);
	});

	test("an unmatched query empties the list, blank whitespace does not", async () => {
		expect(await search("zzzzqqqq")).toEqual([]);
		expect((await search("   ")).length).toBe(
			birthdays.length - weddingCount(),
		);
	});

	test("state is persisted to localStorage and restores on reload", async () => {
		store.search = "persisted?";
		store.darkMode = false;
		await settle();

		const raw = (
			globals.localStorage as { getItem: (k: string) => string | null }
		).getItem("store");
		expect(raw).not.toBeNull();
		const written = JSON.parse(raw ?? "{}") as Record<string, unknown>;
		expect(written.search).toBe("persisted?");
		expect(written.darkMode).toBe(false);
		expect(written.showWeddings).toBe(false);

		const { mod } = await loadStore(raw ?? undefined);
		expect(mod.store.search).toBe("persisted?");
		expect(mod.store.darkMode).toBe(false);
	});
});

describe("store / getInitialState from localStorage", () => {
	const defaultLocations = [
		"Edinburgh",
		"Issoire",
		"Madrid",
		"Verdun",
		"Oberageri",
	];
	const expectDefaults = (mod: StoreModule, label: string) => {
		expect(`${label} search=${mod.store.search}`).toBe(`${label} search=`);
		expect(`${label} boys=${mod.store.showBoys}`).toBe(`${label} boys=true`);
		expect(`${label} girls=${mod.store.showGirls}`).toBe(`${label} girls=true`);
		expect(`${label} weddings=${mod.store.showWeddings}`).toBe(
			`${label} weddings=false`,
		);
		expect(`${label} dark=${mod.store.darkMode}`).toBe(`${label} dark=true`);
		expect(`${label} locs=${mod.store.weatherLocations.length}`).toBe(
			`${label} locs=5`,
		);
		expect(`${label} cache=${JSON.stringify(mod.store.weatherCache)}`).toBe(
			`${label} cache={}`,
		);
	};

	test("nothing saved yields the documented defaults", async () => {
		const { mod } = await loadStore(undefined);
		expectDefaults(mod, "empty");
		expect(mod.store.weatherLocations).toEqual(defaultLocations);
		expect(mod.dataStore.filtered.length).toBe(visible(birthdays).length);
	});

	test("an empty string counts as nothing saved", async () => {
		expectDefaults((await loadStore("")).mod, "blank");
	});

	test("a valid partial value is merged over the defaults", async () => {
		const { mod } = await loadStore(
			JSON.stringify({ darkMode: false, search: "hello", showWeddings: true }),
		);
		expect(mod.store.darkMode).toBe(false);
		expect(mod.store.search).toBe("hello");
		expect(mod.store.showWeddings).toBe(true);
		expect(mod.store.showBoys).toBe(true);
		expect(mod.store.weatherLocations).toEqual(defaultLocations);
		expect(mod.store.weatherCache).toEqual({});
	});

	test("corrupt JSON falls back to the defaults instead of throwing", async () => {
		expectDefaults(
			(await quietly(() => loadStore("{{{not json"))).mod,
			"corrupt",
		);
	});

	test("a wrong-typed value falls back to the defaults", async () => {
		for (const bad of [
			JSON.stringify({ search: 42 }),
			JSON.stringify({ darkMode: "yes" }),
			JSON.stringify({ weatherLocations: "Edinburgh" }),
			JSON.stringify({
				weatherCache: { Edinburgh: { data: {}, timestamp: 1 } },
			}),
			JSON.stringify([1, 2, 3]),
			JSON.stringify("a bare string"),
			JSON.stringify({ unknownKey: 1 }),
		]) {
			expectDefaults((await quietly(() => loadStore(bad))).mod, bad);
		}
	});

	test("JSON scalars spread to nothing and keep the defaults", async () => {
		for (const raw of ["null", "0", "true"]) {
			const { mod } = await loadStore(raw);
			expect(`${raw}->${mod.store.showWeddings}`).toBe(`${raw}->false`);
			expect(`${raw}->${mod.store.weatherLocations.length}`).toBe(`${raw}->5`);
		}
	});

	test("a saved search is applied to the very first filtered list", async () => {
		const { mod } = await loadStore(JSON.stringify({ search: "weddings" }));
		expect(mod.dataStore.filtered.length).toBe(0);
		await settle();
		expect(mod.dataStore.filtered.length).toBe(0);

		const sign = birthdays[0]?.sign as Birthday["sign"];
		const { mod: shown } = await loadStore(
			JSON.stringify({ search: sign, showWeddings: true }),
		);
		expect(shown.dataStore.filtered.length).toBeGreaterThan(0);
		for (const x of shown.dataStore.filtered) expect(x.sign).toBe(sign);
	});

	test("a valid weatherCache entry round-trips", async () => {
		const entry = wttrEntry(Date.now());
		const { mod } = await loadStore(
			JSON.stringify({ weatherCache: { Edinburgh: entry } }),
		);
		expect(Object.keys(mod.store.weatherCache)).toEqual(["Edinburgh"]);
		expect(mod.store.weatherCache.Edinburgh?.timestamp).toBe(entry.timestamp);
		expect(
			mod.store.weatherCache.Edinburgh?.data.current_condition[0]?.temp_C,
		).toBe(7);
	});

	test("an expired weatherCache entry is dropped on load, not on the whole store", async () => {
		const stale = wttrEntry(Date.now() - WEATHER_CACHE_TTL - 1000);
		const { mod } = await loadStore(
			JSON.stringify({
				darkMode: false,
				search: "kept",
				weatherCache: { Edinburgh: stale, Madrid: wttrEntry(Date.now()) },
			}),
		);
		expect(Object.keys(mod.store.weatherCache)).toEqual(["Madrid"]);
		expect(mod.store.search).toBe("kept");
		expect(mod.store.darkMode).toBe(false);
		expect(mod.store.weatherLocations).toEqual(defaultLocations);
	});
});

const wttrEntry = (timestamp: number) => {
	const value = (v: string) => ({ value: v });
	const numeric = <T extends Record<string, unknown>>(base: T) =>
		Object.fromEntries(Object.keys(base).map((k) => [k, k === "time" ? 0 : 1]));
	const hourly = numeric({
		DewPointC: 0,
		DewPointF: 0,
		FeelsLikeC: 0,
		FeelsLikeF: 0,
		HeatIndexC: 0,
		HeatIndexF: 0,
		WindChillC: 0,
		WindChillF: 0,
		WindGustKmph: 0,
		WindGustMiles: 0,
		chanceoffog: 0,
		chanceoffrost: 0,
		chanceofhightemp: 0,
		chanceofovercast: 0,
		chanceofrain: 0,
		chanceofremdry: 0,
		chanceofsnow: 0,
		chanceofsunshine: 0,
		chanceofthunder: 0,
		chanceofwindy: 0,
		cloudcover: 0,
		diffRad: 0,
		humidity: 0,
		precipInches: 0,
		precipMM: 0,
		pressure: 0,
		pressureInches: 0,
		shortRad: 0,
		tempC: 0,
		tempF: 0,
		time: 0,
		uvIndex: 0,
		visibility: 0,
		visibilityMiles: 0,
		weatherCode: 0,
		weatherDesc: 0,
		weatherIconUrl: 0,
		winddir16Point: 0,
		winddirDegree: 0,
		windspeedKmph: 0,
		windspeedMiles: 0,
	});
	const current = numeric({
		FeelsLikeC: 0,
		FeelsLikeF: 0,
		cloudcover: 0,
		humidity: 0,
		precipInches: 0,
		precipMM: 0,
		pressure: 0,
		pressureInches: 0,
		temp_C: 0,
		temp_F: 0,
		uvIndex: 0,
		visibility: 0,
		visibilityMiles: 0,
		weatherCode: 0,
		winddirDegree: 0,
		windspeedKmph: 0,
		windspeedMiles: 0,
		observation_time: 0,
		weatherDesc: 0,
		weatherIconUrl: 0,
		winddir16Point: 0,
	});
	return {
		timestamp,
		data: {
			current_condition: [
				{
					...current,
					temp_C: 7,
					observation_time: "12:00 AM",
					weatherDesc: [value("Cloudy")],
					weatherIconUrl: [value("")],
					winddir16Point: "N",
				},
			],
			nearest_area: [
				{
					areaName: [value("Edinburgh")],
					country: [value("United Kingdom")],
					latitude: 0,
					longitude: 0,
					population: 0,
					region: [value("Scotland")],
					weatherUrl: [value("")],
				},
			],
			request: [{ query: "Edinburgh", type: "City" }],
			weather: [
				{
					astronomy: [
						{
							moon_illumination: 0,
							moon_phase: "New Moon",
							moonrise: "00:00 AM",
							moonset: "00:00 AM",
							sunrise: "00:00 AM",
							sunset: "00:00 AM",
						},
					],
					avgtempC: 0,
					avgtempF: 0,
					date: new Date(0),
					hourly: [
						{
							...hourly,
							weatherDesc: [value("Cloudy")],
							weatherIconUrl: [value("")],
							winddir16Point: "N",
						},
					],
					maxtempC: 0,
					maxtempF: 0,
					mintempC: 0,
					mintempF: 0,
					sunHour: 0,
					totalSnow_cm: 0,
					uvIndex: 0,
				},
			],
		},
	};
};

describe("store / date roll", () => {
	let recomputes = 0;

	beforeAll(() => {
		subscribeBirthdays(() => {
			recomputes++;
		});
	});

	test("the roll is wired to exactly one visibilitychange listener and one interval", () => {
		expect(documentListeners.visibilitychange?.length).toBe(1);
		expect(intervalCallbacks.length).toBe(1);
	});

	test("checkDateRoll recomputes exactly once per calendar day", () => {
		reanchor(GUARD_EPOCH);
		const day = new Date(GUARD_EPOCH);
		const start = recomputes;

		setSystemTime(new Date(day.getTime() + 60 * 60 * 1000));
		dispatchVisibilityChange();
		dispatchVisibilityChange();
		expect(recomputes - start).toBe(0);

		setSystemTime(new Date(day.getTime() + 26 * 60 * 60 * 1000));
		dispatchVisibilityChange();
		expect(recomputes - start).toBe(1);
		dispatchVisibilityChange();
		expect(recomputes - start).toBe(1);

		for (const cb of intervalCallbacks) cb();
		expect(recomputes - start).toBe(1);
	});

	test("a hidden document never triggers the roll", () => {
		const doc = sharedDocument;
		if (!doc) throw new Error("no stubbed document");
		const before = recomputes;
		doc.hidden = true;
		dispatchVisibilityChange();
		expect(recomputes).toBe(before);
		doc.hidden = false;
	});

	test("a day later the derived data is re-computed against the new date", async () => {
		reanchor(ROLL_EPOCH);
		const subject = birthdays.find(
			(x) => !isWedding(x) && x.daysBeforeBirthday >= 2,
		) as Birthday;
		const before = {
			ageInDays: subject.ageInDays,
			daysBeforeBirthday: subject.daysBeforeBirthday,
		};

		const start = recomputes;
		setSystemTime(new Date(ROLL_EPOCH + 24 * 60 * 60 * 1000 + 60 * 60 * 1000));
		dispatchVisibilityChange();
		expect(recomputes - start).toBe(1);

		const after = birthdays.find((x) => x.name === subject.name) as Birthday;
		expect(after.ageInDays).toBe(before.ageInDays + 1);
		expect(after.daysBeforeBirthday).toBe(before.daysBeforeBirthday - 1);

		store.search = subject.name;
		await settle();
		expect(names(dataStore.filtered)).toContain(subject.name);
	});
});
