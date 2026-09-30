import {
	Badge,
	Button,
	Card,
	Divider,
	Group,
	Stepper,
	Text,
	Title,
} from "@mantine/core";
import { Clock, Landmark, Wrench, X } from "lucide-react";
import { STATIONS_BY_ID } from "../data/geography";
import { CATEGORIES } from "../data/types";
import { useThrottledSnapshots } from "../hooks";
import { railActions, railUiStores } from "../store";
import { palette } from "../theme";
import { formatTime } from "../utils";

export const ServiceDetails = () => {
	// Throttled: the live status line tracks at ~15 Hz, plenty for the panel.
	const [snap, derivedSnap] = useThrottledSnapshots(railUiStores);
	const { selectedService } = snap;
	const { activeTrains } = derivedSnap;

	if (!selectedService) return null;

	const catConfig = CATEGORIES[selectedService.category];
	const activeState =
		activeTrains.find((t) => t.service.id === selectedService.id) || null;

	return (
		<Card
			className="sr-glass sr-rise sr-scroll"
			padding="md"
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
					<Group gap={4} wrap="wrap">
						<Badge
							radius={6}
							tt="none"
							className="sr-num"
							style={{
								background: catConfig.color,
								color: palette.bgDeep,
								fontWeight: "bold",
							}}
						>
							{selectedService.serviceNumber}
						</Badge>
						<Badge
							radius={6}
							tt="none"
							style={{
								background: "var(--app-surface-2)",
								color: palette.text,
								fontWeight: 500,
							}}
						>
							<span
								style={{
									display: "inline-flex",
									alignItems: "center",
									gap: 5,
								}}
							>
								<Landmark size={12} style={{ color: catConfig.color }} />
								{selectedService.operator}
							</span>
						</Badge>
						<Badge
							radius={6}
							tt="none"
							variant="transparent"
							style={{
								color: palette.textMuted,
							}}
						>
							{catConfig.label}
						</Badge>
					</Group>
					<Title
						order={4}
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
							<Wrench size={13} />
							{selectedService.rollingStock}
						</Text>
					)}
				</div>
				<Button
					variant="subtle"
					size="sm"
					p={4}
					className="sr-press"
					aria-label="Close service details"
					onClick={() => railActions.setSelectedService(null)}
				>
					<X size={16} style={{ color: palette.text }} />
				</Button>
			</div>

			{activeState && (
				<div
					style={{
						background: "var(--app-surface-2)",
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

			<Divider style={{ borderColor: "var(--app-border)", margin: "12px 0" }} />

			<Text
				fw={600}
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
				<Stepper
					orientation="vertical"
					size="sm"
					active={Math.max(0, activeState?.currentSegmentIndex ?? -1)}
				>
					{selectedService.calls.map((call, idx) => {
						const st = STATIONS_BY_ID.get(call.stationId);
						const targetTime =
							call.departureOffset !== null
								? call.departureOffset
								: call.arrivalOffset;
						const timeStr = formatTime(targetTime);

						return (
							<Stepper.Step
								key={`${call.stationId}-${call.arrivalOffset ?? "x"}-${
									call.departureOffset ?? "x"
								}`}
								label={
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
												background: "var(--app-surface-2)",
												padding: "1px 7px",
												borderRadius: 4,
												fontSize: "0.76rem",
												display: "inline-flex",
												alignItems: "center",
												gap: 4,
											}}
										>
											<Clock size={12} />
											{timeStr}
										</span>
									</button>
								}
								description={
									<Text
										style={{ color: palette.textFaint, fontSize: "0.72rem" }}
									>
										{idx === 0
											? "Origin departure"
											: idx === selectedService.calls.length - 1
												? "Destination terminus"
												: "Calling point"}
									</Text>
								}
							/>
						);
					})}
				</Stepper>
			</div>
		</Card>
	);
};
