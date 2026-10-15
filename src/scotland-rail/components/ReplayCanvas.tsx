import { useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { prefersReducedMotion } from "../../shared";
import { useMapCamera } from "../camera";
import {
	bakeStaticLayer,
	drawDynamicLayer,
	STATIC_GRID,
	STATIC_MARGIN,
} from "../engine/mapLayers";
import { describeNetwork } from "../liveRegion";
import {
	BUTTON_ZOOM_IN,
	BUTTON_ZOOM_OUT,
	createInteractionState,
	createMapHandlers,
} from "../mapInteraction";
import { derivedStore, railStore } from "../store";
import { BootOverlay, HoverTooltip, MapNavControls } from "./map-overlays";

const ANNOUNCE_INTERVAL_MS = 10000;

export const ReplayCanvas = () => {
	const snap = useSnapshot(railStore);
	const derivedSnap = useSnapshot(derivedStore);

	const {
		viewPreset,
		selectedService,
		hoveredServiceId,
		timeOffset,
		settings,
	} = snap;
	const { filteredServices, activeTrains } = derivedSnap;
	const selectedServiceId = selectedService?.id ?? null;
	const reducedMotion = prefersReducedMotion();

	const [liveMessage, setLiveMessage] = useState("");
	const lastAnnounceRef = useRef(0);
	const lastAnnouncedSelectionRef = useRef<string | null>(null);

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [staticCanvas] = useState<HTMLCanvasElement | null>(() =>
		typeof document === "undefined" ? null : document.createElement("canvas"),
	);

	const { zoom, pan, setZoom, setPan } = useMapCamera({
		viewPreset,
		canvasRef,
		follow: {
			enabled: settings.cameraFollowTrain,
			position:
				selectedServiceId === null
					? null
					: (activeTrains.find((t) => t.service.id === selectedServiceId)
							?.position ?? null),
		},
	});
	const [ready, setReady] = useState(false);
	const [interaction] = useState(createInteractionState);
	const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
		null,
	);

	const bakeX = Math.round(pan.x / STATIC_GRID) * STATIC_GRID;
	const bakeY = Math.round(pan.y / STATIC_GRID) * STATIC_GRID;

	const quantizedTime = Math.floor(timeOffset / 2) * 2;

	const [dimensions, setDimensions] = useState<{
		width: number;
		height: number;
	}>({
		width: 800,
		height: 600,
	});

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const cr = entry.contentRect;
				if (cr.width > 0 && cr.height > 0) {
					setDimensions({ width: cr.width, height: cr.height });
				}
			}
		});

		ro.observe(canvas);
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		const selectionChanged =
			lastAnnouncedSelectionRef.current !== selectedServiceId;
		const now = performance.now();
		if (
			!selectionChanged &&
			now - lastAnnounceRef.current < ANNOUNCE_INTERVAL_MS
		) {
			return;
		}
		lastAnnounceRef.current = now;
		lastAnnouncedSelectionRef.current = selectedServiceId;
		setLiveMessage(describeNetwork(activeTrains, selectedServiceId));
	}, [activeTrains, selectedServiceId]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !staticCanvas) return;

		const width = dimensions.width;
		const height = dimensions.height;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);

		const backingWidth = Math.round(width * dpr);
		const backingHeight = Math.round(height * dpr);
		if (canvas.width !== backingWidth) canvas.width = backingWidth;
		if (canvas.height !== backingHeight) canvas.height = backingHeight;

		const bakeWidth = width + STATIC_MARGIN * 2;
		const bakeHeight = height + STATIC_MARGIN * 2;
		staticCanvas.width = Math.round(bakeWidth * dpr);
		staticCanvas.height = Math.round(bakeHeight * dpr);

		const sCtx = staticCanvas.getContext("2d");
		if (!sCtx) return;

		bakeStaticLayer(sCtx, {
			width,
			height,
			quantisedTime: quantizedTime,
			settings,
			viewPreset,
			zoom,
			bakeX,
			bakeY,
		});
	}, [
		viewPreset,
		zoom,
		bakeX,
		bakeY,
		quantizedTime,
		settings,
		dimensions,
		staticCanvas,
	]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !staticCanvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const width = canvas.width / dpr;
		const height = canvas.height / dpr;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		drawDynamicLayer(ctx, {
			staticCanvas,
			width,
			height,
			pan,
			bakeX,
			bakeY,
			viewPreset,
			zoom,
			timeOffset,
			settings,
			reducedMotion,
			selectedServiceId,
			hoveredServiceId,
			filteredServices,
			activeTrains,
		});

		setReady(true);
	}, [
		activeTrains,
		selectedServiceId,
		hoveredServiceId,
		viewPreset,
		filteredServices,
		zoom,
		pan,
		bakeX,
		bakeY,
		timeOffset,
		settings,
		reducedMotion,
		staticCanvas,
	]);

	const handlers = createMapHandlers({
		canvasRef,
		state: interaction,
		viewPreset,
		zoom,
		pan,
		activeTrains,
		selectedServiceId,
		setZoom,
		setPan,
		onHoverPos: setHoverPos,
	});

	const hoveredTrain = hoveredServiceId
		? activeTrains.find((train) => train.service.id === hoveredServiceId)
		: null;

	return (
		<div
			style={{
				position: "relative",
				width: "100%",
				height: "100%",
				overflow: "hidden",
			}}
		>
			<canvas
				ref={canvasRef}
				role="img"
				tabIndex={0}
				aria-label="Map of Scotland showing live train positions and rail network. Press N or P to select the next or previous running train."
				aria-keyshortcuts="N P"
				{...handlers}
				style={{
					display: "block",
					width: "100%",
					height: "100%",
					cursor: hoveredServiceId ? "pointer" : "grab",
				}}
			/>

			<p className="sr-only" aria-live="polite" aria-atomic="true">
				{liveMessage}
			</p>

			<BootOverlay ready={ready} />

			<MapNavControls
				onZoomIn={() => setZoom(BUTTON_ZOOM_IN)}
				onZoomOut={() => setZoom(BUTTON_ZOOM_OUT)}
				onResetView={() => {
					setZoom(1);
					setPan({ x: 0, y: 0 });
				}}
			/>

			{hoveredTrain && hoverPos && (
				<HoverTooltip train={hoveredTrain} position={hoverPos} />
			)}
		</div>
	);
};
