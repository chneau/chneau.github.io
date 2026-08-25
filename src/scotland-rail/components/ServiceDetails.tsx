import { CloseOutlined } from "@ant-design/icons";
import { Button, Card, Divider, Space, Steps, Tag, Typography } from "antd";
import { STATIONS_BY_ID } from "../data/geography";
import { CATEGORIES, type TrainService } from "../data/types";
import type { ActiveTrainState } from "../engine/interpolator";

const { Title, Text } = Typography;

type ServiceDetailsProps = {
	service: TrainService;
	activeState?: ActiveTrainState | null;
	onClose: () => void;
};

const formatTime = (minutes: number | null): string => {
	if (minutes === null) return "—";
	const h = Math.floor(minutes / 60) % 24;
	const m = Math.floor(minutes % 60);
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const ServiceDetails = ({
	service,
	activeState,
	onClose,
}: ServiceDetailsProps) => {
	const catConfig = CATEGORIES[service.category];

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
							{service.serviceNumber}
						</Tag>
						<Tag
							style={{
								background: "rgba(255,255,255,0.08)",
								borderColor: catConfig.color,
								color: "#edf3f5",
								fontWeight: 600,
							}}
						>
							🏢 {service.operator}
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
						{service.name}
					</Title>
					{service.rollingStock && (
						<Text
							style={{ color: "#8ca0aa", fontSize: "0.8rem", display: "block" }}
						>
							🚆 Model:{" "}
							<span style={{ color: "#d9e2e6" }}>{service.rollingStock}</span>
						</Text>
					)}
				</div>
				<Button
					type="text"
					size="small"
					icon={<CloseOutlined style={{ color: "#edf3f5" }} />}
					onClick={onClose}
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
				Scheduled Calling Points
			</Text>

			<div style={{ marginTop: 12 }}>
				<Steps
					direction="vertical"
					size="small"
					current={activeState?.currentSegmentIndex ?? -1}
					items={service.calls.map((call, idx) => {
						const st = STATIONS_BY_ID.get(call.stationId);
						const timeStr =
							call.departureOffset !== null
								? formatTime(call.departureOffset)
								: formatTime(call.arrivalOffset);

						return {
							title: (
								<div
									style={{ display: "flex", justifyContent: "space-between" }}
								>
									<span style={{ color: "#edf3f5", fontWeight: 500 }}>
										{st?.name || call.stationId}
									</span>
									<span
										style={{ color: catConfig.color, fontFamily: "monospace" }}
									>
										{timeStr}
									</span>
								</div>
							),
							description: (
								<Text style={{ color: "#8ca0aa", fontSize: "0.75rem" }}>
									{idx === 0
										? "Origin Departure"
										: idx === service.calls.length - 1
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
