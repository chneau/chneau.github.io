import {
	AudioMutedOutlined,
	AudioOutlined,
	CloseOutlined,
	InfoCircleOutlined,
	QuestionCircleOutlined,
	SettingOutlined,
} from "@ant-design/icons";
import { Button, ConfigProvider, Layout, Tooltip, theme } from "antd";
import { useEffect, useRef } from "react";
import { useSnapshot } from "valtio";
import { Controls } from "./components/Controls";
import { ReplayCanvas } from "./components/ReplayCanvas";
import { ServiceDetails } from "./components/ServiceDetails";
import { SettingsModal } from "./components/SettingsModal";
import { SourcesModal } from "./components/SourcesModal";
import { StatsPanel } from "./components/StatsPanel";
import {
	derivedStore,
	railActions,
	railStore,
	recomputeActiveTrains,
} from "./store";
import { formatTime } from "./utils";

declare const BUILD_DATE: string;

export const App = () => {
	const snap = useSnapshot(railStore);
	const derivedSnap = useSnapshot(derivedStore);
	const {
		isInfoOpen,
		isPlaying,
		speed,
		settings,
		selectedService,
		searchQuery,
		timeOffset,
	} = snap;
	const { activeTrains } = derivedSnap;

	// Global Keyboard Shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const activeTag = document.activeElement?.tagName.toLowerCase();
			if (activeTag === "input" || activeTag === "textarea") return;

			if (e.code === "Space") {
				e.preventDefault();
				railActions.togglePlay();
			} else if (e.code === "ArrowLeft") {
				e.preventDefault();
				const step = e.shiftKey ? 15 : 5;
				railStore.timeOffset = Math.max(300, railStore.timeOffset - step);
				recomputeActiveTrains();
			} else if (e.code === "ArrowRight") {
				e.preventDefault();
				const step = e.shiftKey ? 15 : 5;
				railStore.timeOffset = Math.min(1440, railStore.timeOffset + step);
				recomputeActiveTrains();
			} else if (e.code === "ArrowUp") {
				e.preventDefault();
				const speeds = [0.5, 1, 2, 5, 15];
				const currIdx = speeds.indexOf(railStore.speed);
				if (currIdx < speeds.length - 1) {
					railActions.setSpeed(speeds[currIdx + 1] ?? 1);
				}
			} else if (e.code === "ArrowDown") {
				e.preventDefault();
				const speeds = [0.5, 1, 2, 5, 15];
				const currIdx = speeds.indexOf(railStore.speed);
				if (currIdx > 0) {
					railActions.setSpeed(speeds[currIdx - 1] ?? 1);
				}
			} else if (e.key === "m" || e.key === "M") {
				e.preventDefault();
				const nextSound = !railStore.settings.soundEffects;
				if (nextSound) {
					import("./engine/audio").then(({ railAudio }) =>
						railAudio.unlockAudio(),
					);
				}
				railActions.updateSetting("soundEffects", nextSound);
			} else if (e.code === "Escape") {
				if (railStore.selectedService) {
					railActions.setSelectedService(null);
				} else if (railStore.isSettingsOpen) {
					railActions.setIsSettingsOpen(false);
				} else if (railStore.isInfoOpen) {
					railActions.setIsInfoOpen(false);
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

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
				{/* Top Branding & Quick Actions Bar */}
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

					{/* Quick Audio Mute Toggle */}
					<Tooltip
						title={
							settings.soundEffects
								? "Sound effects active (Press M to mute)"
								: "Sound effects muted (Press M to unmute)"
						}
					>
						<Button
							type="text"
							size="small"
							icon={
								settings.soundEffects ? (
									<AudioOutlined style={{ color: "#59d7ff" }} />
								) : (
									<AudioMutedOutlined style={{ color: "#8ca0aa" }} />
								)
							}
							onClick={() => {
								const nextSound = !settings.soundEffects;
								if (nextSound) {
									import("./engine/audio").then(({ railAudio }) =>
										railAudio.unlockAudio(),
									);
								}
								railActions.updateSetting("soundEffects", nextSound);
							}}
							style={{
								color: settings.soundEffects ? "#59d7ff" : "#8ca0aa",
								padding: "0 4px",
								height: "auto",
							}}
						>
							{settings.soundEffects ? "Audio On" : "Audio Off"}
						</Button>
					</Tooltip>

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

					{/* Keyboard Shortcuts Hint Popover */}
					<Tooltip
						title={
							<div style={{ fontSize: "0.78rem", lineHeight: "1.6" }}>
								<div>
									<b>Space:</b> Play / Pause
								</div>
								<div>
									<b>← / →:</b> Scrub time (±5 min)
								</div>
								<div>
									<b>↑ / ↓:</b> Change speed
								</div>
								<div>
									<b>M:</b> Toggle audio
								</div>
								<div>
									<b>Esc:</b> Deselect train / Close
								</div>
								<div>
									<b>Click:</b> Inspect train or station
								</div>
							</div>
						}
					>
						<Button
							type="text"
							size="small"
							icon={<QuestionCircleOutlined />}
							style={{ color: "#8ca0aa", padding: "0 4px", height: "auto" }}
						>
							Shortcuts
						</Button>
					</Tooltip>
				</div>

				{/* Data Sources Modal */}
				<SourcesModal
					open={isInfoOpen}
					onClose={() => railActions.setIsInfoOpen(false)}
				/>

				{/* Map Canvas */}
				<ReplayCanvas />

				{/* Floating Empty Search Recovery Banner */}
				{searchQuery.trim().length > 0 && activeTrains.length === 0 && (
					<div
						style={{
							position: "absolute",
							top: 72,
							left: "50%",
							transform: "translateX(-50%)",
							zIndex: 20,
							background: "rgba(7, 19, 27, 0.92)",
							backdropFilter: "blur(10px)",
							border: "1px solid rgba(255, 77, 79, 0.4)",
							borderRadius: 8,
							padding: "8px 16px",
							display: "flex",
							alignItems: "center",
							gap: 12,
							color: "#edf3f5",
							boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
						}}
					>
						<span>
							🔍 No active services matching <b>"{searchQuery}"</b> at{" "}
							{formatTime(timeOffset)}
						</span>
						<Button
							size="small"
							type="primary"
							danger
							icon={<CloseOutlined />}
							onClick={() => railActions.setSearchQuery("")}
						>
							Clear Search
						</Button>
					</div>
				)}

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
