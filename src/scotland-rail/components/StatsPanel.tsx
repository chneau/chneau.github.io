import {
	CrownOutlined,
	FieldTimeOutlined,
	FireOutlined,
	ThunderboltOutlined,
} from "@ant-design/icons";
import { Badge, Card, Segmented, Space, Typography } from "antd";
import { useMemo, useState } from "react";
import { useSnapshot } from "valtio";
import { CATEGORIES, type TrainService } from "../data/types";
import {
	type ActiveTrainState,
	getPolylineDistances,
} from "../engine/interpolator";
import { derivedStore, railActions, railStore } from "../store";

const { Text } = Typography;

const HighlightRow = ({
	icon,
	title,
	titleColor,
	borderColor,
	value,
	service,
	onClick,
}: {
	icon: React.ReactNode;
	title: string;
	titleColor: string;
	borderColor: string;
	value: React.ReactNode;
	service: TrainService;
	onClick: () => void;
}) => (
	<button
		type="button"
		onClick={onClick}
		style={{
			cursor: "pointer",
			width: "100%",
			textAlign: "left",
			padding: "6px 8px",
			borderRadius: 6,
			background: "rgba(255,255,255,0.04)",
			border: `1px solid ${borderColor}`,
			transition: "all 0.2s",
		}}
	>
		<div
			style={{
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
			}}
		>
			<Text
				style={{
					color: titleColor,
					fontSize: "0.75rem",
					fontWeight: 600,
				}}
			>
				{icon} {title}
			</Text>
			<span
				style={{
					color: titleColor,
					fontWeight: "bold",
					fontSize: "0.78rem",
				}}
			>
				{value}
			</span>
		</div>
		<div
			style={{
				color: "#edf3f5",
				fontSize: "0.78rem",
				whiteSpace: "nowrap",
				overflow: "hidden",
				textOverflow: "ellipsis",
				marginTop: 2,
			}}
		>
			<span
				style={{
					color: CATEGORIES[service.category].color,
					fontWeight: "bold",
					marginRight: 4,
				}}
			>
				{service.serviceNumber}
			</span>
			{service.name}
		</div>
	</button>
);

