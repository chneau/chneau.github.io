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
import { CATEGORIES, type TrainService } from "../data/types";
import type { ActiveTrainState } from "../engine/interpolator";
import { useThrottledSnapshots } from "../hooks";
import {
	type ActiveHighlights,
	describeActiveFilter,
	hourlyActivity,
	summariseActiveTrains,
} from "../stats";
import { railActions, railUiStores } from "../store";
import { palette } from "../theme";
import { formatTime } from "../utils";

const CURVE_START = 300;
const CURVE_END = 1440;

type Unit = "metric" | "imperial";

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
					color: CATEGORIES[service.category].ink,
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

const StatsHeader = ({
	collapsed,
	hasStats,
	unit,
	onToggleCollapsed,
	onUnitChange,
}: {
	collapsed: boolean;
	hasStats: boolean;
	unit: Unit;
	onToggleCollapsed: () => void;
	onUnitChange: (unit: Unit) => void;
}) => (
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
			onClick={onToggleCollapsed}
			aria-label={collapsed ? "Expand highlights" : "Collapse highlights"}
			aria-expanded={!collapsed}
			title={collapsed ? "Expand highlights" : "Collapse highlights"}
			style={{
				background: "none",
				border: "none",
				padding: 0,
				cursor: "pointer",
				fontSize: "0.8rem",
				color: palette.accentInk,
				display: "flex",
				alignItems: "center",
				gap: 6,
			}}
		>
			<Flame size={15} />
			<span style={{ fontWeight: 600 }}>Live highlights</span>
			<span style={{ fontSize: "0.7rem", opacity: 0.7 }}>
				{collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
			</span>
		</button>
		{!collapsed && hasStats && (
			<SegmentedControl
				size="xs"
				aria-label="Distance units"
				value={unit}
				onChange={(val) => onUnitChange(val as Unit)}
				data={[
					{ label: "km", value: "metric" },
					{ label: "mi", value: "imperial" },
				]}
				styles={{
					root: {
						fontSize: "0.72rem",
						background: "var(--app-surface-2)",
					},
				}}
			/>
		)}
	</div>
);

const QuietNetwork = ({
	timeOffset,
	filterLabel,
}: {
	timeOffset: number;
	filterLabel: string | null;
}) => (
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
			{filterLabel
				? " Try another time or clear the active filter."
				: " Pick another time."}
		</span>
	</div>
);

const ActivityCurve = ({
	activity,
	timeOffset,
}: {
	activity: readonly { hour: number; intensity: number }[];
	timeOffset: number;
}) => (
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
			<span className="sr-num">{formatTime(CURVE_START)}</span>
			<span style={{ color: palette.accentInk }}>Services in progress</span>
			<span className="sr-num">{formatTime(CURVE_END)}</span>
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
								intensity > 0.66 ? palette.accent : "rgba(90, 169, 201, 0.35)",
						}}
					/>
				))}
			</div>
			<div
				aria-hidden
				style={{
					position: "absolute",
					left: `${Math.min(
						100,
						Math.max(
							0,
							((timeOffset - CURVE_START) / (CURVE_END - CURVE_START)) * 100,
						),
					)}%`,
					width: 2,
					height: "100%",
					background: palette.text,
				}}
			/>
		</div>
	</div>
);

const ActivePulse = ({
	movingTrains,
	dwellingTrains,
}: {
	movingTrains: number;
	dwellingTrains: number;
}) => (
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
			<b className="sr-num">{movingTrains}</b> cruising
		</span>
		<span className="sr-num" style={{ color: palette.textFaint }}>
			{dwellingTrains} at station
		</span>
	</div>
);

const Highlights = ({
	highlights,
	isImperial,
}: {
	highlights: ActiveHighlights;
	isImperial: boolean;
}) => {
	const kmToMiles = (km: number) => km * 0.621371;
	const { fastest, longest, mostStops } = highlights;

	return (
		<>
			{fastest && (
				<HighlightRow
					icon={<Zap size={14} />}
					title="Fastest active"
					accent={CATEGORIES.Express.ink}
					index={0}
					value={
						isImperial
							? `~${Math.round(kmToMiles(fastest.value))} mph`
							: `~${Math.round(fastest.value)} km/h`
					}
					service={fastest.state.service}
					onClick={() => railActions.setSelectedService(fastest.state.service)}
				/>
			)}

			{longest && (
				<HighlightRow
					icon={<Crown size={14} />}
					title="Longest distance"
					accent={CATEGORIES.CrossBorder.ink}
					index={1}
					value={
						isImperial
							? `${Math.round(kmToMiles(longest.value))} mi`
							: `${Math.round(longest.value)} km`
					}
					service={longest.state.service}
					onClick={() => railActions.setSelectedService(longest.state.service)}
				/>
			)}

			{mostStops && (
				<HighlightRow
					icon={<Clock size={14} />}
					title="Most calling stops"
					accent={CATEGORIES.Highland.ink}
					index={2}
					value={`${mostStops.value} stops`}
					service={mostStops.state.service}
					onClick={() =>
						railActions.setSelectedService(mostStops.state.service)
					}
				/>
			)}
		</>
	);
};

export const StatsPanel = () => {
	const [snap, derivedSnap] = useThrottledSnapshots(railUiStores);
	const { timeOffset, selectedCategory, searchQuery, selectedService } = snap;
	const { activeTrains, filteredServices } = derivedSnap;

	const [unit, setUnit] = useState<Unit>("metric");
	const [collapsed, setCollapsed] = useState(false);

	const trains = activeTrains as ActiveTrainState[];
	const services = filteredServices as readonly TrainService[];

	const activity = useMemo(() => hourlyActivity(services), [services]);
	const stats = useMemo(() => summariseActiveTrains(trains), [trains]);

	const filterLabel = describeActiveFilter(searchQuery, selectedCategory);

	return (
		<section
			className="sr-panel sr-stats"
			aria-label="Live highlights"
			data-details-open={selectedService ? "true" : undefined}
			style={{
				position: "absolute",
				top: "var(--sr-panel-top, 72px)",
				left: 16,
				zIndex: 10,
				width: "var(--sr-panel-w, 262px)",
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
				<StatsHeader
					collapsed={collapsed}
					hasStats={stats !== null}
					unit={unit}
					onToggleCollapsed={() => setCollapsed(!collapsed)}
					onUnitChange={setUnit}
				/>

				{!collapsed && (
					<div style={{ padding: "10px 12px" }}>
						{stats ? (
							<Stack gap={8} style={{ width: "100%" }}>
								<ActivePulse
									movingTrains={stats.movingTrains}
									dwellingTrains={stats.dwellingTrains}
								/>

								<ActivityCurve activity={activity} timeOffset={timeOffset} />

								<Highlights
									highlights={stats}
									isImperial={unit === "imperial"}
								/>
							</Stack>
						) : (
							<QuietNetwork timeOffset={timeOffset} filterLabel={filterLabel} />
						)}
					</div>
				)}
			</Card>
		</section>
	);
};
