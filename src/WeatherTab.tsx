import {
	ClockCircleOutlined,
	DeleteOutlined,
	PlusOutlined,
	ReloadOutlined,
} from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Button,
	Card,
	Col,
	Collapse,
	Divider,
	Empty,
	Input,
	List,
	Row,
	Skeleton,
	Space,
	Typography,
} from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { store } from "./store";
import { getWeather, type WttrResponse } from "./wttr";

const { Text, Title } = Typography;

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

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
						borderRight: i < hourly.length - 1 ? "1px solid #f0f0f0" : "none",
					}}
				>
					<Text type="secondary" style={{ fontSize: 12 }}>
						{h.time === 0 ? "00:00" : `${h.time / 100}:00`}
					</Text>
					<div style={{ margin: "4px 0", fontSize: 20 }}>
						{getWeatherEmoji(h.weatherCode)}
					</div>
					<div style={{ margin: "4px 0" }}>
						<Text strong>{h.tempC}°</Text>
					</div>
					<Text style={{ fontSize: 10, display: "block" }}>
						{h.weatherDesc[0]?.value}
					</Text>
				</div>
			))}
		</div>
	);
};

const DailyForecast = ({ weather }: { weather: WttrResponse }) => {
	return (
		<List
			size="small"
			dataSource={weather.weather}
			renderItem={(day) => (
				<List.Item style={{ padding: "8px 0" }}>
					<Row style={{ width: "100%" }} align="middle">
						<Col span={8}>
							<Text strong>{dayjs(day.date).format("ddd D MMM")}</Text>
						</Col>
						<Col span={10}>
							<Space>
								<span style={{ fontSize: 18 }}>
									{getWeatherEmoji(day.hourly[4]?.weatherCode)}
								</span>
								<Text type="secondary">
									{day.hourly[4]?.weatherDesc[0]?.value}
								</Text>
							</Space>
						</Col>
						<Col span={6} style={{ textAlign: "right" }}>
							<Text strong>{day.maxtempC}°</Text> /{" "}
							<Text type="secondary">{day.mintempC}°</Text>
						</Col>
					</Row>
				</List.Item>
			)}
		/>
	);
};

