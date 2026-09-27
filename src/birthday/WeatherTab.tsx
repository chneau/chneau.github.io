import {
	Accordion,
	Box,
	Button,
	Card,
	Divider,
	Group,
	SimpleGrid,
	Skeleton,
	Stack,
	Text,
	TextInput,
	Title,
	Tooltip,
} from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
	ArrowDown,
	ArrowUp,
	Clock,
	GripVertical,
	Plus,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { ConfirmPopover } from "./ConfirmPopover";
import type en from "./locales/en.json";
import { notify } from "./notify";
import { store } from "./store";
import { getWeather, type WttrResponse } from "./wttr";

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

type WeatherKey = `app.weather.codes.${keyof typeof en.app.weather.codes}`;

const weatherMapping: Record<number, string> = {
	113: "☀️", // Sunny
	116: "⛅", // Partly cloudy
	119: "☁️", // Cloudy
	122: "☁️", // Overcast
	143: "🌫️", // Mist
	176: "🌦️", // Patchy rain possible
	179: "🌨️", // Patchy snow possible
	182: "🌨️", // Patchy sleet possible
	185: "🌨️", // Patchy freezing drizzle possible
	200: "⛈️", // Thundery outbreaks possible
	227: "🌨️", // Blowing snow
	230: "❄️", // Blizzard
	248: "🌫️", // Fog
	260: "🌫️", // Freezing fog
	263: "🌦️", // Patchy light drizzle
	266: "🌦️", // Light drizzle
	281: "🌧️", // Freezing drizzle
	284: "🌧️", // Heavy freezing drizzle
	293: "🌦️", // Patchy light rain
	296: "🌦️", // Light rain
	299: "🌧️", // Moderate rain at times
	302: "🌧️", // Moderate rain
	305: "🌧️", // Heavy rain at times
	308: "🌧️", // Heavy rain
	311: "🌧️", // Light freezing rain
	314: "🌧️", // Moderate or heavy freezing rain
	317: "🌨️", // Light sleet
	320: "🌨️", // Moderate or heavy sleet
	323: "🌨️", // Patchy light snow
	326: "🌨️", // Light snow
	329: "❄️", // Patchy moderate snow
	332: "❄️", // Moderate snow
	335: "❄️", // Patchy heavy snow
	338: "❄️", // Heavy snow
	350: "🌨️", // Ice pellets
	353: "🌦️", // Light rain shower
	356: "🌧️", // Moderate or heavy rain shower
	359: "🌧️", // Torrential rain shower
	362: "🌨️", // Light sleet showers
	365: "🌨️", // Moderate or heavy sleet showers
	368: "🌨️", // Light snow showers
	371: "❄️", // Moderate or heavy snow showers
	374: "🌨️", // Light showers of ice pellets
	377: "🌨️", // Moderate or heavy showers of ice pellets
	386: "⛈️", // Patchy light rain with thunder
	389: "⛈️", // Moderate or heavy rain with thunder
	392: "⛈️", // Patchy light snow with thunder
	395: "❄️", // Moderate or heavy snow with thunder
};
const getWeatherEmoji = (code: number | undefined) =>
	(code && weatherMapping[code]) || "🌡️";

const fetchWeatherWithCache = async (
	location: string,
): Promise<WttrResponse> => {
	const cached = store.weatherCache[location];
	const now = Date.now();

	if (cached && now - cached.timestamp < CACHE_DURATION) {
		return cached.data as WttrResponse;
	}

	const data = await getWeather(location);
	store.weatherCache[location] = {
		data,
		timestamp: now,
	};
	return data;
};

