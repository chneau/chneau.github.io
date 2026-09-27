import { Button, Divider, Drawer, Switch, Text } from "@mantine/core";
import {
	Building2,
	Cloud,
	Compass,
	Crosshair,
	Flame,
	MapPin,
	Settings,
	TrendingUp,
	Volume2,
	Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useSnapshot } from "valtio";
import type { AppSettings } from "../data/types";
import { railActions, railStore } from "../store";
import { palette } from "../theme";

type SettingRow = {
	key: keyof AppSettings;
	icon: ReactNode;
	label: string;
	hint: string;
};

const ATMOSPHERE_SETTINGS: SettingRow[] = [
	{
		key: "dayNightCycle",
		icon: <TrendingUp size={15} />,
		label: "Dynamic day / night lighting",
		hint: "Shifts sky, land tone and twilight as the day progresses",
	},
	{
		key: "trainHeadlights",
		icon: <Zap size={15} />,
		label: "Train headlight beams",
		hint: "Projects directional light cones from cruising trains after dark",
	},
	{
		key: "weatherEffects",
		icon: <Cloud size={15} />,
		label: "Highland weather engine",
		hint: "Simulates drifting highland rain across the map",
	},
	{
		key: "cityLights",
		icon: <Building2 size={15} />,
		label: "Urban glow at night",
		hint: "Illuminates Glasgow, Edinburgh, Dundee and Aberdeen after dusk",
	},
];

const NETWORK_SETTINGS: SettingRow[] = [
	{
		key: "showLochs",
		icon: <MapPin size={15} />,
		label: "Scottish lochs",
		hint: "Renders Loch Ness, Loch Lomond, Loch Tay and Loch Morar",
	},
	{
		key: "showLandmarks",
		icon: <Compass size={15} />,
		label: "Famous rail landmarks",
		hint: "Glenfinnan, Forth Bridge, Tay Bridge and Drumochter Summit",
	},
	{
		key: "congestionHeatmap",
		icon: <Flame size={15} />,
		label: "Congestion emphasis",
		hint: "Highlights high-frequency corridors through the Central Belt",
	},
	{
		key: "cameraFollowTrain",
		icon: <Crosshair size={15} />,
		label: "Cab ride",
		hint: "Keeps the camera centred on the train you inspect",
	},
	{
		key: "soundEffects",
		icon: <Volume2 size={15} />,
		label: "Ambient audio and chimes",
		hint: "Synthesised arrival tones and rail chimes",
	},
];

export const SettingsModal = () => {
	const snap = useSnapshot(railStore);
	const { isSettingsOpen, settings } = snap;

	const handleSettingToggle = <K extends keyof AppSettings>(
		key: K,
		val: AppSettings[K],
	) => {
		if (key === "soundEffects" && val) {
			import("../engine/audio").then(({ railAudio }) => {
				railAudio.unlockAudio();
			});
		}
		railActions.updateSetting(key, val);
	};

	const renderRow = ({ key, icon, label, hint }: SettingRow) => (
		<div
			key={key}
			style={{
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
				gap: 16,
			}}
		>
			<div style={{ minWidth: 0 }}>
				<Text
					fw={600}
					style={{
						color: palette.text,
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					<span style={{ color: palette.accent, display: "inline-flex" }}>
						{icon}
					</span>
					{label}
				</Text>
				<Text
					style={{
						fontSize: "0.76rem",
						color: palette.textMuted,
						display: "block",
						marginTop: 2,
					}}
				>
					{hint}
				</Text>
			</div>
			<Switch
				checked={settings[key]}
				onChange={(event) =>
					handleSettingToggle(key, event.currentTarget.checked)
				}
			/>
		</div>
	);

	return (
		<Drawer
			title={
				<span
					style={{
						color: palette.accent,
						fontSize: "1rem",
						display: "inline-flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					<Settings size={16} />
					Map and simulation
				</span>
			}
			position="right"
			onClose={() => railActions.setIsSettingsOpen(false)}
			opened={isSettingsOpen}
			styles={{
				content: { background: palette.surfaceSolid },
				body: {
					background: palette.surfaceSolid,
					color: palette.text,
					padding: "16px 20px",
				},
				header: {
					background: palette.bg,
					color: palette.text,
					borderBottom: "1px solid rgba(206, 222, 230, 0.12)",
				},
			}}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 16,
				}}
			>
				<Text
					style={{
						color: palette.textFaint,
						fontSize: "0.72rem",
						textTransform: "uppercase",
						letterSpacing: "0.08em",
					}}
				>
					Atmosphere
				</Text>
				{ATMOSPHERE_SETTINGS.map(renderRow)}

				<Divider
					style={{ borderColor: "rgba(255,255,255,0.08)", margin: "2px 0" }}
				/>

				<Text
					style={{
						color: palette.textFaint,
						fontSize: "0.72rem",
						textTransform: "uppercase",
						letterSpacing: "0.08em",
					}}
				>
					Network and playback
				</Text>
				{NETWORK_SETTINGS.map(renderRow)}

				<Divider
					style={{ borderColor: "rgba(255,255,255,0.08)", margin: "2px 0" }}
				/>

				<Button
					fullWidth
					variant="default"
					className="sr-press"
					onClick={() => railActions.resetSettings()}
					style={{
						color: palette.textMuted,
						borderColor: palette.borderStrong,
					}}
				>
					Reset to defaults
				</Button>
			</div>
		</Drawer>
	);
};
