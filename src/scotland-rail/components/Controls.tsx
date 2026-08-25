import {
	PauseOutlined,
	PlayCircleOutlined,
	RedoOutlined,
} from "@ant-design/icons";
import {
	Button,
	Card,
	Radio,
	Select,
	Slider,
	Space,
	Tag,
	Typography,
} from "antd";
import { CATEGORIES, type Category, type ViewPreset } from "../data/types";

const { Text, Title } = Typography;

type ControlsProps = {
	timeOffset: number;
	isPlaying: boolean;
	speed: number;
	viewPreset: ViewPreset;
	activeCountsByCategory: Record<Category, number>;
	totalActive: number;
	searchQuery: string;
	onSearchChange: (query: string) => void;
	selectedCategory: Category | "all";
	onSelectCategory: (category: Category | "all") => void;
	onTogglePlay: () => void;
	onRestart: () => void;
	onSeek: (offset: number) => void;
	onChangeSpeed: (speed: number) => void;
	onChangeView: (preset: ViewPreset) => void;
};

const formatTime = (minutes: number): string => {
	const h = Math.floor(minutes / 60) % 24;
	const m = Math.floor(minutes % 60);
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const Controls = ({
	timeOffset,
	isPlaying,
	speed,
	viewPreset,
	activeCountsByCategory,
	totalActive,
	searchQuery,
	onSearchChange,
	selectedCategory,
	onSelectCategory,
	onTogglePlay,
	onRestart,
	onSeek,
	onChangeSpeed,
	onChangeView,
}: ControlsProps) => {
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
				style={{
					background: "rgba(7, 19, 27, 0.88)",
					backdropFilter: "blur(8px)",
					border: "1px solid rgba(217, 226, 230, 0.25)",
					borderRadius: 12,
					pointerEvents: "auto",
				}}
				bodyStyle={{ padding: "12px 20px" }}
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
							style={{
								color: "#edf3f5",
								margin: 0,
								fontFamily: "monospace",
								letterSpacing: "1px",
							}}
						>
							🕒 {formatTime(timeOffset)}
						</Title>
						<Tag
							color="#1677ff"
							style={{
								fontSize: "0.85rem",
								padding: "2px 8px",
								cursor: "pointer",
							}}
							onClick={() => onSelectCategory("all")}
						>
							{totalActive} Active Trains
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
									onClick={() => onSelectCategory(isCatSelected ? "all" : cat)}
									style={{
										background: isCatSelected
											? `${cfg.color}33`
											: "rgba(255,255,255,0.05)",
										border: `1px solid ${cfg.color}`,
										color: "#edf3f5",
										fontSize: "0.75rem",
										cursor: "pointer",
										transition: "all 0.2s",
										boxShadow: isCatSelected
											? `0 0 8px ${cfg.color}66`
											: "none",
									}}
								>
									<span style={{ color: cfg.color, fontWeight: "bold" }}>
										●
									</span>{" "}
									{cfg.label}: <b style={{ color: cfg.color }}>{count}</b>
								</Tag>
							);
						})}
					</Space>

					{/* Search and View Selector */}
					<Space size="small" wrap>
						<input
							type="text"
							placeholder="🔍 Search service/station..."
							value={searchQuery}
							onChange={(e) => onSearchChange(e.target.value)}
							style={{
								background: "rgba(255, 255, 255, 0.08)",
								border: "1px solid rgba(217, 226, 230, 0.3)",
								borderRadius: 6,
								padding: "4px 8px",
								color: "#edf3f5",
								fontSize: "0.78rem",
								outline: "none",
								width: 180,
							}}
						/>
						<Radio.Group
							value={viewPreset}
							onChange={(e) => onChangeView(e.target.value)}
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
						onChange={onSeek}
						tooltip={{
							formatter: (val) => (val !== undefined ? formatTime(val) : ""),
						}}
						styles={{
							track: { background: "#59d7ff" },
							rail: { background: "rgba(255,255,255,0.2)" },
						}}
					/>
				</div>

				{/* Bottom Controls: Playback buttons & quick shortcuts */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginTop: 6,
					}}
				>
					<Space>
						<Button
							type="primary"
							shape="circle"
							icon={isPlaying ? <PauseOutlined /> : <PlayCircleOutlined />}
							onClick={onTogglePlay}
							style={{
								background: "#59d7ff",
								borderColor: "#59d7ff",
								color: "#07131b",
							}}
						/>
						<Button
							ghost
							shape="circle"
							icon={<RedoOutlined />}
							onClick={onRestart}
							style={{ color: "#edf3f5", borderColor: "rgba(255,255,255,0.3)" }}
						/>

						<Space size="small" style={{ marginLeft: 8 }}>
							<Text style={{ color: "#a8b5bc", fontSize: "0.8rem" }}>
								Speed:
							</Text>
							<Select
								value={speed}
								onChange={onChangeSpeed}
								size="small"
								style={{ width: 80 }}
								options={[
									{ value: 0.5, label: "0.5x" },
									{ value: 1, label: "1x" },
									{ value: 2, label: "2x" },
									{ value: 5, label: "5x" },
									{ value: 15, label: "15x" },
								]}
							/>
						</Space>
					</Space>

					{/* Quick Jump Times */}
					<Space size={6} wrap align="center">
						<Text
							style={{ color: "#59d7ff", fontSize: "0.85rem", fontWeight: 600 }}
						>
							Jump to:
						</Text>
						<Button
							size="small"
							onClick={() => onSeek(480)}
							style={{
								background: "rgba(89, 215, 255, 0.15)",
								borderColor: "#59d7ff",
								color: "#edf3f5",
								fontWeight: 500,
								borderRadius: 6,
							}}
						>
							🌅 08:00 Morning Rush
						</Button>
						<Button
							size="small"
							onClick={() => onSeek(780)}
							style={{
								background: "rgba(255, 255, 255, 0.08)",
								borderColor: "rgba(217, 226, 230, 0.35)",
								color: "#edf3f5",
								fontWeight: 500,
								borderRadius: 6,
							}}
						>
							☀️ 13:00 Midday
						</Button>
						<Button
							size="small"
							onClick={() => onSeek(1050)}
							style={{
								background: "rgba(255, 186, 99, 0.15)",
								borderColor: "#ffba63",
								color: "#edf3f5",
								fontWeight: 500,
								borderRadius: 6,
							}}
						>
							🌇 17:30 Evening Rush
						</Button>
						<Button
							size="small"
							onClick={() => onSeek(1320)}
							style={{
								background: "rgba(255, 43, 214, 0.15)",
								borderColor: "#ff2bd6",
								color: "#edf3f5",
								fontWeight: 500,
								borderRadius: 6,
							}}
						>
							🌙 22:00 Caledonian Sleeper
						</Button>
					</Space>
				</div>
			</Card>
		</div>
	);
};
