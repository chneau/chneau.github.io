import { Card, SegmentedControl, Stack, Text } from "@mantine/core";
import {
	ChevronDown,
	ChevronUp,
	Clock,
	Crown,
	Flame,
	Moon,
	Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSnapshot } from "valtio";
import { CATEGORIES, type TrainService } from "../data/types";
import {
	type ActiveTrainState,
	getPolylineDistances,
} from "../engine/interpolator";
import { derivedStore, railActions, railStore } from "../store";
import { palette } from "../theme";
import { formatTime } from "../utils";

const HighlightRow = ({
	icon,
	title,
	accent,
	value,
	service,
	index,
	onClick,
}: {
	icon: React.ReactNode;
	title: string;
	accent: string;
	value: React.ReactNode;
	service: TrainService;
	index: number;
	onClick: () => void;
}) => (
	<button
		type="button"
		className="sr-press sr-rise"
		onClick={onClick}
		style={
			{
				cursor: "pointer",
				width: "100%",
				textAlign: "left",
				padding: "7px 9px",
				borderRadius: 8,
				background: "var(--app-surface-2)",
				border: "1px solid rgba(206,222,230,0.12)",
				borderLeft: `2px solid ${accent}`,
				// Staggered waterfall reveal driven purely by CSS.
				"--sr-index": index,
			} as React.CSSProperties
		}
	>
		<div
			style={{
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
				gap: 8,
			}}
		>
			<Text
				style={{
					color: accent,
					fontSize: "0.72rem",
					fontWeight: 600,
					display: "flex",
					alignItems: "center",
					gap: 6,
				}}
			>
				{icon}
				{title}
			</Text>
			<span
				className="sr-num"
				style={{ color: palette.text, fontWeight: 600, fontSize: "0.78rem" }}
			>
				{value}
			</span>
		</div>
		<div
			style={{
				color: palette.textMuted,
				fontSize: "0.76rem",
				whiteSpace: "nowrap",
				overflow: "hidden",
				textOverflow: "ellipsis",
				marginTop: 2,
			}}
		>
			<span
				className="sr-num"
				style={{
					color: CATEGORIES[service.category].color,
					fontWeight: "bold",
					marginRight: 5,
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
	const { timeOffset, selectedCategory, searchQuery } = snap;
	const { activeTrains, filteredServices } = derivedSnap;

	const [unit, setUnit] = useState<"metric" | "imperial">("metric");
	const [collapsed, setCollapsed] = useState(false);

	const hasActiveFilter =
		searchQuery.trim().length > 0 || selectedCategory !== "all";

	// Hourly count of services in progress, derived from the current filtered timetable.
	const activity = useMemo(() => {
		const BUCKETS = 19; // 05:00 through to 24:00, one column per hour
		const buckets = Array.from({ length: BUCKETS }, () => 0);
		for (const service of filteredServices) {
			const first = service.calls[0];
			const last = service.calls[service.calls.length - 1];
			const startOffset =
				first?.departureOffset ?? first?.arrivalOffset ?? null;
			const endOffset = last?.arrivalOffset ?? last?.departureOffset ?? null;
			if (startOffset === null || endOffset === null) continue;
			const startIdx = Math.max(0, Math.floor((startOffset - 300) / 60));
			const endIdx = Math.min(BUCKETS - 1, Math.floor((endOffset - 300) / 60));
			for (let i = startIdx; i <= endIdx; i++) {
				buckets[i] = (buckets[i] ?? 0) + 1;
			}
		}
		const max = Math.max(1, ...buckets);
		return buckets.map((value, index) => ({
			hour: index + 5,
			intensity: value / max,
		}));
	}, [filteredServices]);

	const filterLabel =
		searchQuery.trim() && selectedCategory !== "all"
			? `the "${searchQuery}" search or the ${
					CATEGORIES[selectedCategory].label
				} filter`
			: searchQuery.trim()
				? `the "${searchQuery}" search`
				: selectedCategory !== "all"
					? `the ${CATEGORIES[selectedCategory].label} filter`
					: null;

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

	const isImperial = unit === "imperial";
	const kmToMiles = (km: number) => km * 0.621371;
	const { fastest, longest, mostStops } = stats ?? {};

	return (
		<div
			style={{
				position: "absolute",
				top: 72,
				left: 16,
				zIndex: 10,
				width: 262,
				maxWidth: "calc(100vw - 32px)",
				pointerEvents: "auto",
			}}
		>
			<Card
				className="sr-glass sr-rise"
				radius={12}
				padding={0}
				style={{
					color: palette.text,
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						width: "100%",
						padding: "10px 12px 0",
					}}
				>
					<button
						type="button"
						className="sr-press"
						style={{
							background: "none",
							border: "none",
							padding: 0,
							cursor: "pointer",
							fontSize: "0.8rem",
							color: palette.accent,
							display: "flex",
							alignItems: "center",
							gap: 6,
						}}
						onClick={() => setCollapsed(!collapsed)}
						title={collapsed ? "Expand highlights" : "Collapse highlights"}
					>
						<Flame size={15} />
						<span style={{ fontWeight: 600 }}>Live highlights</span>
						<span style={{ fontSize: "0.7rem", opacity: 0.7 }}>
							{collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
						</span>
					</button>
					{!collapsed && stats && (
						<SegmentedControl
							size="xs"
							value={unit}
							onChange={(val) => setUnit(val as "metric" | "imperial")}
							data={[
								{ label: "km", value: "metric" },
								{ label: "mi", value: "imperial" },
							]}
							styles={{
								root: {
									fontSize: "0.72rem",
									background: "rgba(0,0,0,0.28)",
								},
							}}
						/>
					)}
				</div>

				{!collapsed && (
					<div style={{ padding: "10px 12px" }}>
						{!stats ? (
							/* Composed empty state: how to get data back. */
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: 6,
									padding: "14px 8px",
									textAlign: "center",
								}}
							>
								<Moon size={22} style={{ color: palette.textFaint }} />
								<span style={{ color: palette.text, fontSize: "0.82rem" }}>
									Quiet on the network
								</span>
								<span
									style={{
										color: palette.textMuted,
										fontSize: "0.74rem",
										lineHeight: 1.5,
									}}
								>
									{filterLabel
										? `No service is running that matches ${filterLabel} at `
										: "No service is running at "}
									<span className="sr-num">{formatTime(timeOffset)}</span>.
									{hasActiveFilter
										? " Try another time or clear the active filter."
										: " Pick another time."}
								</span>
							</div>
						) : (
							<Stack gap={8} style={{ width: "100%" }}>
								{/* Active status pulse */}
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										paddingBottom: 6,
										borderBottom: "1px solid var(--app-border)",
										fontSize: "0.77rem",
									}}
								>
									<span
										style={{
											color: palette.text,
											display: "flex",
											alignItems: "center",
											gap: 6,
										}}
									>
										<span
											className="sr-breathe"
											style={{
												display: "inline-block",
												width: 7,
												height: 7,
												borderRadius: "50%",
												background: palette.accent,
											}}
										/>
										<b className="sr-num">{stats.movingTrains}</b> cruising
									</span>
									<span className="sr-num" style={{ color: palette.textFaint }}>
										{stats.dwellingTrains} at station
									</span>
								</div>

								{/* 24-hour Activity Curve Mini Bar */}
								<div style={{ padding: "2px 0 4px 0" }}>
									<div
										style={{
											display: "flex",
											justifyContent: "space-between",
											fontSize: "0.66rem",
											color: palette.textFaint,
											marginBottom: 4,
										}}
									>
										<span className="sr-num">{formatTime(300)}</span>
										<span style={{ color: palette.accent }}>
											Services in progress
										</span>
										<span className="sr-num">{formatTime(1440)}</span>
									</div>
									<div
										role="img"
										aria-label="Hourly count of services in progress across the day"
										style={{
											position: "relative",
											height: 12,
											background: "var(--app-surface-2)",
											borderRadius: 3,
											overflow: "hidden",
										}}
									>
										<div
											aria-hidden
											style={{
												display: "flex",
												alignItems: "flex-end",
												height: "100%",
												gap: 1,
											}}
										>
											{activity.map(({ hour, intensity }) => (
												<div
													key={hour}
													style={{
														flex: 1,
														height: `${Math.max(8, intensity * 100)}%`,
														background:
															intensity > 0.66
																? palette.accent
																: "rgba(90, 169, 201, 0.35)",
													}}
												/>
											))}
										</div>
										{/* Current time needle */}
										<div
											aria-hidden
											style={{
												position: "absolute",
												left: `${Math.min(
													100,
													Math.max(0, ((timeOffset - 300) / 1140) * 100),
												)}%`,
												width: 2,
												height: "100%",
												background: palette.text,
											}}
										/>
									</div>
								</div>

								{fastest && (
									<HighlightRow
										icon={<Zap size={14} />}
										title="Fastest active"
										accent={CATEGORIES.Express.color}
										index={0}
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
										icon={<Crown size={14} />}
										title="Longest distance"
										accent={CATEGORIES.CrossBorder.color}
										index={1}
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
										icon={<Clock size={14} />}
										title="Most calling stops"
										accent={CATEGORIES.Highland.color}
										index={2}
										value={`${mostStops.stopCount} stops`}
										service={mostStops.state.service}
										onClick={() =>
											railActions.setSelectedService(mostStops.state.service)
										}
									/>
								)}
							</Stack>
						)}
					</div>
				)}
			</Card>
		</div>
	);
};
