import {
	BankOutlined,
	BuildOutlined,
	ClockCircleOutlined,
	CloseOutlined,
} from "@ant-design/icons";
import { Button, Card, Divider, Space, Steps, Tag, Typography } from "antd";
import { useSnapshot } from "valtio";
import { STATIONS_BY_ID } from "../data/geography";
import { CATEGORIES } from "../data/types";
import { derivedStore, railActions, railStore } from "../store";
import { palette } from "../theme";
import { formatTime } from "../utils";

const { Title, Text } = Typography;

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
			className="sr-glass sr-rise sr-scroll"
			style={{
				position: "absolute",
				top: 16,
				right: 16,
				width: 344,
				maxWidth: "calc(100vw - 32px)",
				maxHeight: "calc(100dvh - 180px)",
				overflowY: "auto",
				borderRadius: 12,
				color: palette.text,
				zIndex: 10,
			}}
			styles={{ body: { padding: 16 } }}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
					marginBottom: 12,
				}}
			>
				<div style={{ minWidth: 0 }}>
					<Space wrap size={[4, 6]}>
						<Tag
							bordered={false}
							style={{
								background: catConfig.color,
								color: palette.bgDeep,
								fontWeight: "bold",
								borderRadius: 6,
							}}
							className="sr-num"
						>
							{selectedService.serviceNumber}
						</Tag>
						<Tag
							bordered={false}
							style={{
								background: "rgba(255,255,255,0.06)",
								color: palette.text,
								fontWeight: 500,
								borderRadius: 6,
								display: "inline-flex",
								alignItems: "center",
								gap: 5,
							}}
						>
							<BankOutlined style={{ color: catConfig.color }} />
							{selectedService.operator}
						</Tag>
						<Tag
							bordered={false}
							style={{
								background: "transparent",
								color: palette.textMuted,
							}}
						>
							{catConfig.label}
						</Tag>
					</Space>
					<Title
						level={4}
						style={{
							color: palette.text,
							margin: "10px 0 4px 0",
							letterSpacing: "-0.01em",
						}}
					>
						{selectedService.name}
					</Title>
					{selectedService.rollingStock && (
						<Text
							style={{
								color: palette.textMuted,
								fontSize: "0.78rem",
								display: "flex",
								alignItems: "center",
								gap: 5,
							}}
						>
							<BuildOutlined />
							{selectedService.rollingStock}
						</Text>
					)}
				</div>
				<Button
					type="text"
					size="small"
					className="sr-press"
					aria-label="Close service details"
					icon={<CloseOutlined style={{ color: palette.text }} />}
					onClick={() => railActions.setSelectedService(null)}
				/>
			</div>

			{activeState && (
				<div
					style={{
						background: "rgba(255,255,255,0.04)",
						borderLeft: `2px solid ${catConfig.color}`,
						borderRadius: 6,
						padding: "8px 12px",
						marginBottom: 16,
					}}
				>
					<Text style={{ color: palette.textMuted, fontSize: "0.8rem" }}>
						Live status
					</Text>
					<div style={{ fontWeight: 600, color: catConfig.color }}>
						{activeState.isDwelling
							? `Dwelling at ${activeState.currentStopName}`
							: `In transit to ${activeState.nextStopName || "Terminus"}`}
					</div>
				</div>
			)}

			<Divider
				style={{ borderColor: "rgba(255,255,255,0.12)", margin: "12px 0" }}
			/>

			<Text
				strong
				style={{
					color: palette.textMuted,
					fontSize: "0.78rem",
					textTransform: "uppercase",
					letterSpacing: "0.06em",
				}}
			>
				Calling points
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
									className="sr-callpoint"
									onClick={() => {
										if (targetTime !== null) {
											railActions.setTimeOffset(targetTime);
										}
									}}
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										gap: 8,
										cursor: "pointer",
										padding: "3px 6px",
										borderRadius: 6,
										width: "100%",
										background: "transparent",
										border: "none",
										textAlign: "left",
									}}
								>
									<span
										style={{
											color: palette.text,
											fontWeight: 500,
											fontSize: "0.82rem",
										}}
									>
										{st?.name || call.stationId}
									</span>
									<span
										className="sr-num"
										style={{
											color: catConfig.color,
											background: "rgba(255, 255, 255, 0.05)",
											padding: "1px 7px",
											borderRadius: 4,
											fontSize: "0.76rem",
											display: "inline-flex",
											alignItems: "center",
											gap: 4,
										}}
									>
										<ClockCircleOutlined />
										{timeStr}
									</span>
								</button>
							),
							description: (
								<Text style={{ color: palette.textFaint, fontSize: "0.72rem" }}>
									{idx === 0
										? "Origin departure"
										: idx === selectedService.calls.length - 1
											? "Destination terminus"
											: "Calling point"}
								</Text>
							),
						};
					})}
				/>
			</div>
		</Card>
	);
};
