import { Box, Button, Tooltip } from "@mantine/core";
import {
	CircleHelp,
	Compass,
	Info,
	Search,
	Settings,
	Volume2,
	VolumeX,
	X,
} from "lucide-react";
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
import { palette } from "./theme";
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
		<Box
			style={{
				width: "100vw",
				minHeight: "100dvh",
				height: "100dvh",
				overflow: "hidden",
				background: palette.bg,
			}}
		>
			{/* Top Branding & Quick Actions Bar */}
			<div
				className="sr-glass sr-rise"
				style={{
					position: "absolute",
					top: 16,
					left: 16,
					zIndex: 10,
					borderRadius: 10,
					padding: "6px 12px",
					color: palette.text,
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					gap: 10,
					maxWidth: "calc(100vw - 32px)",
				}}
			>
				<Compass size={16} style={{ color: palette.accent }} />
				<span
					style={{
						fontFamily: "var(--sr-font-display)",
						fontWeight: 600,
						fontSize: "0.95rem",
						letterSpacing: "-0.01em",
					}}
				>
					A Day in Scottish Rail
				</span>
				<span
					className="sr-num"
					style={{ color: palette.textMuted, fontSize: "0.72rem" }}
				>
					24h replay
				</span>
				<span
					className="sr-num"
					style={{
						color: palette.textFaint,
						fontSize: "0.7rem",
					}}
				>
					{BUILD_DATE}
				</span>

				{/* Quick Audio Mute Toggle */}
				<Tooltip
					label={
						settings.soundEffects
							? "Sound effects active (Press M to mute)"
							: "Sound effects muted (Press M to unmute)"
					}
				>
					<Button
						variant="subtle"
						size="xs"
						leftSection={
							settings.soundEffects ? (
								<Volume2 size={15} style={{ color: palette.accent }} />
							) : (
								<VolumeX size={15} style={{ color: palette.textMuted }} />
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
							color: settings.soundEffects ? palette.accent : palette.textMuted,
							padding: "0 4px",
							height: "auto",
						}}
					>
						{settings.soundEffects ? "Audio On" : "Audio Off"}
					</Button>
				</Tooltip>

				<Button
					variant="subtle"
					size="xs"
					leftSection={<Info size={15} />}
					onClick={() => railActions.setIsInfoOpen(true)}
					style={{
						color: palette.accent,
						padding: "0 4px",
						height: "auto",
					}}
				>
					Sources
				</Button>
				<Button
					variant="subtle"
					size="xs"
					leftSection={<Settings size={15} />}
					onClick={() => railActions.setIsSettingsOpen(true)}
					style={{
						color: palette.textMuted,
						padding: "0 4px",
						height: "auto",
					}}
				>
					Settings
				</Button>

				{/* Keyboard Shortcuts Hint Popover */}
				<Tooltip
					label={
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
						variant="subtle"
						size="xs"
						leftSection={<CircleHelp size={15} />}
						style={{
							color: palette.textFaint,
							padding: "0 4px",
							height: "auto",
						}}
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
					className="sr-glass sr-rise"
					style={{
						position: "absolute",
						top: 72,
						left: "50%",
						transform: "translateX(-50%)",
						zIndex: 20,
						border: `1px solid ${palette.danger}`,
						borderRadius: 10,
						padding: "8px 14px",
						display: "flex",
						alignItems: "center",
						gap: 12,
						color: palette.text,
						maxWidth: "calc(100vw - 32px)",
					}}
				>
					<Search size={16} style={{ color: palette.danger }} />
					<span style={{ fontSize: "0.85rem" }}>
						No service matches <b>"{searchQuery}"</b> at{" "}
						<span className="sr-num">{formatTime(timeOffset)}</span>
					</span>
					<Button
						size="xs"
						variant="subtle"
						color="red"
						leftSection={<X size={14} />}
						onClick={() => railActions.setSearchQuery("")}
						style={{
							color: palette.danger,
							border: `1px solid ${palette.danger}`,
						}}
					>
						Clear
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
		</Box>
	);
};
