import { Box, Button, useMantineColorScheme } from "@mantine/core";
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
import {
	AppHeader,
	AppSwitcher,
	BackHome,
	Brand,
	HeaderAction,
	SchemeToggle,
} from "../shared";
import { Controls } from "./components/Controls";
import { ReplayCanvas } from "./components/ReplayCanvas";
import { ServiceDetails } from "./components/ServiceDetails";
import { SettingsModal } from "./components/SettingsModal";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { SourcesModal } from "./components/SourcesModal";
import { StatsPanel } from "./components/StatsPanel";
import { CATEGORIES } from "./data/types";
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
	const { colorScheme, setColorScheme } = useMantineColorScheme();
	const dark = colorScheme === "dark";
	const {
		isInfoOpen,
		isPlaying,
		isShortcutsOpen,
		speed,
		settings,
		selectedService,
		selectedCategory,
		searchQuery,
		timeOffset,
	} = snap;
	const { activeTrains } = derivedSnap;

	const hasSearch = searchQuery.trim().length > 0;
	const hasCategoryFilter = selectedCategory !== "all";
	const showNoMatch =
		activeTrains.length === 0 && (hasSearch || hasCategoryFilter);
	const categoryLabel =
		selectedCategory !== "all" ? CATEGORIES[selectedCategory].label : "";

	// Global Keyboard Shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const activeEl = document.activeElement;
			const activeTag = activeEl?.tagName.toLowerCase();
			// Let native controls handle their own keys (space/arrows/enter/Escape).
			if (
				activeTag === "input" ||
				activeTag === "textarea" ||
				activeTag === "button" ||
				activeTag === "select" ||
				activeTag === "a"
			) {
				return;
			}
			if (
				activeEl instanceof HTMLElement &&
				(activeEl.isContentEditable ||
					activeEl.closest('[role="slider"], [contenteditable="true"]'))
			) {
				return;
			}

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
				if (railStore.isShortcutsOpen) {
					railActions.setIsShortcutsOpen(false);
				} else if (railStore.isSettingsOpen) {
					railActions.setIsSettingsOpen(false);
				} else if (railStore.isInfoOpen) {
					railActions.setIsInfoOpen(false);
				} else if (railStore.selectedService) {
					railActions.setSelectedService(null);
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
				display: "flex",
				flexDirection: "column",
				width: "100vw",
				height: "100dvh",
				overflow: "hidden",
				background: palette.bg,
			}}
		>
			<AppHeader
				staticPosition
				brand={
					<Brand
						href="/"
						icon={<Compass size={18} />}
						title="A Day in Scottish Rail"
						subtitle={`24h replay · ${BUILD_DATE}`}
					/>
				}
				actions={
					<>
						<BackHome />
						<AppSwitcher />
						<HeaderAction
							iconOnly
							active={settings.soundEffects}
							label={
								settings.soundEffects
									? "Sound effects active (Press M to mute)"
									: "Sound effects muted (Press M to unmute)"
							}
							icon={
								settings.soundEffects ? (
									<Volume2 size={16} />
								) : (
									<VolumeX size={16} />
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
						/>
						<HeaderAction
							label="Data sources"
							icon={<Info size={15} />}
							onClick={() => railActions.setIsInfoOpen(true)}
						>
							Sources
						</HeaderAction>
						<HeaderAction
							label="Map and simulation settings"
							icon={<Settings size={15} />}
							onClick={() => railActions.setIsSettingsOpen(true)}
						>
							Settings
						</HeaderAction>
						<HeaderAction
							iconOnly
							label="Keyboard shortcuts"
							ariaHaspopup="dialog"
							ariaExpanded={isShortcutsOpen}
							icon={<CircleHelp size={15} />}
							onClick={() => railActions.setIsShortcutsOpen(true)}
						/>
						<SchemeToggle
							dark={dark}
							onToggle={() => setColorScheme(dark ? "light" : "dark")}
						/>
					</>
				}
			/>

			{/* Map canvas and its floating overlays */}
			<Box
				style={{
					position: "relative",
					flex: 1,
					minHeight: 0,
					overflow: "hidden",
				}}
			>
				{/* Data Sources Modal */}
				<SourcesModal
					open={isInfoOpen}
					onClose={() => railActions.setIsInfoOpen(false)}
				/>

				{/* Keyboard Shortcuts Modal */}
				<ShortcutsModal
					open={isShortcutsOpen}
					onClose={() => railActions.setIsShortcutsOpen(false)}
				/>

				{/* Map Canvas */}
				<ReplayCanvas />

				{/* Floating Empty Search Recovery Banner */}
				{showNoMatch && (
					<div
						className="sr-glass sr-rise"
						style={{
							position: "absolute",
							top: 16,
							left: "50%",
							transform: "translateX(-50%)",
							zIndex: 20,
							border: `1px solid ${palette.danger}`,
							borderRadius: 10,
							padding: "8px 14px",
							display: "flex",
							alignItems: "center",
							flexWrap: "wrap",
							gap: 12,
							color: palette.text,
							maxWidth: "calc(100vw - 32px)",
						}}
					>
						<Search size={16} style={{ color: palette.danger }} />
						<span style={{ fontSize: "0.85rem" }}>
							{hasSearch ? (
								<>
									No service matches <b>"{searchQuery}"</b>
								</>
							) : (
								<>
									No <b>{categoryLabel}</b> service is running
								</>
							)}{" "}
							at <span className="sr-num">{formatTime(timeOffset)}</span>
						</span>
						{hasSearch && (
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
								Clear search
							</Button>
						)}
						{hasCategoryFilter && (
							<Button
								size="xs"
								variant="subtle"
								color="red"
								onClick={() => railActions.setSelectedCategory("all")}
								style={{
									color: palette.danger,
									border: `1px solid ${palette.danger}`,
								}}
							>
								Show all categories
							</Button>
						)}
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
		</Box>
	);
};
