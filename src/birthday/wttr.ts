import { z } from "zod";

const ValueSchema = z.object({ value: z.string() });
const CurrentConditionSchema = z.object({
	FeelsLikeC: z.coerce.number(),
	FeelsLikeF: z.coerce.number(),
	cloudcover: z.coerce.number(),
	humidity: z.coerce.number(),
	observation_time: z.string(),
	precipInches: z.coerce.number(),
	precipMM: z.coerce.number(),
	pressure: z.coerce.number(),
	pressureInches: z.coerce.number(),
	temp_C: z.coerce.number(),
	temp_F: z.coerce.number(),
	uvIndex: z.coerce.number(),
	visibility: z.coerce.number(),
	visibilityMiles: z.coerce.number(),
	weatherCode: z.coerce.number(),
	weatherDesc: z.array(ValueSchema),
	weatherIconUrl: z.array(ValueSchema),
	winddir16Point: z.string(),
	winddirDegree: z.coerce.number(),
	windspeedKmph: z.coerce.number(),
	windspeedMiles: z.coerce.number(),
});

const NearestAreaSchema = z.object({
	areaName: z.array(ValueSchema),
	country: z.array(ValueSchema),
	latitude: z.coerce.number(),
	longitude: z.coerce.number(),
	population: z.coerce.number(),
	region: z.array(ValueSchema),
	weatherUrl: z.array(ValueSchema),
});

const AstronomySchema = z.object({
	moon_illumination: z.coerce.number(),
	moon_phase: z.string(),
	moonrise: z.string(),
	moonset: z.string(),
	sunrise: z.string(),
	sunset: z.string(),
});

const HourlySchema = z.object({
	DewPointC: z.coerce.number(),
	DewPointF: z.coerce.number(),
	FeelsLikeC: z.coerce.number(),
	FeelsLikeF: z.coerce.number(),
	HeatIndexC: z.coerce.number(),
	HeatIndexF: z.coerce.number(),
	WindChillC: z.coerce.number(),
	WindChillF: z.coerce.number(),
	WindGustKmph: z.coerce.number(),
	WindGustMiles: z.coerce.number(),
	chanceoffog: z.coerce.number(),
	chanceoffrost: z.coerce.number(),
	chanceofhightemp: z.coerce.number(),
	chanceofovercast: z.coerce.number(),
	chanceofrain: z.coerce.number(),
	chanceofremdry: z.coerce.number(),
	chanceofsnow: z.coerce.number(),
	chanceofsunshine: z.coerce.number(),
	chanceofthunder: z.coerce.number(),
	chanceofwindy: z.coerce.number(),
	cloudcover: z.coerce.number(),
	diffRad: z.coerce.number(),
	humidity: z.coerce.number(),
	precipInches: z.coerce.number(),
	precipMM: z.coerce.number(),
	pressure: z.coerce.number(),
	pressureInches: z.coerce.number(),
	shortRad: z.coerce.number(),
	tempC: z.coerce.number(),
	tempF: z.coerce.number(),
	time: z.coerce.number(),
	uvIndex: z.coerce.number(),
	visibility: z.coerce.number(),
	visibilityMiles: z.coerce.number(),
	weatherCode: z.coerce.number(),
	weatherDesc: z.array(ValueSchema),
	weatherIconUrl: z.array(ValueSchema),
	winddir16Point: z.string(),
	winddirDegree: z.coerce.number(),
	windspeedKmph: z.coerce.number(),
	windspeedMiles: z.coerce.number(),
});

const WeatherSchema = z.object({
	astronomy: z.array(AstronomySchema),
	avgtempC: z.coerce.number(),
	avgtempF: z.coerce.number(),
	date: z.coerce.date(),
	hourly: z.array(HourlySchema),
	maxtempC: z.coerce.number(),
	maxtempF: z.coerce.number(),
	mintempC: z.coerce.number(),
	mintempF: z.coerce.number(),
	sunHour: z.coerce.number(),
	totalSnow_cm: z.coerce.number(),
	uvIndex: z.coerce.number(),
});

export const WttrResponseSchema = z.object({
	current_condition: z.array(CurrentConditionSchema),
	nearest_area: z.array(NearestAreaSchema),
	request: z.array(z.object({ query: z.string(), type: z.string() })),
	weather: z.array(WeatherSchema),
});

export type WttrResponse = z.infer<typeof WttrResponseSchema>;

