import {
	Badge,
	Box,
	Button,
	Card,
	CloseButton,
	Group,
	SegmentedControl,
	Select,
	Slider,
	Text,
	TextInput,
	Title,
} from "@mantine/core";
import {
	Clock,
	Moon,
	Pause,
	PlayCircle,
	RotateCcw,
	Search,
	Sun,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import { useSnapshot } from "valtio";
import { CATEGORIES, type Category, type ViewPreset } from "../data/types";
import { derivedStore, railActions, railStore } from "../store";
import { palette } from "../theme";
import { formatTime } from "../utils";

export const Controls = () => {
	const snap = useSnapshot(railStore);
	const derivedSnap = useSnapshot(derivedStore);

	const {
		timeOffset,
		isPlaying,
		speed,
		viewPreset,
		searchQuery,
		selectedCategory,
	} = snap;
	const { activeTrains, activeCountsByCategory } = derivedSnap;

	return (
		<div
			style={{
				position: "absolute",
				bottom: 16,
				left: 16,
				right: 16,
				display: "flex",
				flexDirection: "column",
				gap: 8,
				pointerEvents: "none",
			}}
		>
			{/* Bottom Control Bar */}
			<Card
				className="sr-glass sr-rise"
				radius={14}
				padding={0}
				style={{
					pointerEvents: "auto",
				}}
			>
				<Box style={{ padding: "12px 18px" }}>
					{/* Top Bar: Live Clock & Category Badges */}
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							flexWrap: "wrap",
							gap: 12,
							marginBottom: 10,
						}}
					>
						<Group gap="md" align="center">
							<Title
								order={3}
								className="sr-num"
								style={{
									color: palette.text,
									margin: 0,
									fontSize: "1.4rem",
									fontWeight: 600,
									letterSpacing: "0.02em",
									display: "flex",
									alignItems: "center",
									gap: 8,
								}}
							>
								<Clock size={16} style={{ color: palette.accent }} />
								{formatTime(timeOffset)}
							</Title>
							<Badge
								variant="light"
								radius="xl"
								tt="none"
								style={{
									fontSize: "0.8rem",
									padding: "2px 10px",
									cursor: "pointer",
									background: palette.accentSoft,
									color: palette.accent,
								}}
								onClick={() => railActions.setSelectedCategory("all")}
							>
								<span className="sr-num">{activeTrains.length}</span> active
							</Badge>
						</Group>

						{/* Category Breakdown & Filter */}
						<Group gap={4} wrap="wrap">
							{(Object.keys(CATEGORIES) as Category[]).map((cat) => {
								const cfg = CATEGORIES[cat];
								const count = activeCountsByCategory[cat] || 0;
								const isCatSelected = selectedCategory === cat;
								return (
									<Badge
										key={cat}
										className="sr-press"
										radius="xl"
										tt="none"
										onClick={() =>
											railActions.setSelectedCategory(
												isCatSelected ? "all" : cat,
											)
										}
										style={{
											background: isCatSelected
												? `${cfg.color}22`
												: "var(--app-surface-2)",
											border: `1px solid ${
												isCatSelected ? cfg.color : palette.border
											}`,
											color: palette.text,
											fontSize: "0.74rem",
											cursor: "pointer",
											padding: "1px 10px",
										}}
									>
										<span
											style={{
												display: "inline-block",
												width: 6,
												height: 6,
												borderRadius: "50%",
												background: cfg.color,
												marginRight: 6,
												verticalAlign: "middle",
											}}
										/>
										{cfg.label}:{" "}
										<b className="sr-num" style={{ color: cfg.color }}>
											{count}
										</b>
									</Badge>
								);
							})}
						</Group>

						{/* Search and View Selector */}
						<Group gap="xs" wrap="wrap">
							<TextInput
								placeholder="Search service or station"
								value={searchQuery}
								onChange={(e) =>
									railActions.setSearchQuery(e.currentTarget.value)
								}
								size="xs"
								leftSection={<Search size={14} />}
								rightSection={
									searchQuery ? (
										<CloseButton
											size="sm"
											aria-label="Clear search"
											onClick={() => railActions.setSearchQuery("")}
										/>
									) : null
								}
								style={{ width: 200 }}
								styles={{
									input: {
										background: "var(--app-surface-2)",
										borderColor: palette.borderStrong,
										color: palette.text,
										fontSize: "0.8rem",
									},
								}}
							/>
							<SegmentedControl
								size="xs"
								value={viewPreset}
								onChange={(val) => railActions.setViewPreset(val as ViewPreset)}
								data={[
									{ label: "All Scotland", value: "scotland" },
									{ label: "Central Belt", value: "central-belt" },
									{ label: "Highlands", value: "highlands" },
								]}
							/>
						</Group>
					</div>

					{/* Timeline Scrubber */}
					<div style={{ padding: "0 4px" }}>
						<Slider
							min={300} // 05:00
							max={1440} // 24:00
							value={timeOffset}
							onChange={(val) => railActions.setTimeOffset(val)}
							label={(val) => formatTime(val)}
							styles={{
								bar: { background: palette.accent },
								track: { background: "var(--app-border-strong)" },
							}}
						/>
					</div>

					{/* Bottom Controls: Playback buttons & quick shortcuts */}
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							gap: 12,
							flexWrap: "wrap",
							marginTop: 6,
						}}
					>
						<Group gap="xs" align="center">
							<Button
								variant="filled"
								radius="xl"
								className="sr-press"
								aria-label={isPlaying ? "Pause" : "Play"}
								onClick={() => railActions.togglePlay()}
								w={40}
								h={40}
								p={0}
								style={{
									background: palette.accent,
									color: palette.bgDeep,
								}}
							>
								{isPlaying ? <Pause size={18} /> : <PlayCircle size={18} />}
							</Button>
							<Button
								variant="default"
								radius="xl"
								className="sr-press"
								aria-label="Restart day"
								onClick={() => railActions.restart()}
								w={40}
								h={40}
								p={0}
								style={{
									color: palette.text,
									borderColor: palette.borderStrong,
								}}
							>
								<RotateCcw size={17} />
							</Button>

							<Group gap="xs" align="center" style={{ marginLeft: 8 }}>
								<Text style={{ color: palette.textMuted, fontSize: "0.8rem" }}>
									Speed
								</Text>
								<Select
									value={String(speed)}
									onChange={(val) => railActions.setSpeed(Number(val ?? 1))}
									size="xs"
									allowDeselect={false}
									style={{ width: 116 }}
									data={[
										{ value: "0.5", label: "0.5x (30s/s)" },
										{ value: "1", label: "1x (1m/s)" },
										{ value: "2", label: "2x (2m/s)" },
										{ value: "5", label: "5x (5m/s)" },
										{ value: "15", label: "15x (15m/s)" },
									]}
								/>
							</Group>
						</Group>

						{/* Quick Jump Times */}
						<Group gap={6} wrap="wrap" align="center">
							<Text
								className="sr-num"
								style={{ color: palette.textFaint, fontSize: "0.78rem" }}
							>
								Jump to
							</Text>
							<Button
								size="xs"
								variant="default"
								className="sr-chip sr-press"
								leftSection={<TrendingUp size={14} />}
								onClick={() => railActions.setTimeOffset(480)}
							>
								08:00 Morning
							</Button>
							<Button
								size="xs"
								variant="default"
								className="sr-chip sr-press"
								leftSection={<Sun size={14} />}
								onClick={() => railActions.setTimeOffset(780)}
							>
								13:00 Midday
							</Button>
							<Button
								size="xs"
								variant="default"
								className="sr-chip sr-press"
								leftSection={<TrendingDown size={14} />}
								onClick={() => railActions.setTimeOffset(1050)}
							>
								17:30 Evening
							</Button>
							<Button
								size="xs"
								variant="default"
								className="sr-chip sr-press"
								leftSection={<Moon size={14} />}
								onClick={() => railActions.setTimeOffset(1320)}
							>
								22:00 Sleeper
							</Button>
						</Group>
					</div>
				</Box>
			</Card>
		</div>
	);
};
