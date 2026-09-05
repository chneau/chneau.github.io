import { InfoCircleOutlined, SettingOutlined } from "@ant-design/icons";
import { Button, ConfigProvider, Layout, theme } from "antd";
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

declare const BUILD_DATE: string;

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
				<SourcesModal
					open={isInfoOpen}
					onClose={() => railActions.setIsInfoOpen(false)}
				/>

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