const HourlyForecast = ({ weather }: { weather: WttrResponse }) => {
	const { t } = useTranslation();
	// Get next 24 hours (across today and tomorrow if needed)
	const allHourly = weather.weather.flatMap((w) =>
		w.hourly.map((h) => ({ ...h, date: w.date })),
	);

	// Filter to show from now onwards
	const now = dayjs();
	const hourly = allHourly
		.filter((h) => {
			const hTime = dayjs(h.date).hour(Math.floor(h.time / 100));
			return hTime.isAfter(now.subtract(1, "hour"));
		})
		.slice(0, 12);

	return (
		<div style={{ overflowX: "auto", display: "flex", padding: "8px 0" }}>
			{hourly.map((h, i) => (
				<div
					key={`${h.date}-${h.time}`}
					style={{
						minWidth: 60,
						textAlign: "center",
						padding: "0 8px",
						borderRight:
							i < hourly.length - 1 ? "1px solid var(--tk-border)" : "none",
					}}
				>
					<Text c="dimmed" style={{ fontSize: 12 }}>
						{h.time === 0 ? "00:00" : `${h.time / 100}:00`}
					</Text>
					<div style={{ margin: "4px 0", fontSize: 20 }}>
						{getWeatherEmoji(h.weatherCode)}
					</div>
					<div style={{ margin: "4px 0" }}>
						<Text fw={700}>{h.tempC}°</Text>
					</div>
					<Text style={{ fontSize: 10, display: "block" }}>
						{t(`app.weather.codes.${h.weatherCode}` as WeatherKey)}
					</Text>
				</div>
			))}
		</div>
	);
};

const DailyForecast = ({ weather }: { weather: WttrResponse }) => {
	const { t } = useTranslation();
	return (
		<Stack gap={0}>
			{weather.weather.map((day, i) => (
				<Box key={dayjs(day.date).format("YYYY-MM-DD")}>
					{i > 0 && <Divider />}
					<Group justify="space-between" align="center" py="xs" wrap="nowrap">
						<Text fw={700} style={{ minWidth: 110 }}>
							{dayjs(day.date).format("ddd D MMM")}
						</Text>
						<Group gap={6} wrap="nowrap" style={{ flex: 1 }}>
							<span style={{ fontSize: 18 }}>
								{getWeatherEmoji(day.hourly[4]?.weatherCode)}
							</span>
							<Text c="dimmed">
								{day.hourly[4]?.weatherCode &&
									t(
										`app.weather.codes.${
											day.hourly[4].weatherCode
										}` as WeatherKey,
									)}
							</Text>
						</Group>
						<Group gap={4} wrap="nowrap">
							<Text fw={700}>{day.maxtempC}°</Text> /{" "}
							<Text c="dimmed">{day.mintempC}°</Text>
						</Group>
					</Group>
				</Box>
			))}
		</Stack>
	);
};

type WeatherItemProps = {
	location: string;
	index: number;
	total: number;
	onMove: (from: number, to: number) => void;
};

