import { Crosshair, MapPin, MoveRight, ZoomIn, ZoomOut } from "lucide-react";
import type { Snapshot } from "valtio";
import { CATEGORIES } from "../data/types";
import type { ActiveTrainState } from "../engine/interpolator";
import { mapColors, palette } from "../theme";

/**
 * The floating chrome over the map: the boot overlay, the zoom cluster and the
 * hover tooltip. Each is a component in its own right because each has its own
 * condition and its own props — the canvas itself neither knows nor cares
 * whether a tooltip is showing.
 */

/** Covers the canvas until the first frame is painted. */
export const BootOverlay = ({ ready }: { ready: boolean }) => (
	<div
		aria-hidden={ready}
		style={{
			position: "absolute",
			inset: 0,
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			justifyContent: "center",
			gap: 10,
			background: mapColors.bg,
			pointerEvents: ready ? "none" : "auto",
			opacity: ready ? 0 : 1,
			transition: "opacity 0.4s var(--sr-ease)",
		}}
	>
		<span
			className="app-skeleton"
			style={{ width: 210, height: 10, maxWidth: "60vw" }}
		/>
		<span
			className="app-skeleton"
			style={{ width: 140, height: 10, maxWidth: "40vw" }}
		/>
		<span style={{ color: palette.textFaint, fontSize: "0.75rem" }}>
			Drawing the network
		</span>
	</div>
);

const NavButton = ({
	label,
	icon,
	onClick,
	accented,
}: {
	label: string;
	icon: React.ReactNode;
	onClick: () => void;
	accented?: boolean;
}) => (
	<button
		type="button"
		className="sr-press"
		onClick={onClick}
		aria-label={label}
		title={label}
		style={{
			background: accented ? palette.accentSoft : "var(--app-surface-2)",
			border: "none",
			borderRadius: 6,
			color: accented ? palette.accent : palette.text,
			width: 30,
			height: 30,
			cursor: "pointer",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
		}}
	>
		{icon}
	</button>
);

/** The three-button camera cluster: zoom in, zoom out, and back to the preset. */
export const MapNavControls = ({
	onZoomIn,
	onZoomOut,
	onResetView,
}: {
	onZoomIn: () => void;
	onZoomOut: () => void;
	onResetView: () => void;
}) => (
	<div
		className="sr-glass"
		style={{
			position: "absolute",
			bottom: 96,
			right: 20,
			zIndex: 15,
			display: "flex",
			flexDirection: "column",
			gap: 6,
			borderRadius: 8,
			padding: 4,
		}}
	>
		<NavButton label="Zoom in" icon={<ZoomIn size={16} />} onClick={onZoomIn} />
		<NavButton
			label="Zoom out"
			icon={<ZoomOut size={16} />}
			onClick={onZoomOut}
		/>
		<NavButton
			label="Reset view"
			icon={<Crosshair size={16} />}
			onClick={onResetView}
			accented
		/>
	</div>
);

/**
 * The hover tooltip. `nextStopName` is null on the last call of a service, so
 * the trailing line says "Destination" rather than rendering an empty gap.
 */
export const HoverTooltip = ({
	train,
	position,
}: {
	train: Snapshot<ActiveTrainState>;
	position: { x: number; y: number };
}) => {
	const accent = CATEGORIES[train.service.category].color;

	return (
		<div
			style={{
				position: "absolute",
				left: Math.min(window.innerWidth - 240, position.x + 14),
				top: Math.max(16, position.y - 45),
				zIndex: 25,
				pointerEvents: "none",
				background: "rgba(10, 20, 27, 0.95)",
				backdropFilter: "blur(8px)",
				border: `1px solid ${accent}`,
				borderRadius: 8,
				padding: "6px 10px",
				color: palette.text,
				fontSize: "0.8rem",
				boxShadow: "0 14px 30px -18px rgba(0,0,0,0.95)",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
				}}
			>
				<span
					className="sr-num"
					style={{
						color: accent,
						fontWeight: "bold",
					}}
				>
					{train.service.serviceNumber}
				</span>
				<span style={{ fontWeight: 600 }}>{train.service.name}</span>
			</div>
			<div
				style={{
					color: palette.textMuted,
					fontSize: "0.74rem",
					marginTop: 2,
					display: "flex",
					alignItems: "center",
					gap: 4,
				}}
			>
				{train.isDwelling ? (
					<>
						<MapPin size={13} style={{ color: accent }} />
						<span>At {train.currentStopName}</span>
					</>
				) : (
					<>
						<MoveRight size={13} />
						<span>Next: {train.nextStopName ?? "Destination"}</span>
					</>
				)}
			</div>
		</div>
	);
};