export const getWeather = async (location: string) => {
	const response = await fetch(`https://wttr.in/${location}?format=j1`);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch weather for ${location}: ${response.statusText}`,
		);
	}
	const data = await response.json();
	return WttrResponseSchema.parse(data);
};

// --- the persisted cache --------------------------------------------------

/**
 * Bounds for `store.weatherCache`, which is `JSON.stringify`-ed into
 * `localStorage["store"]` on every store mutation.
 *
 * A `?format=j1` payload measured 39,611 bytes for Edinburgh, so ~40 kB per
 * location: the 5 default locations already cost ~198 kB, and ~126 of them
 * exhaust the 5 MB per-origin `localStorage` quota. Once `setItem` throws, the
 * write is lost, so the cache has to stay small by construction rather than by
 * hoping the user does not add too many cities.
 *
 * Two bounds, both applied by `pruneWeatherCache`:
 *
 *  - **TTL** (`WEATHER_CACHE_TTL`, 1 h). The read path only ever serves an
 *    entry younger than `CACHE_DURATION` (10 min), so an hour-old entry could
 *    only ever be refetched — it is dead weight occupying quota. An hour still
 *    covers a reload well inside the same browsing session.
 *  - **LRU** (`WEATHER_CACHE_MAX_ENTRIES`, 8). Past 8, the least-recently-used
 *    entries are dropped. 8 is four more than the 5 default locations, i.e.
 *    ~320 kB worst case (~6% of the 5 MB quota) with room for a handful of
 *    extra cities, while still bounding a runaway list.
 *
 * Anything evicted is refetched on demand, so a wrong guess costs a request,
 * never correctness.
 */
export const WEATHER_CACHE_TTL = 60 * 60 * 1000; // 1 hour
export const WEATHER_CACHE_MAX_ENTRIES = 8;

const WeatherCacheEntrySchema = z.object({
	data: WttrResponseSchema,
	timestamp: z.number(),
	/**
	 * The LRU clock, advanced on every read. Optional because entries written
	 * by an older build have no such field; those rank by `timestamp` instead
	 * (see `weatherCacheRecency`).
	 */
	lastUsed: z.number().optional(),
});

type WeatherCacheEntry = z.infer<typeof WeatherCacheEntrySchema>;
export type WeatherCache = Record<string, WeatherCacheEntry>;

/**
 * How far into the future a `timestamp` may sit and still be trusted. A clock
 * that jumped backwards, or a hand-edited payload, would otherwise make an
 * entry look infinitely fresh. A day of slack absorbs ordinary NTP drift.
 */
const CLOCK_SKEW_TOLERANCE = 24 * 60 * 60 * 1000;

/** An entry is servable when its `timestamp` is finite and inside the TTL. */
const isLive = (entry: WeatherCacheEntry, now: number) => {
	const age = now - entry.timestamp;
	return (
		Number.isFinite(age) &&
		age < WEATHER_CACHE_TTL &&
		age > -CLOCK_SKEW_TOLERANCE
	);
};

/** Entries predating `lastUsed` rank by their fetch time. */
const weatherCacheRecency = (entry: WeatherCacheEntry): number => {
	const recency = entry.lastUsed ?? entry.timestamp;
	return Number.isFinite(recency) ? recency : 0;
};

/**
 * Keep only the entries that still validate, one at a time.
 *
 * Deliberately does not throw on a bad entry. `weatherCache` lives inside the
 * whole-store `localStorage` payload, so letting one malformed entry fail the
 * store-level parse would cost the user their theme, their filters and their
 * saved locations over a value that is only ever a convenience.
 */
export const sanitizeWeatherCache = (input: unknown): WeatherCache => {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return {};
	}
	const cache: WeatherCache = {};
	for (const [location, value] of Object.entries(input)) {
		const parsed = WeatherCacheEntrySchema.safeParse(value);
		if (parsed.success) cache[location] = parsed.data;
	}
	return cache;
};

/**
 * Explicit eviction: drop everything past the TTL, then the
 * least-recently-used entries beyond `WEATHER_CACHE_MAX_ENTRIES`.
 *
 * Returns a fresh object so the caller can assign it back onto the store in a
 * single mutation. Recency ties break on the location name, so which entry
 * survives does not depend on `localStorage` key order.
 */
export const pruneWeatherCache = (
	cache: WeatherCache,
	now: number,
): WeatherCache => {
	// `Object.entries` hands back a fresh array, so sorting it in place is safe.
	const live = Object.entries(cache)
		.filter(([, entry]) => isLive(entry, now))
		.sort(
			(a, b) =>
				weatherCacheRecency(b[1]) - weatherCacheRecency(a[1]) ||
				b[0].localeCompare(a[0]),
		);
	return Object.fromEntries(live.slice(0, WEATHER_CACHE_MAX_ENTRIES));
};

/**
 * Read a cached response, or `null` when there is nothing servable: absent,
 * malformed, from an older persisted shape, expired, or fetched too long ago
 * to be fresh.
 *
 * The entry arrives out of `localStorage`, so it is untrusted input and is
 * validated with `WttrResponseSchema` on the way in — the same guarantee
 * `getWeather` gives. A null result is the caller's cue to refetch; it must
 * never reach the renderer, which indexes `current_condition[0]` and
 * `weather[]` without further checks.
 */
export const readCachedWeather = (
	cache: WeatherCache,
	location: string,
	now: number,
	freshForMs: number,
): WttrResponse | null => {
	const entry = cache[location];
	if (entry === undefined) return null;
	const parsed = WeatherCacheEntrySchema.safeParse(entry);
	if (!parsed.success) return null;

	const { data, timestamp } = parsed.data;
	const age = now - timestamp;
	if (
		!Number.isFinite(age) ||
		age >= freshForMs ||
		age < -CLOCK_SKEW_TOLERANCE
	) {
		return null;
	}

	// LRU: a read counts as a use. Mutating in place keeps the caller's proxy
	// identity, and the store subscription is what persists the new recency.
	entry.lastUsed = now;
	return data;
};

/**
 * Store a freshly fetched response, enforcing the bounds in the same step.
 *
 * This is the only place the cache grows, so it is also the only place that has
 * to shrink it: every write goes through here and comes back capped and aged
 * out. A payload that somehow does not validate is dropped rather than cached.
 */
export const writeCachedWeather = (
	cache: WeatherCache,
	location: string,
	data: WttrResponse,
	now: number,
): WeatherCache => {
	const parsed = WttrResponseSchema.safeParse(data);
	if (!parsed.success) return pruneWeatherCache(cache, now);
	return pruneWeatherCache(
		{
			...cache,
			[location]: { data: parsed.data, timestamp: now, lastUsed: now },
		},
		now,
	);
};
