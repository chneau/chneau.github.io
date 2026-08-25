import { InfoCircleOutlined, SettingOutlined } from "@ant-design/icons";
import {
	Button,
	ConfigProvider,
	Divider,
	Layout,
	Modal,
	Typography,
	theme,
} from "antd";
import { useEffect, useRef } from "react";
import { useSnapshot } from "valtio";
import { Controls } from "./components/Controls";
import { ReplayCanvas } from "./components/ReplayCanvas";
import { ServiceDetails } from "./components/ServiceDetails";
import { SettingsModal } from "./components/SettingsModal";
import { StatsPanel } from "./components/StatsPanel";
import {
	derivedStore,
	railActions,
	railStore,
	recomputeActiveTrains,
} from "./store";

declare const BUILD_DATE: string;

const { Title, Paragraph, Text, Link } = Typography;

export const App = () => {
	const snap = useSnapshot(railStore);
	const derivedSnap = useSnapshot(derivedStore);
	const { isInfoOpen, isPlaying, speed, settings, selectedService } = snap;
	const { activeTrains } = derivedSnap;

	// Animation frame loop directly updating store
	useEffect(() => {
		if (!isPlaying) return;

		let lastTimestamp = performance.now();
		let animId: number;

		const loop = (timestamp: number) => {
			const deltaMs = timestamp - lastTimestamp;
			lastTimestamp = timestamp;

			// Advance time: speed 1x = 1 minute per real second
			const minutesToAdd = (deltaMs / 1000) * speed;
			let next = railStore.timeOffset + minutesToAdd;
			if (next >= 1440) next = 300; // loop back to 05:00

			railStore.timeOffset = next;
			recomputeActiveTrains();

			animId = requestAnimationFrame(loop);
		};

		animId = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(animId);
	}, [isPlaying, speed]);

	// Audio synthesizer management
	useEffect(() => {
		if (settings.soundEffects && isPlaying && activeTrains.length > 0) {
			import("./engine/audio").then(({ railAudio }) => {
				railAudio.startAmbient(activeTrains.length);
				railAudio.updateIntensity(activeTrains.length);
			});
		} else {
			import("./engine/audio").then(({ railAudio }) => {
				railAudio.stop();
			});
		}
	}, [settings.soundEffects, isPlaying, activeTrains.length]);

	// Trigger station arrival chime when selected train arrives at a station
	const prevSelectedDwellingRef = useRef<boolean>(false);
	useEffect(() => {
		if (!selectedService || !settings.soundEffects) return;
		const activeSelected = activeTrains.find(
			(t) => t.service.id === selectedService.id,
		);
		if (activeSelected?.isDwelling && !prevSelectedDwellingRef.current) {
			import("./engine/audio").then(({ railAudio }) => {
				railAudio.playArrivalChime();
			});
		}
		prevSelectedDwellingRef.current = !!activeSelected?.isDwelling;
	}, [activeTrains, selectedService, settings.soundEffects]);

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
					<span
						style={{
							color: "#8ca0aa",
							fontSize: "0.7rem",
							opacity: 0.7,
						}}
					>
						({BUILD_DATE})
					</span>
					<Button
						type="text"
						size="small"
						icon={<InfoCircleOutlined />}
						onClick={() => railActions.setIsInfoOpen(true)}
						style={{
							color: "#59d7ff",
							padding: "0 4px",
							height: "auto",
						}}
					>
						Sources
					</Button>
					<Button
						type="text"
						size="small"
						icon={<SettingOutlined />}
						onClick={() => railActions.setIsSettingsOpen(true)}
						style={{
							color: "#a8b5bc",
							padding: "0 4px",
							height: "auto",
						}}
					>
						Settings
					</Button>
				</div>

				{/* Data Sources Modal */}
				<Modal
					title="Data Sources & Method"
					open={isInfoOpen}
					onOk={() => railActions.setIsInfoOpen(false)}
					onCancel={() => railActions.setIsInfoOpen(false)}
					footer={[
						<Button
							key="close"
							type="primary"
							onClick={() => railActions.setIsInfoOpen(false)}
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
						style={{
							borderColor: "rgba(255,255,255,0.15)",
							margin: "12px 0",
						}}
					/>

					<Title level={5} style={{ color: "#59d7ff", marginTop: 0 }}>
						Geospatial & Cartographic Data
					</Title>
					<ul style={{ color: "#d9e2e6", paddingLeft: 20 }}>
						<li>
							<strong>Coastlines & Islands:</strong>{" "}
							<Link
								href="https://www.naturalearthdata.com/downloads/50m-physical-vectors/"
								target="_blank"
								rel="noreferrer"
								style={{ color: "#59d7ff" }}
							>
								Natural Earth 50m Physical Vectors
							</Link>{" "}
							(Ingested via{" "}
							<Text
								code
								style={{
									color: "#59d7ff",
									background: "rgba(255,255,255,0.1)",
								}}
							>
								_getData.ts
							</Text>
							).
						</li>
						<li>
							<strong>Rail Network & Alignment:</strong>{" "}
							<Link
								href="https://www.openrailwaymap.org/"
								target="_blank"
								rel="noreferrer"
								style={{ color: "#59d7ff" }}
							>
								OpenRailwayMap
							</Link>{" "}
							&{" "}
							<Link
								href="https://www.openstreetmap.org/"
								target="_blank"
								rel="noreferrer"
								style={{ color: "#59d7ff" }}
							>
								OpenStreetMap
							</Link>{" "}
							(ODbL Open Database License).
						</li>
					</ul>

					<Title level={5} style={{ color: "#59d7ff", marginTop: 16 }}>
						Official Timetable & Schedule Feeds
					</Title>
					<ul style={{ color: "#d9e2e6", paddingLeft: 20 }}>
						<li>
							<strong>National Rail & Operator Feeds:</strong> Real-world
							operational timetables compiled from:
							<ul style={{ marginTop: 4 }}>
								<li>
									<Link
										href="https://www.scotrail.co.uk/plan-your-journey/timetables"
										target="_blank"
										rel="noreferrer"
										style={{ color: "#59d7ff" }}
									>
										ScotRail Official Timetable Publications
									</Link>{" "}
									(Central Belt, Highland Mainline, West Highland, Far North,
									Borders)
								</li>
								<li>
									<Link
										href="https://www.lner.co.uk/travel-information/travelling-now/travel-updates/timetables/"
										target="_blank"
										rel="noreferrer"
										style={{ color: "#b347ff" }}
									>
										LNER Timetable Feed
									</Link>{" "}
									(London King's Cross to Edinburgh, Highland Chieftain to
									Inverness, Northern Lights to Aberdeen)
								</li>
								<li>
									<Link
										href="https://www.sleeper.co.uk/timetables/"
										target="_blank"
										rel="noreferrer"
										style={{ color: "#ff2bd6" }}
									>
										Caledonian Sleeper Timetables
									</Link>{" "}
									(Overnight Lowland & Highland sleeper paths)
								</li>
								<li>
									<Link
										href="https://www.avantiwestcoast.co.uk/travel-information/timetables"
										target="_blank"
										rel="noreferrer"
										style={{ color: "#59d7ff" }}
									>
										Avanti West Coast
									</Link>{" "}
									&{" "}
									<Link
										href="https://www.crosscountrytrains.co.uk/travel-updates-information/timetables"
										target="_blank"
										rel="noreferrer"
										style={{ color: "#59d7ff" }}
									>
										CrossCountry
									</Link>
								</li>
							</ul>
						</li>
						<li>
							<strong>Data Ingestion:</strong> Ingested into static JSON dataset
							(
							<Text
								code
								style={{
									color: "#59d7ff",
									background: "rgba(255,255,255,0.1)",
								}}
							>
								data/timetable.json
							</Text>
							) via{" "}
							<Text
								code
								style={{
									color: "#59d7ff",
									background: "rgba(255,255,255,0.1)",
								}}
							>
								_getData.ts
							</Text>
							.
						</li>
					</ul>

					<Divider
						style={{
							borderColor: "rgba(255,255,255,0.15)",
							margin: "12px 0",
						}}
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
				<ReplayCanvas />

				{/* Live Dynamic Stats Panel (Left HUD) */}
				<StatsPanel />

				{/* Settings Drawer */}
				<SettingsModal />

				{/* Controls */}
				<Controls />

				{/* Inspector Sidebar */}
				<ServiceDetails />
			</Layout>
		</ConfigProvider>
	);
};
