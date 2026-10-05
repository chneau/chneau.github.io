import { Box } from "@mantine/core";
import {
	Compass,
	Info,
	Keyboard,
	Moon,
	Pause,
	Play,
	Settings,
	Sun,
	Volume2,
	VolumeX,
} from "lucide-react";
import { useEffect, useRef } from "react";
import {
	AppNav,
	type Command,
	CommandPalette,
	HeaderAction,
	type ShortcutGroup,
	SkipLink,
	useCommandPalette,
	useShortcutsHelp,
} from "../shared";
import { useThemeMode } from "../shared/hooks/useThemeMode";
import { Controls } from "./components/Controls";
import { NoMatchBanner } from "./components/NoMatchBanner";
import { ReplayCanvas } from "./components/ReplayCanvas";
import { ServiceDetails } from "./components/ServiceDetails";
import { SettingsModal } from "./components/SettingsModal";
import { SourcesModal } from "./components/SourcesModal";
import { StatsPanel } from "./components/StatsPanel";
import { useThrottledSnapshots } from "./hooks";
import { useAmbientAudio, useRailShortcuts, useReplayClock } from "./runtime";
import { railActions, railUiStores } from "./store";
import { palette } from "./theme";

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

/** The three toggles in the header: sound, data sources, and map settings. */
const HeaderActions = ({
	soundEffects,
	onToggleSound,
}: {
	soundEffects: boolean;
	onToggleSound: () => void;
}) => (
	<>
		<HeaderAction
			iconOnly
			active={soundEffects}
			label={
				soundEffects
					? "Sound effects active (Press M to mute)"
					: "Sound effects muted (Press M to unmute)"
			}
			menuLabel={soundEffects ? "Sound effects on" : "Sound effects off"}
			icon={soundEffects ? <Volume2 size={16} /> : <VolumeX size={16} />}
			onClick={onToggleSound}
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
	</>
);

export const App = () => {
	// Throttled snapshots: the store is written every animation frame, but the
	// HUD only needs to re-render at ~15 Hz. ReplayCanvas keeps its own raw
	// subscription so the map itself still animates at 60 fps.
	const [snap, derivedSnap] = useThrottledSnapshots(railUiStores);
	const { dark, toggle } = useThemeMode();
	const shortcuts = useShortcutsHelp();
	const commandPalette = useCommandPalette();
	useRailShortcuts(shortcuts);

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

	useReplayClock(isPlaying, speed);
	useAmbientAudio(settings.soundEffects, isPlaying, activeTrains.length);

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
			run: toggle,
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

	const showNoMatch =
		activeTrains.length === 0 &&
		(searchQuery.trim().length > 0 || selectedCategory !== "all");

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
			<AppNav
				// This app binds the command palette, so the shared help dialog
				// may advertise it.
				hasCommandPalette
				staticPosition
				icon={<Compass size={18} />}
				title="A Day in Scottish Rail"
				subtitle={`24h replay · ${BUILD_DATE}`}
				shortcuts={SHORTCUT_GROUPS}
				theme={{
					dark,
					onToggle: toggle,
				}}
				actions={
					<HeaderActions
						soundEffects={settings.soundEffects}
						onToggleSound={() => {
							const nextSound = !settings.soundEffects;
							if (nextSound) {
								import("./engine/audio").then(({ railAudio }) =>
									railAudio.unlockAudio(),
								);
							}
							railActions.updateSetting("soundEffects", nextSound);
						}}
					/>
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
					<NoMatchBanner
						searchQuery={searchQuery}
						selectedCategory={selectedCategory}
						timeOffset={timeOffset}
					/>
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
