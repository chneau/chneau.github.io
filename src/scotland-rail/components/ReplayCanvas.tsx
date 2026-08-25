import { useEffect, useRef, useState } from "react";
import { COASTLINES, RAIL_PATHS, STATIONS } from "../data/geography";
import {
	CATEGORIES,
	type TrainService,
	VIEW_BOUNDS,
	type ViewPreset,
} from "../data/types";
import type { ActiveTrainState } from "../engine/interpolator";
import { createProjection } from "../engine/projection";

type ReplayCanvasProps = {
	viewPreset: ViewPreset;
	selectedServiceId: string | null;
	hoveredServiceId: string | null;
	onSelectService: (service: TrainService | null) => void;
	onHoverService: (serviceId: string | null) => void;
	services: TrainService[];
	activeTrains: ActiveTrainState[];
};

export const ReplayCanvas = ({
	viewPreset,
	selectedServiceId,
	hoveredServiceId,
	onSelectService,
	onHoverService,
	services,
	activeTrains,
}: ReplayCanvasProps) => {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);

	// Interactive Zoom and Pan state
	const [zoom, setZoom] = useState<number>(1);
	const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
	const isDraggingRef = useRef<boolean>(false);
	const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

	// Reset zoom and pan when preset changes
	useEffect(() => {
		setZoom(1);
		setPan({ x: 0, y: 0 });
	}, []);

	// Cache static layer whenever viewPreset, zoom, or pan changes
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const width = rect.width || 800;
		const height = rect.height || 600;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);

		canvas.width = width * dpr;
		canvas.height = height * dpr;

		if (!staticCanvasRef.current) {
			staticCanvasRef.current = document.createElement("canvas");
		}
		const staticCanvas = staticCanvasRef.current;
		staticCanvas.width = width * dpr;
		staticCanvas.height = height * dpr;

		const sCtx = staticCanvas.getContext("2d");
		if (!sCtx) return;

		sCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
		sCtx.clearRect(0, 0, width, height);

		// Background: Deep marine dark tone
		sCtx.fillStyle = "#07131b";
		sCtx.fillRect(0, 0, width, height);

		const bounds = VIEW_BOUNDS[viewPreset];
		const proj = createProjection(bounds, width, height, 32, zoom, pan);

		// 1. Coastlines (Land fill with subtle lighting & crisp boundary stroke)
		sCtx.fillStyle = "#0d222f";
		sCtx.strokeStyle = "#436577";
		sCtx.lineWidth = 1.6;
		sCtx.lineJoin = "round";
		for (const coast of COASTLINES) {
			sCtx.beginPath();
			coast.forEach((pt, i) => {
				const { x, y } = proj.project(pt);
				if (i === 0) sCtx.moveTo(x, y);
				else sCtx.lineTo(x, y);
			});
			sCtx.closePath();
			sCtx.fill();
			sCtx.stroke();
		}

		// 2. Rail Paths (Two-layer track rendering: subtle background glow + crisp track line)
		// Track glow/bed
		sCtx.strokeStyle = "#1b3342";
		sCtx.lineWidth = 3.5;
		sCtx.lineCap = "round";
		sCtx.lineJoin = "round";
		for (const rail of RAIL_PATHS) {
			sCtx.beginPath();
			rail.coordinates.forEach((pt, i) => {
				const { x, y } = proj.project(pt);
				if (i === 0) sCtx.moveTo(x, y);
				else sCtx.lineTo(x, y);
			});
			sCtx.stroke();
		}

		// Track line
		sCtx.strokeStyle = "#4d7388";
		sCtx.lineWidth = 1.5;
		for (const rail of RAIL_PATHS) {
			sCtx.beginPath();
			rail.coordinates.forEach((pt, i) => {
				const { x, y } = proj.project(pt);
				if (i === 0) sCtx.moveTo(x, y);
				else sCtx.lineTo(x, y);
			});
			sCtx.stroke();
		}

		// 3. Stations & Labels
		for (const st of STATIONS) {
			const { x, y } = proj.project(st.coordinate);
			if (x < -30 || x > width + 30 || y < -30 || y > height + 30) continue;

			// Station Halo
			if (st.isMajor) {
				sCtx.fillStyle = "rgba(89, 215, 255, 0.15)";
				sCtx.beginPath();
				sCtx.arc(x, y, 7, 0, Math.PI * 2);
				sCtx.fill();
			}

			// Station dot
			sCtx.fillStyle = st.isMajor ? "#ffffff" : "#98b1be";
			sCtx.strokeStyle = "#07131b";
			sCtx.lineWidth = 1;
			sCtx.beginPath();
			sCtx.arc(x, y, st.isMajor ? 3.5 : 2.2, 0, Math.PI * 2);
			sCtx.fill();
			sCtx.stroke();

			// Station Label
			if (st.isMajor || viewPreset !== "scotland" || zoom > 1.2) {
				sCtx.font = st.isMajor
					? "bold 11px system-ui, -apple-system, sans-serif"
					: "500 9.5px system-ui, -apple-system, sans-serif";
				sCtx.fillStyle = st.isMajor ? "#edf3f5" : "#a8b5bc";

				// Shadow for readability
				sCtx.shadowColor = "rgba(7, 19, 27, 0.9)";
				sCtx.shadowBlur = 4;
				sCtx.fillText(st.name, x + 6, y + 3.5);
				sCtx.shadowBlur = 0;
			}
		}
	}, [viewPreset, zoom, pan]);

	// Render dynamic frame (Trains, Trails, Selected Route)
	useEffect(() => {
		const canvas = canvasRef.current;
		const staticCanvas = staticCanvasRef.current;
		if (!canvas || !staticCanvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const width = canvas.width / dpr;
		const height = canvas.height / dpr;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(staticCanvas, 0, 0, width, height);

		const bounds = VIEW_BOUNDS[viewPreset];
		const proj = createProjection(bounds, width, height, 32, zoom, pan);

		// 1. Draw Selected Service Full Route
		if (selectedServiceId) {
			const selectedService = services.find((s) => s.id === selectedServiceId);
			if (selectedService) {
				const catConfig = CATEGORIES[selectedService.category];
				ctx.save();
				ctx.strokeStyle = catConfig.color;
				ctx.lineWidth = 3.5;
				ctx.globalAlpha = 0.9;
				ctx.beginPath();
				selectedService.pathCoordinates.forEach((pt, i) => {
					const { x, y } = proj.project(pt);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				});
				ctx.stroke();
				ctx.restore();
			}
		}

		// 2. Draw Active Trains & Trails
		for (const train of activeTrains) {
			const isSelected = train.service.id === selectedServiceId;
			const isHovered = train.service.id === hoveredServiceId;
			const catConfig = CATEGORIES[train.service.category];
			const { x, y } = proj.project(train.position);

			// Directional Glow Trail
			if (train.previousPosition && !train.isDwelling) {
				const prev = proj.project(train.previousPosition);
				ctx.save();
				const grad = ctx.createLinearGradient(prev.x, prev.y, x, y);
				grad.addColorStop(0, "rgba(0,0,0,0)");
				grad.addColorStop(1, catConfig.color);
				ctx.strokeStyle = grad;
				ctx.lineWidth = 2.5;
				ctx.globalAlpha = 0.7;
				ctx.beginPath();
				ctx.moveTo(prev.x, prev.y);
				ctx.lineTo(x, y);
				ctx.stroke();
				ctx.restore();
			}

			// Draw Train Marker
			ctx.save();
			ctx.fillStyle = catConfig.color;
			ctx.strokeStyle = "#07131b";
			ctx.lineWidth = 1.5;

			const size = isSelected || isHovered ? 6.5 : 4.5;

			// Outer ring for highlight
			if (isSelected || isHovered) {
				ctx.strokeStyle = "#ffffff";
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.arc(x, y, size + 3, 0, Math.PI * 2);
				ctx.stroke();
			}

			// Shape
			ctx.beginPath();
			switch (catConfig.shape) {
				case "circle":
					ctx.arc(x, y, size, 0, Math.PI * 2);
					break;
				case "diamond":
					ctx.moveTo(x, y - size);
					ctx.lineTo(x + size, y);
					ctx.lineTo(x, y + size);
					ctx.lineTo(x - size, y);
					ctx.closePath();
					break;
				case "square":
					ctx.rect(x - size, y - size, size * 2, size * 2);
					break;
				case "triangle":
					ctx.moveTo(x, y - size * 1.2);
					ctx.lineTo(x + size, y + size * 0.8);
					ctx.lineTo(x - size, y + size * 0.8);
					ctx.closePath();
					break;
				case "hexagon":
					for (let i = 0; i < 6; i++) {
						const ang = (Math.PI / 3) * i - Math.PI / 6;
						const px = x + Math.cos(ang) * size;
						const py = y + Math.sin(ang) * size;
						if (i === 0) ctx.moveTo(px, py);
						else ctx.lineTo(px, py);
					}
					ctx.closePath();
					break;
			}
			ctx.fill();
			ctx.stroke();
			ctx.restore();
		}
	}, [
		activeTrains,
		selectedServiceId,
		hoveredServiceId,
		viewPreset,
		services,
		zoom,
		pan,
	]);

	// Mouse Wheel Zoom
	const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
		e.preventDefault();
		const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
		setZoom((prev) => {
			const nextZoom = Math.min(8, Math.max(0.6, prev * zoomFactor));
			return nextZoom;
		});
	};

	// Mouse Drag to Pan
	const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (e.button === 0) {
			isDraggingRef.current = true;
			lastMousePosRef.current = { x: e.clientX, y: e.clientY };
		}
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (isDraggingRef.current) {
			const dx = e.clientX - lastMousePosRef.current.x;
			const dy = e.clientY - lastMousePosRef.current.y;
			lastMousePosRef.current = { x: e.clientX, y: e.clientY };
			setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
		}
	};

	const handleMouseUp = () => {
		isDraggingRef.current = false;
	};

	// Mouse Interaction (Click & Hover)
	const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		const bounds = VIEW_BOUNDS[viewPreset];
		const proj = createProjection(
			bounds,
			rect.width,
			rect.height,
			32,
			zoom,
			pan,
		);

		// Find nearest active train
		let closestId: string | null = null;
		let minDist = 16; // pixel threshold

		for (const train of activeTrains) {
			const { x, y } = proj.project(train.position);
			const dist = Math.hypot(x - mouseX, y - mouseY);
			if (dist < minDist) {
				minDist = dist;
				closestId = train.service.id;
			}
		}

		onHoverService(closestId);
	};

	const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		const bounds = VIEW_BOUNDS[viewPreset];
		const proj = createProjection(
			bounds,
			rect.width,
			rect.height,
			32,
			zoom,
			pan,
		);

		let closestService: TrainService | null = null;
		let minDist = 18;

		for (const train of activeTrains) {
			const { x, y } = proj.project(train.position);
			const dist = Math.hypot(x - mouseX, y - mouseY);
			if (dist < minDist) {
				minDist = dist;
				closestService = train.service;
			}
		}

		onSelectService(closestService);
	};

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
				onWheel={handleWheel}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onPointerMove={handlePointerMove}
				onPointerLeave={() => {
					isDraggingRef.current = false;
					onHoverService(null);
				}}
				onClick={handleClick}
				style={{
					display: "block",
					width: "100%",
					height: "100%",
					cursor: hoveredServiceId ? "pointer" : "grab",
				}}
			/>
		</div>
	);
};
