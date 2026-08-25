import { SettingOutlined } from "@ant-design/icons";
import { Button, Divider, Drawer, Space, Switch, Typography } from "antd";
import { useSnapshot } from "valtio";
import type { AppSettings } from "../data/types";
import { railActions, railStore } from "../store";

const { Text } = Typography;

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

	return (
		<Drawer
			title={
				<Space style={{ color: "#59d7ff", fontSize: "1rem" }}>
					<SettingOutlined />
					<span>Map & Simulation Settings</span>
				</Space>
			}
			placement="right"
			onClose={() => railActions.setIsSettingsOpen(false)}
			open={isSettingsOpen}
			styles={{
				body: {
					background: "#0d222f",
					color: "#edf3f5",
					padding: "16px 20px",
				},
				header: {
					background: "#07131b",
					color: "#edf3f5",
					borderBottom: "1px solid rgba(217, 226, 230, 0.15)",
				},
			}}
		>
			<Space orientation="vertical" size={16} style={{ width: "100%" }}>
				{/* Day & Night Lighting */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<div>
						<Text strong style={{ color: "#edf3f5", display: "block" }}>
							🌅 Dynamic Day / Night Lighting
						</Text>
						<Text
							type="secondary"
							style={{ fontSize: "0.78rem", color: "#8ca0aa" }}
						>
							Adjusts atmospheric sky, land tone and twilight as time progresses
						</Text>
					</div>
					<Switch
						checked={settings.dayNightCycle}
						onChange={(val) => handleSettingToggle("dayNightCycle", val)}
					/>
				</div>

				{/* Headlight Beams */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<div>
						<Text strong style={{ color: "#edf3f5", display: "block" }}>
							🔦 Train Headlight Beams
						</Text>
						<Text
							type="secondary"
							style={{ fontSize: "0.78rem", color: "#8ca0aa" }}
						>
							Projects directional glowing headlight cones from cruising trains
							in dark hours
						</Text>
					</div>
					<Switch
						checked={settings.trainHeadlights}
						onChange={(val) => handleSettingToggle("trainHeadlights", val)}
					/>
				</div>

				<Divider
					style={{ borderColor: "rgba(255,255,255,0.1)", margin: "8px 0" }}
				/>

				{/* Scottish Lochs */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<div>
						<Text strong style={{ color: "#edf3f5", display: "block" }}>
							🌊 Scottish Lochs & Lakes
						</Text>
						<Text
							type="secondary"
							style={{ fontSize: "0.78rem", color: "#8ca0aa" }}
						>
							Renders Loch Ness, Loch Lomond, Loch Tay, and Loch Morar
						</Text>
					</div>
					<Switch
						checked={settings.showLochs}
						onChange={(val) => handleSettingToggle("showLochs", val)}
					/>
				</div>

				{/* Scenic Landmarks */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<div>
						<Text strong style={{ color: "#edf3f5", display: "block" }}>
							🚂 Famous Rail Landmarks
						</Text>
						<Text
							type="secondary"
							style={{ fontSize: "0.78rem", color: "#8ca0aa" }}
						>
							Displays Glenfinnan Viaduct, Forth Rail Bridge, Tay Bridge, and
							Drumochter Summit
						</Text>
					</div>
					<Switch
						checked={settings.showLandmarks}
						onChange={(val) => handleSettingToggle("showLandmarks", val)}
					/>
				</div>

				{/* City Night Lights */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<div>
						<Text strong style={{ color: "#edf3f5", display: "block" }}>
							🏙️ Urban City Glow (Night)
						</Text>
						<Text
							type="secondary"
							style={{ fontSize: "0.78rem", color: "#8ca0aa" }}
						>
							Illuminates metropolitan clusters in Edinburgh, Glasgow, Dundee,
							and Aberdeen
						</Text>
					</div>
					<Switch
						checked={settings.cityLights}
						onChange={(val) => handleSettingToggle("cityLights", val)}
					/>
				</div>

				{/* Scottish Weather */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<div>
						<Text strong style={{ color: "#edf3f5", display: "block" }}>
							🌧️ Highland Weather Engine
						</Text>
						<Text
							type="secondary"
							style={{ fontSize: "0.78rem", color: "#8ca0aa" }}
						>
							Simulates misty highland rain and mountain precipitation
						</Text>
					</div>
					<Switch
						checked={settings.weatherEffects}
						onChange={(val) => handleSettingToggle("weatherEffects", val)}
					/>
				</div>

				<Divider
					style={{ borderColor: "rgba(255,255,255,0.1)", margin: "8px 0" }}
				/>

				{/* Network Heatmap */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<div>
						<Text strong style={{ color: "#edf3f5", display: "block" }}>
							🔥 Track Activity & Congestion Glow
						</Text>
						<Text
							type="secondary"
							style={{ fontSize: "0.78rem", color: "#8ca0aa" }}
						>
							Emphasizes high-frequency rail corridors (Central Belt & approach
							lines)
						</Text>
					</div>
					<Switch
						checked={settings.congestionHeatmap}
						onChange={(val) => handleSettingToggle("congestionHeatmap", val)}
					/>
				</div>

				{/* Camera Follow Mode */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<div>
						<Text strong style={{ color: "#edf3f5", display: "block" }}>
							🎥 Cab Ride (Follow Selected Train)
						</Text>
						<Text
							type="secondary"
							style={{ fontSize: "0.78rem", color: "#8ca0aa" }}
						>
							Automatically centers and follows whichever train you inspect
						</Text>
					</div>
					<Switch
						checked={settings.cameraFollowTrain}
						onChange={(val) => handleSettingToggle("cameraFollowTrain", val)}
					/>
				</div>

				{/* Sound effects */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<div>
						<Text strong style={{ color: "#edf3f5", display: "block" }}>
							🔔 Ambient Audio & Chimes
						</Text>
						<Text
							type="secondary"
							style={{ fontSize: "0.78rem", color: "#8ca0aa" }}
						>
							Synthesized station arrival tones & rail chimes
						</Text>
					</div>
					<Switch
						checked={settings.soundEffects}
						onChange={(val) => handleSettingToggle("soundEffects", val)}
					/>
				</div>

				<Divider
					style={{ borderColor: "rgba(255,255,255,0.1)", margin: "8px 0" }}
				/>

				<Button
					block
					ghost
					onClick={() => railActions.resetSettings()}
					style={{ color: "#8ca0aa", borderColor: "rgba(255,255,255,0.2)" }}
				>
					Reset to Defaults
				</Button>
			</Space>
		</Drawer>
	);
};
