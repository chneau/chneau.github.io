import {
	AimOutlined,
	ApartmentOutlined,
	AudioOutlined,
	CloudOutlined,
	CompassOutlined,
	EnvironmentOutlined,
	FireOutlined,
	RiseOutlined,
	SettingOutlined,
	ThunderboltOutlined,
} from "@ant-design/icons";
import { Button, Divider, Drawer, Switch, Typography } from "antd";
import type { ReactNode } from "react";
import { useSnapshot } from "valtio";
import type { AppSettings } from "../data/types";
import { railActions, railStore } from "../store";
import { palette } from "../theme";

const { Text } = Typography;

type SettingRow = {
	key: keyof AppSettings;
	icon: ReactNode;
	label: string;
	hint: string;
};

const ATMOSPHERE_SETTINGS: SettingRow[] = [
	{
		key: "dayNightCycle",
		icon: <RiseOutlined />,
		label: "Dynamic day / night lighting",
		hint: "Shifts sky, land tone and twilight as the day progresses",
	},
	{
		key: "trainHeadlights",
		icon: <ThunderboltOutlined />,
		label: "Train headlight beams",
		hint: "Projects directional light cones from cruising trains after dark",
	},
	{
		key: "weatherEffects",
		icon: <CloudOutlined />,
		label: "Highland weather engine",
		hint: "Simulates drifting highland rain across the map",
	},
	{
		key: "cityLights",
		icon: <ApartmentOutlined />,
		label: "Urban glow at night",
		hint: "Illuminates Glasgow, Edinburgh, Dundee and Aberdeen after dusk",
	},
];

const NETWORK_SETTINGS: SettingRow[] = [
	{
		key: "showLochs",
		icon: <EnvironmentOutlined />,
		label: "Scottish lochs",
		hint: "Renders Loch Ness, Loch Lomond, Loch Tay and Loch Morar",
	},
	{
		key: "showLandmarks",
		icon: <CompassOutlined />,
		label: "Famous rail landmarks",
		hint: "Glenfinnan, Forth Bridge, Tay Bridge and Drumochter Summit",
	},
	{
		key: "congestionHeatmap",
		icon: <FireOutlined />,
		label: "Congestion emphasis",
		hint: "Highlights high-frequency corridors through the Central Belt",
	},
	{
		key: "cameraFollowTrain",
		icon: <AimOutlined />,
		label: "Cab ride",
		hint: "Keeps the camera centred on the train you inspect",
	},
	{
		key: "soundEffects",
		icon: <AudioOutlined />,
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
					strong
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
				onChange={(val) => handleSettingToggle(key, val)}
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
					<SettingOutlined />
					Map and simulation
				</span>
			}
			placement="right"
			onClose={() => railActions.setIsSettingsOpen(false)}
			open={isSettingsOpen}
			styles={{
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
					block
					ghost
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