const WeatherItem = ({ location, index, total, onMove }: WeatherItemProps) => {
	const { t } = useTranslation();
	const storeSnap = useSnapshot(store);
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["weather", location],
		queryFn: () => fetchWeatherWithCache(location),
		staleTime: CACHE_DURATION,
	});

	if (isLoading) {
		return (
			<Card withBorder padding="sm" style={{ marginBottom: 12 }}>
				<Stack gap="xs">
					<Skeleton height={14} width="40%" />
					<Skeleton height={14} width="70%" />
				</Stack>
			</Card>
		);
	}

	if (error || !data || !data.current_condition?.[0]) {
		return (
			<Card withBorder padding="sm" style={{ marginBottom: 12 }}>
				<Group gap="sm" align="center">
					<Text c="red">{t("app.weather.error", { location })}</Text>
					<Button size="xs" variant="default" onClick={() => refetch()}>
						{t("app.weather.retry")}
					</Button>
					<ConfirmPopover
						title={t("app.weather.remove_title", { location })}
						confirmLabel={t("app.weather.remove_confirm")}
						cancelLabel={t("common.cancel")}
						danger
						onConfirm={() => {
							store.weatherLocations = store.weatherLocations.filter(
								(l) => l !== location,
							);
							notify.info(`Removed ${location}`);
						}}
					>
						<Button size="xs" variant="default" color="red">
							<Trash2 size={14} />
						</Button>
					</ConfirmPopover>
				</Group>
			</Card>
		);
	}

	const current = data.current_condition[0];
	const lastFetched = storeSnap.weatherCache[location]?.timestamp;
	const today = data.weather[0];

	return (
		<Accordion
			variant="contained"
			styles={{
				item: {
					backgroundColor: "var(--tk-surface-2)",
					border: "none",
				},
				control: { backgroundColor: "transparent" },
			}}
			style={{ marginBottom: 12, borderRadius: 8, overflow: "hidden" }}
		>
			<Accordion.Item value="1">
				<Accordion.Control>
					<Group justify="space-between" align="center" wrap="nowrap">
						<Group gap="xs" wrap="nowrap">
							<Tooltip label={t("app.weather.drag_reorder")}>
								<GripVertical
									size={16}
									style={{ cursor: "grab", color: "var(--tk-text-faint)" }}
								/>
							</Tooltip>
							<Group gap={2} wrap="nowrap">
								<Button
									variant="subtle"
									size="xs"
									disabled={index === 0}
									onClick={(e) => {
										e.stopPropagation();
										onMove(index, index - 1);
									}}
									title={t("app.weather.move_up")}
									aria-label={t("app.weather.move_up")}
								>
									<ArrowUp size={14} />
								</Button>
								<Button
									variant="subtle"
									size="xs"
									disabled={index === total - 1}
									onClick={(e) => {
										e.stopPropagation();
										onMove(index, index + 1);
									}}
									title={t("app.weather.move_down")}
									aria-label={t("app.weather.move_down")}
								>
									<ArrowDown size={14} />
								</Button>
							</Group>
							<div>
								<Title order={4} style={{ margin: 0 }}>
									{location}
								</Title>
								<Group gap={6} wrap="nowrap">
									<span style={{ fontSize: 20 }}>
										{getWeatherEmoji(current.weatherCode)}
									</span>
									<Text c="dimmed">
										{t(
											`app.weather.codes.${current.weatherCode}` as WeatherKey,
										)}
									</Text>
								</Group>
							</div>
						</Group>
						<Group gap="sm" wrap="nowrap">
							<div style={{ textAlign: "right" }}>
								<Title order={2} style={{ margin: 0 }}>
									{current.temp_C}°
								</Title>
								{today && (
									<Text c="dimmed" size="sm">
										H:{today.maxtempC}° L:{today.mintempC}°
									</Text>
								)}
							</div>
							<ConfirmPopover
								title={t("app.weather.remove_location_title", { location })}
								confirmLabel={t("app.weather.remove_confirm")}
								cancelLabel={t("common.cancel")}
								danger
								onConfirm={() => {
									store.weatherLocations = store.weatherLocations.filter(
										(l) => l !== location,
									);
									notify.info(`Removed ${location}`);
								}}
							>
								<Button
									variant="subtle"
									color="red"
									title={t("app.weather.remove_aria", { location })}
									aria-label={t("app.weather.remove_aria", { location })}
									onClick={(e) => e.stopPropagation()}
								>
									<Trash2 size={16} />
								</Button>
							</ConfirmPopover>
						</Group>
					</Group>
				</Accordion.Control>
				<Accordion.Panel>
					<div>
						<Divider style={{ margin: "12px 0" }} />
						<Text fw={700}>{t("app.weather.hourly")}</Text>
						<HourlyForecast weather={data} />
						<Divider style={{ margin: "12px 0" }} />
						<Text fw={700}>{t("app.weather.daily")}</Text>
						<DailyForecast weather={data} />
						<Divider style={{ margin: "12px 0" }} />
						<SimpleGrid cols={2} spacing="sm">
							<Card withBorder padding="sm">
								<Text size="xs" c="dimmed">
									{t("app.weather.feels_like")}
								</Text>
								<Text fw={700}>{current.FeelsLikeC}°</Text>
							</Card>
							<Card withBorder padding="sm">
								<Text size="xs" c="dimmed">
									{t("app.weather.humidity")}
								</Text>
								<Text fw={700}>{current.humidity}%</Text>
							</Card>
							<Card withBorder padding="sm">
								<Text size="xs" c="dimmed">
									{t("app.weather.uv_index")}
								</Text>
								<Text fw={700}>{current.uvIndex}</Text>
							</Card>
							<Card withBorder padding="sm">
								<Text size="xs" c="dimmed">
									{t("app.weather.wind")}
								</Text>
								<Text fw={700}>{current.windspeedKmph} km/h</Text>
							</Card>
						</SimpleGrid>
						{lastFetched && (
							<div style={{ marginTop: 16, textAlign: "center" }}>
								<Text c="dimmed" style={{ fontSize: 12 }}>
									<Clock size={12} />{" "}
									{t("app.weather.last_fetched", {
										time: dayjs(lastFetched).format("HH:mm:ss"),
									})}
								</Text>
							</div>
						)}
					</div>
				</Accordion.Panel>
			</Accordion.Item>
		</Accordion>
	);
};