export const StatsPanel = () => {
	const snap = useSnapshot(railStore);
	const derivedSnap = useSnapshot(derivedStore);
	const { timeOffset } = snap;
	const { activeTrains } = derivedSnap;

	const [unit, setUnit] = useState<"metric" | "imperial">("metric");

	// Compute dynamic stats from active trains
	const stats = useMemo(() => {
		if (activeTrains.length === 0) return null;

		let maxSpeedTrain: { state: ActiveTrainState; speedKmh: number } | null =
			null;
		let longestJourneyTrain: {
			state: ActiveTrainState;
			distKm: number;
		} | null = null;
		let mostStopsTrain: { state: ActiveTrainState; stopCount: number } | null =
			null;
		let totalActiveDistanceKm = 0;

		for (const train of activeTrains) {
			const s = train.service;
			const totalDist = getPolylineDistances(s.pathCoordinates).total;
			totalActiveDistanceKm += totalDist;

			// Duration in hours
			const firstDep = s.calls[0]?.departureOffset ?? 0;
			const lastArr =
				s.calls[s.calls.length - 1]?.arrivalOffset ?? firstDep + 1;
			const durationHours = Math.max(0.1, (lastArr - firstDep) / 60);
			const avgSpeedKmh = totalDist / durationHours;

			// Fastest train
			if (!maxSpeedTrain || avgSpeedKmh > maxSpeedTrain.speedKmh) {
				maxSpeedTrain = {
					state: train as ActiveTrainState,
					speedKmh: avgSpeedKmh,
				};
			}

			// Longest rail run
			if (!longestJourneyTrain || totalDist > longestJourneyTrain.distKm) {
				longestJourneyTrain = {
					state: train as ActiveTrainState,
					distKm: totalDist,
				};
			}

			// Most intermediate stops
			const stops = s.calls.length;
			if (!mostStopsTrain || stops > mostStopsTrain.stopCount) {
				mostStopsTrain = {
					state: train as ActiveTrainState,
					stopCount: stops,
				};
			}
		}

		return {
			fastest: maxSpeedTrain,
			longest: longestJourneyTrain,
			mostStops: mostStopsTrain,
			totalActiveDistanceKm: Math.round(totalActiveDistanceKm),
			movingTrains: activeTrains.filter((t) => !t.isDwelling).length,
			dwellingTrains: activeTrains.filter((t) => t.isDwelling).length,
		};
	}, [activeTrains]);

	if (!stats || activeTrains.length === 0) return null;

	const isImperial = unit === "imperial";
	const kmToMiles = (km: number) => km * 0.621371;
	const { fastest, longest, mostStops } = stats;

	return (
		<div
			style={{
				position: "absolute",
				top: 72,
				left: 16,
				zIndex: 10,
				width: 255,
				pointerEvents: "auto",
			}}
		>
			<Card
				size="small"
				title={
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							width: "100%",
						}}
					>
						<Space style={{ fontSize: "0.82rem", color: "#59d7ff" }}>
							<FireOutlined />
							<span>Live Highlights</span>
						</Space>
						<Segmented
							size="small"
							value={unit}
							onChange={(val) => setUnit(val as "metric" | "imperial")}
							options={[
								{ label: "km", value: "metric" },
								{ label: "mi", value: "imperial" },
							]}
							style={{
								fontSize: "0.72rem",
								background: "rgba(0,0,0,0.3)",
							}}
						/>
					</div>
				}
				style={{
					background: "rgba(7, 19, 27, 0.88)",
					backdropFilter: "blur(10px)",
					border: "1px solid rgba(217, 226, 230, 0.22)",
					borderRadius: 10,
					color: "#edf3f5",
					boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
				}}
				bodyStyle={{ padding: "8px 12px" }}
			>
				<Space orientation="vertical" style={{ width: "100%" }} size={8}>
					{/* Active status pulse */}
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							paddingBottom: 4,
							borderBottom: "1px solid rgba(255,255,255,0.08)",
							fontSize: "0.78rem",
						}}
					>
						<span style={{ color: "#a8b5bc" }}>
							<Badge status="processing" color="#59d7ff" /> {stats.movingTrains}{" "}
							cruising
						</span>
						<span style={{ color: "#8ca0aa" }}>
							{stats.dwellingTrains} at station
						</span>
					</div>

					{/* 24-hour Activity Curve Mini Bar */}
					<div style={{ padding: "2px 0 4px 0" }}>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								fontSize: "0.68rem",
								color: "#8ca0aa",
								marginBottom: 2,
							}}
						>
							<span>05:00</span>
							<span style={{ color: "#59d7ff" }}>Rush Hours</span>
							<span>24:00</span>
						</div>
						<div
							style={{
								position: "relative",
								height: 12,
								background: "rgba(255,255,255,0.06)",
								borderRadius: 3,
								overflow: "hidden",
							}}
						>
							{/* Morning Rush Glow */}
							<div
								style={{
									position: "absolute",
									left: "12%",
									width: "18%",
									height: "100%",
									background: "rgba(89, 215, 255, 0.25)",
								}}
							/>
							{/* Evening Rush Glow */}
							<div
								style={{
									position: "absolute",
									left: "52%",
									width: "16%",
									height: "100%",
									background: "rgba(255, 186, 99, 0.25)",
								}}
							/>
							{/* Sleeper Glow */}
							<div
								style={{
									position: "absolute",
									left: "82%",
									width: "14%",
									height: "100%",
									background: "rgba(255, 43, 214, 0.25)",
								}}
							/>
							{/* Current Time Needle */}
							<div
								style={{
									position: "absolute",
									left: `${Math.min(
										100,
										Math.max(0, ((timeOffset - 300) / 1140) * 100),
									)}%`,
									width: 3,
									height: "100%",
									background: "#ffffff",
									boxShadow: "0 0 6px #ffffff",
								}}
							/>
						</div>
					</div>

					{fastest && (
						<HighlightRow
							icon={<ThunderboltOutlined />}
							title="Fastest Active"
							titleColor="#59d7ff"
							borderColor="rgba(89, 215, 255, 0.25)"
							value={
								isImperial
									? `~${Math.round(kmToMiles(fastest.speedKmh))} mph`
									: `~${Math.round(fastest.speedKmh)} km/h`
							}
							service={fastest.state.service}
							onClick={() =>
								railActions.setSelectedService(fastest.state.service)
							}
						/>
					)}

					{longest && (
						<HighlightRow
							icon={<CrownOutlined />}
							title="Longest Distance"
							titleColor="#b347ff"
							borderColor="rgba(179, 71, 255, 0.25)"
							value={
								isImperial
									? `${Math.round(kmToMiles(longest.distKm))} mi`
									: `${Math.round(longest.distKm)} km`
							}
							service={longest.state.service}
							onClick={() =>
								railActions.setSelectedService(longest.state.service)
							}
						/>
					)}

					{mostStops && (
						<HighlightRow
							icon={<FieldTimeOutlined />}
							title="Most Calling Stops"
							titleColor="#a6e36a"
							borderColor="rgba(166, 227, 106, 0.25)"
							value={`${mostStops.stopCount} stops`}
							service={mostStops.state.service}
							onClick={() =>
								railActions.setSelectedService(mostStops.state.service)
							}
						/>
					)}
				</Space>
			</Card>
		</div>
	);
};