const WeatherItem = ({ location }: { location: string }) => {
	const { t } = useTranslation();
	const storeSnap = useSnapshot(store);
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["weather", location],
		queryFn: () => fetchWeatherWithCache(location),
		staleTime: CACHE_DURATION,
	});

	if (isLoading) {
		return (
			<Card size="small" style={{ marginBottom: 12 }}>
				<Skeleton active avatar paragraph={{ rows: 1 }} />
			</Card>
		);
	}

	if (error || !data || !data.current_condition?.[0]) {
		return (
			<Card size="small" style={{ marginBottom: 12 }}>
				<Text type="danger">Error loading weather for {location}</Text>
				<Button
					size="small"
					onClick={() => refetch()}
					style={{ marginLeft: 8 }}
				>
					Retry
				</Button>
				<Button
					size="small"
					danger
					icon={<DeleteOutlined />}
					onClick={() => {
						store.weatherLocations = store.weatherLocations.filter(
							(l) => l !== location,
						);
					}}
					style={{ marginLeft: 8 }}
				/>
			</Card>
		);
	}

	const current = data.current_condition[0];
	const lastFetched = storeSnap.weatherCache[location]?.timestamp;
	const today = data.weather[0];

	return (
		<Collapse
			ghost
			style={{
				marginBottom: 12,
				backgroundColor: storeSnap.darkMode ? "#1f1f1f" : "#fafafa",
				borderRadius: 8,
			}}
			items={[
				{
					key: "1",
					label: (
						<Row align="middle" style={{ width: "100%" }}>
							<Col flex="auto">
								<Title level={4} style={{ margin: 0 }}>
									{location}
								</Title>
								<Space>
									<span style={{ fontSize: 20 }}>
										{getWeatherEmoji(current.weatherCode)}
									</span>
									<Text type="secondary">{current.weatherDesc[0]?.value}</Text>
								</Space>
							</Col>
							<Col style={{ textAlign: "right" }}>
								<Title level={2} style={{ margin: 0 }}>
									{current.temp_C}°
								</Title>
								{today && (
									<Text type="secondary">
										H:{today.maxtempC}° L:{today.mintempC}°
									</Text>
								)}
							</Col>
						</Row>
					),
					extra: (
						<Button
							type="text"
							danger
							icon={<DeleteOutlined />}
							onClick={(e) => {
								e.stopPropagation();
								store.weatherLocations = store.weatherLocations.filter(
									(l) => l !== location,
								);
							}}
						/>
					),
					children: (
						<div>
							<Divider style={{ margin: "12px 0" }} />
							<Text strong>{t("app.weather.hourly")}</Text>
							<HourlyForecast weather={data} />
							<Divider style={{ margin: "12px 0" }} />
							<Text strong>{t("app.weather.daily")}</Text>
							<DailyForecast weather={data} />
							<Divider style={{ margin: "12px 0" }} />
							<Row gutter={[16, 16]}>
								<Col span={12}>
									<Card size="small" title={t("app.weather.feels_like")}>
										<Text strong>{current.FeelsLikeC}°</Text>
									</Card>
								</Col>
								<Col span={12}>
									<Card size="small" title={t("app.weather.humidity")}>
										<Text strong>{current.humidity}%</Text>
									</Card>
								</Col>
								<Col span={12}>
									<Card size="small" title={t("app.weather.uv_index")}>
										<Text strong>{current.uvIndex}</Text>
									</Card>
								</Col>
								<Col span={12}>
									<Card size="small" title={t("app.weather.wind")}>
										<Text strong>{current.windspeedKmph} km/h</Text>
									</Card>
								</Col>
							</Row>
							{lastFetched && (
								<div style={{ marginTop: 16, textAlign: "center" }}>
									<Text type="secondary" style={{ fontSize: 12 }}>
										<ClockCircleOutlined />{" "}
										{t("app.weather.last_fetched", {
											time: dayjs(lastFetched).format("HH:mm:ss"),
										})}
									</Text>
								</div>
							)}
						</div>
					),
				},
			]}
		/>
	);
};

export const WeatherTab = () => {
	const { t } = useTranslation();
	const storeSnap = useSnapshot(store);
	const [newLocation, setNewLocation] = useState("");
	const queryClient = useQueryClient();

	const handleAddLocation = () => {
		if (
			newLocation.trim() &&
			!store.weatherLocations.includes(newLocation.trim())
		) {
			store.weatherLocations.push(newLocation.trim());
			setNewLocation("");
		}
	};

	const handleRefreshAll = () => {
		// Clear cache in store to force refetch even if QueryClient thinks it is fresh
		for (const loc of store.weatherLocations) {
			delete store.weatherCache[loc];
		}
		queryClient.invalidateQueries({ queryKey: ["weather"] });
	};

	return (
		<div>
			<Space direction="vertical" style={{ width: "100%" }} size="large">
				<Space.Compact style={{ width: "100%" }}>
					<Input
						placeholder={t("app.weather.placeholder")}
						value={newLocation}
						onChange={(e) => setNewLocation(e.target.value)}
						onPressEnter={handleAddLocation}
					/>
					<Button
						type="primary"
						icon={<PlusOutlined />}
						onClick={handleAddLocation}
					>
						{t("app.weather.add_location")}
					</Button>
					<Button icon={<ReloadOutlined />} onClick={handleRefreshAll}>
						{t("app.weather.refresh")}
					</Button>
				</Space.Compact>

				{storeSnap.weatherLocations.length === 0 ? (
					<Empty description={t("app.weather.no_locations")} />
				) : (
					<div>
						{storeSnap.weatherLocations.map((loc) => (
							<WeatherItem key={loc} location={loc} />
						))}
					</div>
				)}
			</Space>
		</div>
	);
};
