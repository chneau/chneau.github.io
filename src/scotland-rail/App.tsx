import { InfoCircleOutlined } from "@ant-design/icons";
import {
	Button,
	ConfigProvider,
	Divider,
	Layout,
	Modal,
	Typography,
	theme,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { Controls } from "./components/Controls";
import { ReplayCanvas } from "./components/ReplayCanvas";
import { ServiceDetails } from "./components/ServiceDetails";
import { STATIONS } from "./data/geography";
import { generateSchedule } from "./data/schedule";
import type { Category, TrainService, ViewPreset } from "./data/types";
import {
	type ActiveTrainState,
	resolveServiceAtTime,
} from "./engine/interpolator";

const { Title, Paragraph, Text, Link } = Typography;

export const App = () => {
	const [timeOffset, setTimeOffset] = useState<number>(480); // Start at 08:00 AM
	const [isPlaying, setIsPlaying] = useState<boolean>(true);
	const [speed, setSpeed] = useState<number>(2); // 2x default speed
	const [viewPreset, setViewPreset] = useState<ViewPreset>("scotland");
	const [selectedService, setSelectedService] = useState<TrainService | null>(
		null,
	);
	const [hoveredServiceId, setHoveredServiceId] = useState<string | null>(null);
	const [isInfoOpen, setIsInfoOpen] = useState<boolean>(false);

	// Generate static schedule
	const services = useMemo(() => generateSchedule(), []);
	const stationNamesById = useMemo(() => {
		return new Map(STATIONS.map((s) => [s.id, s.name]));
	}, []);

	// Animation frame loop
	useEffect(() => {
		if (!isPlaying) return;

		let lastTimestamp = performance.now();
		let animId: number;

		const loop = (timestamp: number) => {
			const deltaMs = timestamp - lastTimestamp;
			lastTimestamp = timestamp;

			// Advance time: speed 1x = 1 minute per real second
			// 1 min / 1000ms
			const minutesToAdd = (deltaMs / 1000) * speed;

			setTimeOffset((prev) => {
				const next = prev + minutesToAdd;
				if (next >= 1440) return 300; // loop back to 05:00
				return next;
			});

			animId = requestAnimationFrame(loop);
		};

		animId = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(animId);
	}, [isPlaying, speed]);

	// Compute active trains for current time offset
	const activeTrains: ActiveTrainState[] = useMemo(() => {
		const result: ActiveTrainState[] = [];
		for (const service of services) {
			const state = resolveServiceAtTime(service, timeOffset, stationNamesById);
			if (state) {
				result.push(state);
			}
		}
		return result;
	}, [services, timeOffset, stationNamesById]);

	// Aggregate counts by category
	const activeCountsByCategory = useMemo(() => {
		const counts: Record<Category, number> = {
			Express: 0,
			Highland: 0,
			Commuter: 0,
			CrossBorder: 0,
			Sleeper: 0,
		};
		for (const train of activeTrains) {
			counts[train.service.category] =
				(counts[train.service.category] || 0) + 1;
		}
		return counts;
	}, [activeTrains]);

	const activeSelectedState = useMemo(() => {
		if (!selectedService) return null;
		return (
			activeTrains.find((t) => t.service.id === selectedService.id) || null
		);
	}, [activeTrains, selectedService]);

	return (
		<ConfigProvider
			theme={{
				algorithm: theme.darkAlgorithm,
				token: {
					colorPrimary: "#59d7ff",
				},
			}}
		>
			<Layout
				style={{
					width: "100vw",
					height: "100vh",
					overflow: "hidden",
					background: "#07131b",
				}}
			>
				{/* Top Branding & Sources Bar */}
				<div
					style={{
						position: "absolute",
						top: 16,
						left: 16,
						zIndex: 10,
						background: "rgba(7, 19, 27, 0.88)",
						backdropFilter: "blur(8px)",
						border: "1px solid rgba(217, 226, 230, 0.25)",
						borderRadius: 8,
						padding: "6px 12px",
						color: "#edf3f5",
						display: "flex",
						alignItems: "center",
						gap: 10,
					}}
				>
					<span style={{ fontSize: "1.2rem" }}>🏴󠁧󠁢󠁳󠁣󠁴󠁿</span>
					<span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
						A Day in Scottish Rail
					</span>
					<span style={{ color: "#8ca0aa", fontSize: "0.75rem" }}>
						| 24h Replay
					</span>
					<Button
						type="text"
						size="small"
						icon={<InfoCircleOutlined />}
						onClick={() => setIsInfoOpen(true)}
						style={{ color: "#59d7ff", padding: "0 4px", height: "auto" }}
					>
						Sources
					</Button>
				</div>

				{/* Data Sources Modal */}
				<Modal
					title="Data Sources & Method"
					open={isInfoOpen}
					onOk={() => setIsInfoOpen(false)}
					onCancel={() => setIsInfoOpen(false)}
					footer={[
						<Button
							key="close"
							type="primary"
							onClick={() => setIsInfoOpen(false)}
						>
							Close
						</Button>,
					]}
					styles={{
						body: {
							color: "#edf3f5",
						},
						header: {
							background: "transparent",
							color: "#edf3f5",
						},
					}}
				>
					<Paragraph style={{ color: "#d9e2e6" }}>
						<strong>A Day in Scottish Rail</strong> is an interactive 24-hour
						simulation reconstructing passenger train activity across Scotland's
						national and regional rail network.
					</Paragraph>

					<Divider
						style={{ borderColor: "rgba(255,255,255,0.15)", margin: "12px 0" }}
					/>

					<Title level={5} style={{ color: "#59d7ff", marginTop: 0 }}>
						Geospatial & Cartographic Data
					</Title>
					<ul style={{ color: "#d9e2e6", paddingLeft: 20 }}>
						<li>
							<strong>Coastlines & Islands:</strong>{" "}
							<Link
								href="https://www.naturalearthdata.com/"
								target="_blank"
								rel="noreferrer"
								style={{ color: "#59d7ff" }}
							>
								Natural Earth 50m Physical Vectors
							</Link>{" "}
							(Public Domain).
						</li>
						<li>
							<strong>Rail Infrastructure & Stations:</strong> Derived from{" "}
							<Link
								href="https://www.openstreetmap.org/"
								target="_blank"
								rel="noreferrer"
								style={{ color: "#59d7ff" }}
							>
								OpenStreetMap
							</Link>{" "}
							(ODbL) and{" "}
							<Link
								href="https://www.openrailwaymap.org/"
								target="_blank"
								rel="noreferrer"
								style={{ color: "#59d7ff" }}
							>
								OpenRailwayMap
							</Link>
							.
						</li>
					</ul>

					<Title level={5} style={{ color: "#59d7ff", marginTop: 16 }}>
						Timetable & Train Movements
					</Title>
					<ul style={{ color: "#d9e2e6", paddingLeft: 20 }}>
						<li>
							<strong>Schedules & Services:</strong> Curated synthetic 24-hour
							timetable model reflecting standard weekday operations for:
							<ul style={{ marginTop: 4 }}>
								<li>
									<Text style={{ color: "#59d7ff" }}>
										ScotRail Express & Regional
									</Text>{" "}
									(Central Belt, Highland Main Line, West Highland Line, Far
									North, Borders)
								</li>
								<li>
									<Text style={{ color: "#b347ff" }}>
										Cross-Border InterCity
									</Text>{" "}
									(LNER, Avanti West Coast, CrossCountry)
								</li>
								<li>
									<Text style={{ color: "#ff2bd6" }}>Caledonian Sleeper</Text>{" "}
									(Overnight Highlands & Lowlands)
								</li>
							</ul>
						</li>
						<li>
							<strong>Official Network Reference:</strong> Timetable structures
							reference published schedules from{" "}
							<Link
								href="https://www.scotrail.co.uk/"
								target="_blank"
								rel="noreferrer"
								style={{ color: "#59d7ff" }}
							>
								ScotRail
							</Link>{" "}
							and National Rail data.
						</li>
					</ul>

					<Divider
						style={{ borderColor: "rgba(255,255,255,0.15)", margin: "12px 0" }}
					/>

					<Text
						type="secondary"
						style={{ fontSize: "0.8rem", color: "#8ca0aa" }}
					>
						Built with React 19, Ant Design, and Canvas 2D. Inspired by the{" "}
						<Link
							href="https://white-smoke-0b215f103.7.azurestaticapps.net/"
							target="_blank"
							rel="noreferrer"
							style={{ color: "#59d7ff" }}
						>
							A Day in Irish Rail
						</Link>{" "}
						replay simulation project.
					</Text>
				</Modal>

				{/* Map Canvas */}
				<ReplayCanvas
					viewPreset={viewPreset}
					selectedServiceId={selectedService?.id ?? null}
					hoveredServiceId={hoveredServiceId}
					onSelectService={setSelectedService}
					onHoverService={setHoveredServiceId}
					services={services}
					activeTrains={activeTrains}
				/>

				{/* Controls */}
				<Controls
					timeOffset={timeOffset}
					isPlaying={isPlaying}
					speed={speed}
					viewPreset={viewPreset}
					activeCountsByCategory={activeCountsByCategory}
					totalActive={activeTrains.length}
					onTogglePlay={() => setIsPlaying(!isPlaying)}
					onRestart={() => setTimeOffset(300)}
					onSeek={(val) => setTimeOffset(val)}
					onChangeSpeed={setSpeed}
					onChangeView={setViewPreset}
				/>

				{/* Inspector Sidebar */}
				{selectedService && (
					<ServiceDetails
						service={selectedService}
						activeState={activeSelectedState}
						onClose={() => setSelectedService(null)}
					/>
				)}
			</Layout>
		</ConfigProvider>
	);
};
