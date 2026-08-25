import { CloseOutlined } from "@ant-design/icons";
import { Button, Card, Divider, Space, Steps, Tag, Typography } from "antd";
import { useSnapshot } from "valtio";
import { STATIONS_BY_ID } from "../data/geography";
import { CATEGORIES } from "../data/types";
import { derivedStore, railActions, railStore } from "../store";

const { Title, Text } = Typography;

const formatTime = (minutes: number | null): string => {
	if (minutes === null) return "—";
	const h = Math.floor(minutes / 60) % 24;
	const m = Math.floor(minutes % 60);
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const ServiceDetails = () => {
	const snap = useSnapshot(railStore);
	const derivedSnap = useSnapshot(derivedStore);
	const { selectedService } = snap;
	const { activeTrains } = derivedSnap;

	if (!selectedService) return null;

	const catConfig = CATEGORIES[selectedService.category];
	const activeState =
		activeTrains.find((t) => t.service.id === selectedService.id) || null;

	return (
		<Card
			style={{
				position: "absolute",
				top: 16,
				right: 16,
				width: 340,
				maxHeight: "calc(100vh - 180px)",
				overflowY: "auto",
				background: "rgba(7, 19, 27, 0.92)",
				backdropFilter: "blur(10px)",
				border: `1px solid ${catConfig.color}`,
				borderRadius: 12,
				color: "#edf3f5",
				zIndex: 10,
			}}
			bodyStyle={{ padding: 16 }}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
					marginBottom: 12,
				}}
			>
				<div>
					<Space wrap size={[4, 6]}>
						<Tag
							color={catConfig.color}
							style={{ color: "#07131b", fontWeight: "bold" }}
						>
							{selectedService.serviceNumber}
						</Tag>
						<Tag
							style={{
								background: "rgba(255,255,255,0.08)",
								borderColor: catConfig.color,
								color: "#edf3f5",
								fontWeight: 600,
							}}
						>
							🏢 {selectedService.operator}
						</Tag>
						<Tag
							style={{
								background: "transparent",
								borderColor: "rgba(255,255,255,0.3)",
								color: "#a8b5bc",
							}}
						>
							{catConfig.label}
						</Tag>
					</Space>
					<Title level={4} style={{ color: "#edf3f5", margin: "8px 0 2px 0" }}>
						{selectedService.name}
					</Title>
					{selectedService.rollingStock && (
						<Text
							style={{ color: "#8ca0aa", fontSize: "0.8rem", display: "block" }}
						>
							🚆 Model:{" "}
							<span style={{ color: "#d9e2e6" }}>
								{selectedService.rollingStock}
							</span>
						</Text>
					)}
				</div>
				<Button
					type="text"
					size="small"
					icon={<CloseOutlined style={{ color: "#edf3f5" }} />}
					onClick={() => railActions.setSelectedService(null)}
				/>
			</div>

			{activeState && (
				<div
					style={{
						background: "rgba(255,255,255,0.06)",
						borderRadius: 6,
						padding: "8px 12px",
						marginBottom: 16,
					}}
				>
					<Text style={{ color: "#a8b5bc", fontSize: "0.85rem" }}>
						Live Status:
					</Text>
					<div style={{ fontWeight: 600, color: catConfig.color }}>
						{activeState.isDwelling
							? `Dwelling at ${activeState.currentStopName}`
							: `In transit to ${activeState.nextStopName || "Terminus"}`}
					</div>
				</div>
			)}

			<Divider
				style={{ borderColor: "rgba(255,255,255,0.15)", margin: "12px 0" }}
			/>

			<Text
				strong
				style={{
					color: "#a8b5bc",
					fontSize: "0.85rem",
					textTransform: "uppercase",
				}}
			>
				Scheduled Calling Points (Click to Jump)
			</Text>

			<div style={{ marginTop: 12 }}>
				<Steps
					direction="vertical"
					size="small"
					current={activeState?.currentSegmentIndex ?? -1}
					items={selectedService.calls.map((call, idx) => {
						const st = STATIONS_BY_ID.get(call.stationId);
						const targetTime =
							call.departureOffset !== null
								? call.departureOffset
								: call.arrivalOffset;
						const timeStr = formatTime(targetTime);

						return {
							title: (
								<button
									type="button"
									onClick={() => {
										if (targetTime !== null) {
											railActions.setTimeOffset(targetTime);
										}
									}}
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										cursor: "pointer",
										padding: "2px 4px",
										borderRadius: 4,
										width: "100%",
										background: "transparent",
										border: "none",
										textAlign: "left",
										transition: "background 0.2s",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.background =
											"rgba(255, 255, 255, 0.08)";
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = "transparent";
									}}
								>
									<span
										style={{
											color: "#edf3f5",
											fontWeight: 500,
										}}
									>
										{st?.name || call.stationId}
									</span>
									<span
										style={{
											color: catConfig.color,
											fontFamily: "monospace",
											background: "rgba(255, 255, 255, 0.06)",
											padding: "1px 6px",
											borderRadius: 4,
											fontSize: "0.8rem",
										}}
									>
										⏱️ {timeStr}
									</span>
								</button>
							),
							description: (
								<Text style={{ color: "#8ca0aa", fontSize: "0.75rem" }}>
									{idx === 0
										? "Origin Departure"
										: idx === selectedService.calls.length - 1
											? "Destination Terminus"
											: "Calling Point"}
								</Text>
							),
						};
					})}
				/>
			</div>
		</Card>
	);
};
