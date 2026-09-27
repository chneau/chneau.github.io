import {
	ClockCircleOutlined,
	FallOutlined,
	MoonOutlined,
	PauseOutlined,
	PlayCircleOutlined,
	RedoOutlined,
	RiseOutlined,
	SunOutlined,
} from "@ant-design/icons";
import {
	Button,
	Card,
	Input,
	Radio,
	Select,
	Slider,
	Space,
	Tag,
	Typography,
} from "antd";
import { useSnapshot } from "valtio";
import { CATEGORIES, type Category, type ViewPreset } from "../data/types";
import { derivedStore, railActions, railStore } from "../store";
import { palette } from "../theme";
import { formatTime } from "../utils";

const { Text, Title } = Typography;

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
				style={{
					borderRadius: 14,
					pointerEvents: "auto",
				}}
				styles={{ body: { padding: "12px 18px" } }}
			>
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
					<Space size="middle" align="center">
						<Title
							level={3}
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
							<ClockCircleOutlined
								style={{ color: palette.accent, fontSize: "1rem" }}
							/>
							{formatTime(timeOffset)}
						</Title>
						<Tag
							bordered={false}
							style={{
								fontSize: "0.8rem",
								padding: "2px 10px",
								cursor: "pointer",
								background: palette.accentSoft,
								color: palette.accent,
								borderRadius: 999,
							}}
							onClick={() => railActions.setSelectedCategory("all")}
						>
							<span className="sr-num">{activeTrains.length}</span> active
						</Tag>
					</Space>

					{/* Category Breakdown & Filter */}
					<Space size={4} wrap>
						{(Object.keys(CATEGORIES) as Category[]).map((cat) => {
							const cfg = CATEGORIES[cat];
							const count = activeCountsByCategory[cat] || 0;
							const isCatSelected = selectedCategory === cat;
							return (
								<Tag
									key={cat}
									className="sr-press"
									onClick={() =>
										railActions.setSelectedCategory(isCatSelected ? "all" : cat)
									}
									style={{
										background: isCatSelected
											? `${cfg.color}22`
											: "rgba(255,255,255,0.04)",
										border: `1px solid ${
											isCatSelected ? cfg.color : palette.border
										}`,
										color: palette.text,
										fontSize: "0.74rem",
										cursor: "pointer",
										borderRadius: 999,
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
								</Tag>
							);
						})}
					</Space>

					{/* Search and View Selector */}
					<Space size="small" wrap>
						<Input
							placeholder="Search service or station"
							value={searchQuery}
							allowClear
							onChange={(e) => railActions.setSearchQuery(e.target.value)}
							style={{
								width: 200,
								background: "rgba(255, 255, 255, 0.06)",
								borderColor: palette.borderStrong,
								color: palette.text,
								fontSize: "0.8rem",
							}}
							size="small"
						/>
						<Radio.Group
							value={viewPreset}
							onChange={(e) =>
								railActions.setViewPreset(e.target.value as ViewPreset)
							}
							size="small"
							buttonStyle="solid"
						>
							<Radio.Button value="scotland">All Scotland</Radio.Button>
							<Radio.Button value="central-belt">Central Belt</Radio.Button>
							<Radio.Button value="highlands">Highlands</Radio.Button>
						</Radio.Group>
					</Space>
				</div>

				{/* Timeline Scrubber */}
				<div style={{ padding: "0 4px" }}>
					<Slider
						min={300} // 05:00
						max={1440} // 24:00
						value={timeOffset}
						onChange={(val) => railActions.setTimeOffset(val)}
						tooltip={{
							formatter: (val) => (val !== undefined ? formatTime(val) : ""),
						}}
						styles={{
							track: { background: palette.accent },
							rail: { background: "rgba(255,255,255,0.14)" },
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
					<Space>
						<Button
							type="primary"
							shape="circle"
							className="sr-press"
							aria-label={isPlaying ? "Pause" : "Play"}
							icon={isPlaying ? <PauseOutlined /> : <PlayCircleOutlined />}
							onClick={() => railActions.togglePlay()}
							style={{
								background: palette.accent,
								borderColor: palette.accent,
								color: palette.bgDeep,
							}}
						/>
						<Button
							ghost
							shape="circle"
							className="sr-press"
							aria-label="Restart day"
							icon={<RedoOutlined />}
							onClick={() => railActions.restart()}
							style={{ color: palette.text, borderColor: palette.borderStrong }}
						/>

						<Space size="small" style={{ marginLeft: 8 }}>
							<Text style={{ color: palette.textMuted, fontSize: "0.8rem" }}>
								Speed
							</Text>
							<Select
								value={speed}
								onChange={(val) => railActions.setSpeed(val)}
								size="small"
								style={{ width: 116 }}
								options={[
									{ value: 0.5, label: "0.5x (30s/s)" },
									{ value: 1, label: "1x (1m/s)" },
									{ value: 2, label: "2x (2m/s)" },
									{ value: 5, label: "5x (5m/s)" },
									{ value: 15, label: "15x (15m/s)" },
								]}
							/>
						</Space>
					</Space>

					{/* Quick Jump Times */}
					<Space size={6} wrap align="center">
						<Text
							className="sr-num"
							style={{ color: palette.textFaint, fontSize: "0.78rem" }}
						>
							Jump to
						</Text>
						<Button
							size="small"
							className="sr-chip sr-press"
							onClick={() => railActions.setTimeOffset(480)}
						>
							<RiseOutlined /> 08:00 Morning
						</Button>
						<Button
							size="small"
							className="sr-chip sr-press"
							onClick={() => railActions.setTimeOffset(780)}
						>
							<SunOutlined /> 13:00 Midday
						</Button>
						<Button
							size="small"
							className="sr-chip sr-press"
							onClick={() => railActions.setTimeOffset(1050)}
						>
							<FallOutlined /> 17:30 Evening
						</Button>
						<Button
							size="small"
							className="sr-chip sr-press"
							onClick={() => railActions.setTimeOffset(1320)}
						>
							<MoonOutlined /> 22:00 Sleeper
						</Button>
					</Space>
				</div>
			</Card>
		</div>
	);
};