export const WeatherTab = () => {
	const { t } = useTranslation();
	const storeSnap = useSnapshot(store);
	const [newLocation, setNewLocation] = useState("");
	const queryClient = useQueryClient();

	const handleAddLocation = () => {
		const trimmed = newLocation.trim();
		if (!trimmed) {
			notify.warning(t("app.weather.enter_location"));
			return;
		}
		if (
			store.weatherLocations
				.map((l) => l.toLowerCase())
				.includes(trimmed.toLowerCase())
		) {
			notify.info(t("app.weather.already_added", { location: trimmed }));
			return;
		}

		store.weatherLocations.push(trimmed);
		notify.success(t("app.weather.added", { location: trimmed }));
		setNewLocation("");
	};

	const handleRefreshAll = () => {
		// Clear cache in store to force refetch even if QueryClient thinks it is fresh
		for (const loc of store.weatherLocations) {
			delete store.weatherCache[loc];
		}
		queryClient.invalidateQueries({ queryKey: ["weather"] });
		notify.success(t("app.weather.refreshed"));
	};

	const handleMove = (fromIndex: number, toIndex: number) => {
		if (
			fromIndex === toIndex ||
			fromIndex < 0 ||
			toIndex < 0 ||
			fromIndex >= store.weatherLocations.length ||
			toIndex >= store.weatherLocations.length
		) {
			return;
		}
		const locations = [...store.weatherLocations];
		const [moved] = locations.splice(fromIndex, 1);
		if (moved !== undefined) {
			locations.splice(toIndex, 0, moved);
			store.weatherLocations = locations;
		}
	};

	const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

	return (
		<div>
			<Stack gap="lg" style={{ width: "100%" }}>
				<Group gap="xs" wrap="nowrap" align="stretch">
					<TextInput
						flex={1}
						placeholder={t("app.weather.placeholder")}
						value={newLocation}
						onChange={(e) => setNewLocation(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleAddLocation();
						}}
					/>
					<Button leftSection={<Plus size={16} />} onClick={handleAddLocation}>
						{t("app.weather.add_location")}
					</Button>
					<Button
						variant="default"
						leftSection={<RefreshCw size={16} />}
						onClick={handleRefreshAll}
					>
						{t("app.weather.refresh")}
					</Button>
				</Group>

				{storeSnap.weatherLocations.length === 0 ? (
					<Stack align="center" gap="xs" py="xl">
						<Text c="dimmed">{t("app.weather.no_locations")}</Text>
					</Stack>
				) : (
					<ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
						{storeSnap.weatherLocations.map((loc, index) => (
							<li
								key={loc}
								draggable
								onDragStart={() => setDraggedIndex(index)}
								onDragOver={(e) => {
									e.preventDefault();
									e.currentTarget.style.borderTop =
										"2px solid var(--tk-accent)";
								}}
								onDragLeave={(e) => {
									e.currentTarget.style.borderTop = "none";
								}}
								onDrop={(e) => {
									e.preventDefault();
									e.currentTarget.style.borderTop = "none";
									if (draggedIndex !== null) {
										handleMove(draggedIndex, index);
										setDraggedIndex(null);
									}
								}}
								onDragEnd={() => {
									setDraggedIndex(null);
								}}
								style={{
									opacity: draggedIndex === index ? 0.5 : 1,
									transition: "all 0.3s",
									cursor: "move",
								}}
							>
								<WeatherItem
									location={loc}
									index={index}
									total={storeSnap.weatherLocations.length}
									onMove={handleMove}
								/>
							</li>
						))}
					</ul>
				)}
			</Stack>
		</div>
	);
};
