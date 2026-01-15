import { z } from "zod";

const ValueSchema = z.object({ value: z.string() });
const CurrentConditionSchema = z.object({
	FeelsLikeC: z.coerce.number(),
	FeelsLikeF: z.coerce.number(),
	cloudcover: z.coerce.number(),
	humidity: z.coerce.number(),
	localObsDateTime: z.string(),
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
