import { Box, Button, useMantineColorScheme } from "@mantine/core";
import {
	Compass,
	Info,
	Keyboard,
	Moon,
	Pause,
	Play,
	Search,
	Settings,
	Sun,
	Volume2,
	VolumeX,
	X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import {
	AppHeader,
	AppSwitcher,
	BackHome,
	Brand,
	type Command,
	CommandPalette,
	HeaderAction,
	HeaderOverflow,
	SchemeToggle,
	type ShortcutGroup,
	ShortcutsHelp,
	ShortcutsHelpButton,
	SkipLink,
	useCommandPalette,
	useShortcutsHelp,
} from "../shared";
import { Controls } from "./components/Controls";
import { ReplayCanvas } from "./components/ReplayCanvas";
import { ServiceDetails } from "./components/ServiceDetails";
import { SettingsModal } from "./components/SettingsModal";
import { SourcesModal } from "./components/SourcesModal";
import { StatsPanel } from "./components/StatsPanel";
import { CATEGORIES } from "./data/types";
import { useThrottledSnapshots } from "./hooks";
import {
	railActions,
	railStore,
	railUiStores,
	recomputeActiveTrains,
} from "./store";
import { palette } from "./theme";
import {
	formatTime,
	MAX_REPLAY_TIME,
	MIN_REPLAY_TIME,
	resolveRailShortcut,
	stepSpeed,
} from "./utils";

declare const BUILD_DATE: string;

const SHORTCUT_GROUPS: ShortcutGroup[] = [
	{
		title: "Playback",
		shortcuts: [
			{ keys: ["Space"], description: "Play / pause the replay" },
			{ keys: ["←", "→"], description: "Scrub time back / forward 5 minutes" },
			{ keys: ["Shift", "←/→"], description: "Scrub in 15-minute steps" },
			{ keys: ["↑", "↓"], description: "Increase / decrease playback speed" },
			{ keys: ["M"], description: "Toggle ambient audio" },
			{ keys: ["N", "P"], description: "Select the next / previous train" },
			{
				keys: ["Esc"],
				description: "Close the open panel or deselect a train",
			},
		],
	},
	{
		title: "Pointer",
		shortcuts: [
			{ keys: ["Click"], description: "Inspect a train or station" },
			{ keys: ["Drag"], description: "Pan the map" },
			{ keys: ["Scroll"], description: "Zoom the map in / out" },
		],
	},
];

export const App = () => {
	// Throttled snapshots: the store is written every animation frame, but the
	// HUD only needs to re-render at ~15 Hz. ReplayCanvas keeps its own raw
	// subscription so the map itself still animates at 60 fps.
	const [snap, derivedSnap] = useThrottledSnapshots(railUiStores);
	const { colorScheme, setColorScheme } = useMantineColorScheme();
	const dark = colorScheme === "dark";
	const shortcuts = useShortcutsHelp();
	const commandPalette = useCommandPalette();
	// Keep the always-bound keydown handler's view of the help dialog current
	// without putting `shortcuts.close` (a fresh closure each render) in deps.
	const shortcutsRef = useRef(shortcuts);
	shortcutsRef.current = shortcuts;
	const {
		isInfoOpen,
		isPlaying,
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

	// Global Keyboard Shortcuts. Bound once: the handler reads live state from
	// the store and a ref, and ignores key auto-repeat and already-handled keys.
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.repeat || e.defaultPrevented) return;
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

			const shortcut = resolveRailShortcut(e);
			if (!shortcut) return;

			switch (shortcut.kind) {
				case "toggle-play":
					e.preventDefault();
					railActions.togglePlay();
					break;
				case "scrub":
					e.preventDefault();
					// `setTimeOffset` clamps to the replay window, so holding an
					// arrow key stops at the ends instead of leaving it.
					railActions.setTimeOffset(
						railStore.timeOffset + shortcut.deltaMinutes,
					);
					break;
				case "speed": {
					e.preventDefault();
					const speed = stepSpeed(railStore.speed, shortcut.direction);
					if (speed !== null) railActions.setSpeed(speed);
					break;
				}
				case "toggle-sound": {
					e.preventDefault();
					const nextSound = !railStore.settings.soundEffects;
					if (nextSound) {
						import("./engine/audio").then(({ railAudio }) =>
							railAudio.unlockAudio(),
						);
					}
					railActions.updateSetting("soundEffects", nextSound);
					break;
				}
				case "escape":
					if (shortcutsRef.current.opened) {
						shortcutsRef.current.close();
					} else if (railStore.isSettingsOpen) {
						railActions.setIsSettingsOpen(false);
					} else if (railStore.isInfoOpen) {
						railActions.setIsInfoOpen(false);
					} else if (railStore.selectedService) {
						railActions.setSelectedService(null);
					}
					break;
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

			// Advance time: speed 1x = 1 minute per real second.
			// Written straight to the store (not through `setTimeOffset`) so
			// playback keeps sub-minute resolution; the window bound is still
			// enforced here, and only here, by looping back to 05:00.
			const minutesToAdd = (deltaMs / 1000) * speed;
			let next = railStore.timeOffset + minutesToAdd;
			if (next >= MAX_REPLAY_TIME) next = MIN_REPLAY_TIME;

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

	const commands: Command[] = [
		{
			id: "toggle-playback",
			label: isPlaying ? "Pause replay" : "Play replay",
			hint: "Playback",
			keywords: "play pause replay animation time",
			icon: isPlaying ? <Pause size={16} /> : <Play size={16} />,
			run: () => railActions.togglePlay(),
		},
		{
			id: "toggle-theme",
			label: `Switch to ${dark ? "light" : "dark"} theme`,
			hint: "Appearance",
			keywords: "theme light dark color scheme",
			icon: dark ? <Sun size={16} /> : <Moon size={16} />,
			run: () => setColorScheme(dark ? "light" : "dark"),
		},
		{
			id: "keyboard-shortcuts",
			label: "Keyboard shortcuts",
			hint: "Help",
			keywords: "keys help keyboard bindings",
			icon: <Keyboard size={16} />,
			run: () => shortcuts.open(),
		},
	];

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
			<SkipLink />
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
						{/* Seven controls is 344px at 360px wide, which squeezes the
						    brand to nothing, so on a phone only these two stay
						    inline. Above the breakpoint the overflow renders its
						    children inline, so a wide bar is unchanged. */}
						<HeaderOverflow>
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
							<ShortcutsHelpButton
								onClick={shortcuts.open}
								expanded={shortcuts.opened}
							/>
							<SchemeToggle
								dark={dark}
								onToggle={() => setColorScheme(dark ? "light" : "dark")}
							/>
						</HeaderOverflow>
					</>
				}
			/>

			{/* Map canvas and its floating overlays */}
			<Box
				component="main"
				id="main"
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

				{/* Keyboard Shortcuts Help */}
				<ShortcutsHelp
					opened={shortcuts.opened}
					onClose={shortcuts.close}
					groups={SHORTCUT_GROUPS}
				/>

				{/* Command Palette (Cmd/Ctrl-K) */}
				<CommandPalette
					opened={commandPalette.opened}
					onClose={commandPalette.close}
					commands={commands}
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
				<SettingsModal onOpenShortcuts={shortcuts.open} />

				{/* Controls */}
				<Controls />

				{/* Inspector Sidebar */}
				<ServiceDetails />
			</Box>
		</Box>
	);
};
