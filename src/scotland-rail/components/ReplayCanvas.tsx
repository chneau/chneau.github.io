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

/**
 * The map surface: one canvas, two layers, one camera.
 *
 * The drawing is in `engine/mapLayers` and the gestures are in
 * `mapInteraction`; what remains here is what can only live on the canvas
 * element — the two subscriptions, the resize observer, the effects that
 * schedule each layer's paint, the throttled live-region summary, and the
 * camera-follow pass.
 *
 * The static layer is baked to an offscreen canvas and blitted, so panning costs
 * one `drawImage` rather than re-projecting every coastline, loch and station
 * label. The bake is quantized to `STATIC_GRID`: as long as the live pan stays
 * within one grid cell the cached bitmap is reused, and `STATIC_MARGIN` of slack
 * around the viewport hides the cell boundary.
 */

/** Minimum gap between aggregate live-region announcements, in milliseconds. */
const ANNOUNCE_INTERVAL_MS = 2500;

export const ReplayCanvas = () => {
	// Raw snapshot on purpose: the map must animate at 60 fps. The HUD surfaces
	// use the throttled hook instead.
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

	// Screen-reader summary so the map is not a pointer-only surface. Building
	// it every frame would flood assistive tech, so announcements are throttled
	// (a train selection reports immediately; aggregate updates wait).
	const [liveMessage, setLiveMessage] = useState("");
	const lastAnnounceRef = useRef(0);
	const lastAnnouncedSelectionRef = useRef<string | null>(null);

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	// Created while rendering, not lazily inside the bake effect: the
	// dynamic-frame effect draws from this canvas, so a ref the bake happened
	// to fill first would make the two effects order-dependent for no reason.
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
	// Created while rendering, like the offscreen canvas above: the drag
	// bookkeeping has to exist before the first gesture, and `useRef` would run
	// its argument on every render for a value it then discards.
	const [interaction] = useState(createInteractionState);
	const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
		null,
	);

	// Quantized pan used as the static-layer cache key. Staying on the grid for
	// small movements means the bitmap is not re-baked each pan frame.
	const bakeX = Math.round(pan.x / STATIC_GRID) * STATIC_GRID;
	const bakeY = Math.round(pan.y / STATIC_GRID) * STATIC_GRID;

	// Quantize time offset to 2-minute increments for the static layer.
	const quantizedTime = Math.floor(timeOffset / 2) * 2;

	// Dimensions via ResizeObserver
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

	// Publish the screen-reader summary at a human cadence. A change of selected
	// service is announced straight away; otherwise at most one update per
	// ANNOUNCE_INTERVAL_MS so 15x playback does not flood the live region.
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

	// Bake the static layer only when the transform/settings actually change.
	// `pan` is deliberately absent from the deps: panning just translates the
	// cached bitmap in the draw effect below.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !staticCanvas) return;

		const width = dimensions.width;
		const height = dimensions.height;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);

		// Assigning `canvas.width` clears the canvas and reallocates the backing
		// store, so only do it when the size genuinely changed.
		const backingWidth = Math.round(width * dpr);
		const backingHeight = Math.round(height * dpr);
		if (canvas.width !== backingWidth) canvas.width = backingWidth;
		if (canvas.height !== backingHeight) canvas.height = backingHeight;

		// One extra grid cell of slack on every side so translating the bitmap
		// to follow the live pan never exposes an unpainted edge.
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

	// Render dynamic frame
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

	// Native wheel listener so preventDefault() is honoured (React's onWheel is
	// passive, so the page would scroll instead of zooming).
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

			{/* Non-visual equivalent of the map. Throttled so high-speed playback
			    does not flood the live region. */}
			<p className="sr-only" aria-live="polite" aria-atomic="true">
				{liveMessage}
			</p>

			<BootOverlay ready={ready} />

			{/* Floating Map Navigation Controls */}
			<MapNavControls
				onZoomIn={() => setZoom(BUTTON_ZOOM_IN)}
				onZoomOut={() => setZoom(BUTTON_ZOOM_OUT)}
				onResetView={() => {
					setZoom(1);
					setPan({ x: 0, y: 0 });
				}}
			/>

			{/* Floating Hover HUD Tooltip */}
			{hoveredTrain && hoverPos && (
				<HoverTooltip train={hoveredTrain} position={hoverPos} />
			)}
		</div>
	);
};
