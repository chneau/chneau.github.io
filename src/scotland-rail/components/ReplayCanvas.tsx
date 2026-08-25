import { useEffect, useRef, useState } from "react";
import {
	COASTLINES,
	LANDMARKS,
	LOCHS,
	RAIL_PATHS,
	STATIONS,
} from "../data/geography";
import {
	type AppSettings,
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
	timeOffset: number;
	settings: AppSettings;
	onSelectService: (service: TrainService | null) => void;
	onHoverService: (serviceId: string | null) => void;
	services: TrainService[];
	activeTrains: ActiveTrainState[];
};

// Calculate atmospheric day/night colors based on time offset (00:00 to 24:00)
const getDayNightAtmosphere = (
	timeOffset: number,
	enabled: boolean,
): {
	bgColor: string;
	landColor: string;
	coastColor: string;
	isNight: boolean;
	lightFactor: number;
} => {
	if (!enabled) {
		return {
			bgColor: "#07131b",
			landColor: "#0d222f",
			coastColor: "#436577",
			isNight: false,
			lightFactor: 1,
		};
	}

	const hours = (timeOffset / 60) % 24;

	// Sunrise: 05:30 - 08:30 (peak golden dawn at 06:30)
	// Daytime: 08:30 - 18:00
	// Sunset: 18:00 - 21:30 (twilight dusk)
	// Night: 21:30 - 05:30
	if (hours >= 8.5 && hours <= 18) {
		// Full day
		return {
			bgColor: "#091724",
			landColor: "#0f2c3e",
			coastColor: "#567c92",
			isNight: false,
			lightFactor: 1,
		};
	}
	if (hours >= 5.5 && hours < 8.5) {
		// Dawn / Sunrise transition
		return {
			bgColor: "#141525",
			landColor: "#1d2538",
			coastColor: "#7e6d87",
			isNight: false,
			lightFactor: 0.7,
		};
	}
	if (hours > 18 && hours <= 21.5) {
		// Sunset / Twilight transition
		return {
			bgColor: "#121422",
			landColor: "#1b2033",
			coastColor: "#6f5b7d",
			isNight: true,
			lightFactor: 0.6,
		};
	}
	// Deep Night
	return {
		bgColor: "#040b10",
		landColor: "#081620",
		coastColor: "#283f4d",
		isNight: true,
		lightFactor: 0.3,
	};
};

export const ReplayCanvas = ({
	viewPreset,
	selectedServiceId,
	hoveredServiceId,
	timeOffset,
	settings,
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

	// Camera Follow Selected Train
	useEffect(() => {
		if (!settings.cameraFollowTrain || !selectedServiceId) return;
		const activeSelected = activeTrains.find(
			(t) => t.service.id === selectedServiceId,
		);
		if (!activeSelected) return;

		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const bounds = VIEW_BOUNDS[viewPreset];
		const proj = createProjection(bounds, rect.width, rect.height, 32, zoom, {
			x: 0,
			y: 0,
		});
		const trainScreen = proj.project(activeSelected.position);

		const targetPanX = rect.width / 2 - trainScreen.x;
		const targetPanY = rect.height / 2 - trainScreen.y;

		// Smooth ease toward train
		setPan((prev) => ({
			x: prev.x + (targetPanX - prev.x) * 0.15,
			y: prev.y + (targetPanY - prev.y) * 0.15,
		}));
	}, [
		selectedServiceId,
		activeTrains,
		settings.cameraFollowTrain,
		viewPreset,
		zoom,
	]);

	// Quantize time offset to 2-minute increments for static layer (day/night sky/lights) to avoid invalidating static layer every frame
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

	// Cache static layer whenever viewPreset, zoom, pan, settings, or quantized time of day changes
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const width = dimensions.width;
		const height = dimensions.height;
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

		const atmo = getDayNightAtmosphere(quantizedTime, settings.dayNightCycle);

		// Background
		sCtx.fillStyle = atmo.bgColor;
		sCtx.fillRect(0, 0, width, height);

		const bounds = VIEW_BOUNDS[viewPreset];
		const proj = createProjection(bounds, width, height, 32, zoom, pan);

		// 1. Coastlines (Land fill with subtle lighting & crisp boundary stroke)
		sCtx.fillStyle = atmo.landColor;
		sCtx.strokeStyle = atmo.coastColor;
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

		// 2. Scottish Lochs (Water bodies inside land)
		if (settings.showLochs) {
			sCtx.fillStyle = atmo.bgColor;
			sCtx.strokeStyle = atmo.coastColor;
			sCtx.lineWidth = 1.2;
			for (const loch of LOCHS) {
				sCtx.beginPath();
				loch.coordinates.forEach((pt, i) => {
					const { x, y } = proj.project(pt);
					if (i === 0) sCtx.moveTo(x, y);
					else sCtx.lineTo(x, y);
				});
				sCtx.closePath();
				sCtx.fill();
				sCtx.stroke();

				// Loch label if zoomed in
				if (zoom > 1.3) {
					const midPt = loch.coordinates[0];
					if (midPt) {
						const { x, y } = proj.project(midPt);
						sCtx.font = "italic 9px system-ui, sans-serif";
						sCtx.fillStyle = "#6b8d9e";
						sCtx.fillText(loch.name, x - 12, y - 6);
					}
				}
			}
		}

		// 3. Rail Paths (Two-layer track rendering: subtle background glow + crisp track line)
		// Track glow/bed
		sCtx.strokeStyle = settings.congestionHeatmap
			? "rgba(255, 100, 50, 0.35)"
			: "#1b3342";
		sCtx.lineWidth = settings.congestionHeatmap ? 4.5 : 3.5;
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
		sCtx.strokeStyle = settings.congestionHeatmap ? "#ff7b47" : "#4d7388";
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

		// 4. City Night Lights (Ambient urban glow in dark hours)
		if (settings.cityLights && atmo.isNight) {
			const majorCities = [
				{ name: "Glasgow", coord: [-4.258, 55.859] as [number, number], r: 35 },
				{
					name: "Edinburgh",
					coord: [-3.189, 55.952] as [number, number],
					r: 30,
				},
				{ name: "Dundee", coord: [-2.973, 56.457] as [number, number], r: 18 },
				{
					name: "Aberdeen",
					coord: [-2.098, 57.143] as [number, number],
					r: 22,
				},
			];

			for (const city of majorCities) {
				const { x, y } = proj.project(city.coord);
				const grad = sCtx.createRadialGradient(x, y, 2, x, y, city.r * zoom);
				grad.addColorStop(0, "rgba(255, 205, 110, 0.4)");
				grad.addColorStop(0.5, "rgba(255, 180, 80, 0.15)");
				grad.addColorStop(1, "rgba(255, 160, 50, 0)");
				sCtx.fillStyle = grad;
				sCtx.beginPath();
				sCtx.arc(x, y, city.r * zoom, 0, Math.PI * 2);
				sCtx.fill();
			}
		}

		// 5. Scenic Landmarks & Viaducts
		if (settings.showLandmarks) {
			for (const lm of LANDMARKS) {
				const { x, y } = proj.project(lm.coordinate);
				if (x < -20 || x > width + 20 || y < -20 || y > height + 20) continue;

				sCtx.font = "12px sans-serif";
				sCtx.fillText(lm.icon, x - 6, y + 4);

				if (zoom > 1.2 || viewPreset !== "scotland") {
					sCtx.font = "bold 9.5px system-ui, sans-serif";
					sCtx.fillStyle = "#ffba63";
					sCtx.shadowColor = "rgba(0,0,0,0.85)";
					sCtx.shadowBlur = 4;
					sCtx.fillText(lm.name, x + 10, y + 3);
					sCtx.shadowBlur = 0;
				}
			}
		}

		// 6. Stations & Labels
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
	}, [viewPreset, zoom, pan, quantizedTime, settings, dimensions]);

	// Render dynamic frame (Trains, Trails, Weather, Selected Route)
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

		// 1. Highland Weather / Rain Effect
		if (settings.weatherEffects) {
			ctx.save();
			ctx.strokeStyle = "rgba(180, 215, 240, 0.18)";
			ctx.lineWidth = 1;
			const timeSec = performance.now() / 1000;
			for (let i = 0; i < 45; i++) {
				const seedX = (Math.sin(i * 12.9898) * 43758.5453) % 1;
				const seedY = (Math.cos(i * 78.233) * 43758.5453) % 1;
				const rx = (seedX * width + timeSec * 60) % width;
				const ry = (seedY * height + timeSec * 140) % height;
				ctx.beginPath();
				ctx.moveTo(rx, ry);
				ctx.lineTo(rx - 3, ry + 10);
				ctx.stroke();
			}
			ctx.restore();
		}

		// 2. Draw Selected Service Full Route
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

		// 3. Draw Active Trains & Trails
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

			// Headlight beam (Night & Dusk effect)
			const atmo = getDayNightAtmosphere(timeOffset, settings.dayNightCycle);
			if (
				settings.trainHeadlights &&
				atmo.isNight &&
				!train.isDwelling &&
				train.previousPosition
			) {
				const prevScreen = proj.project(train.previousPosition);
				const dx = x - prevScreen.x;
				const dy = y - prevScreen.y;
				const screenHeading = Math.atan2(dy, dx);

				if (Math.hypot(dx, dy) > 0.001) {
					ctx.save();
					ctx.translate(x, y);
					ctx.rotate(screenHeading);

					const beamGrad = ctx.createRadialGradient(0, 0, 2, 28, 0, 36);
					beamGrad.addColorStop(0, "rgba(255, 250, 190, 0.65)");
					beamGrad.addColorStop(0.5, "rgba(255, 235, 140, 0.25)");
					beamGrad.addColorStop(1, "rgba(255, 220, 90, 0)");

					ctx.fillStyle = beamGrad;
					ctx.beginPath();
					ctx.moveTo(0, 0);
					ctx.lineTo(36, -11);
					ctx.lineTo(36, 11);
					ctx.closePath();
					ctx.fill();
					ctx.restore();
				}
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
		timeOffset,
		settings,
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

	// Touch Support (Drag & Pinch Zoom)
	const touchStartDistRef = useRef<number | null>(null);
	const initialTouchZoomRef = useRef<number>(1);

	const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
		if (e.touches.length === 1 && e.touches[0]) {
			isDraggingRef.current = true;
			lastMousePosRef.current = {
				x: e.touches[0].clientX,
				y: e.touches[0].clientY,
			};
		} else if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
			isDraggingRef.current = false;
			const dist = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY,
			);
			touchStartDistRef.current = dist;
			initialTouchZoomRef.current = zoom;
		}
	};

	const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
		if (e.touches.length === 1 && isDraggingRef.current && e.touches[0]) {
			const dx = e.touches[0].clientX - lastMousePosRef.current.x;
			const dy = e.touches[0].clientY - lastMousePosRef.current.y;
			lastMousePosRef.current = {
				x: e.touches[0].clientX,
				y: e.touches[0].clientY,
			};
			setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
		} else if (
			e.touches.length === 2 &&
			touchStartDistRef.current &&
			e.touches[0] &&
			e.touches[1]
		) {
			const dist = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY,
			);
			const factor = dist / touchStartDistRef.current;
			setZoom(Math.min(8, Math.max(0.6, initialTouchZoomRef.current * factor)));
		}
	};

	const handleTouchEnd = () => {
		isDraggingRef.current = false;
		touchStartDistRef.current = null;
	};

	// Mouse Interaction & Hover Tooltip
	const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
		null,
	);
	const hoveredTrain = hoveredServiceId
		? activeTrains.find((t) => t.service.id === hoveredServiceId)
		: null;

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

		// Find nearest active train with bounding box pre-filter
		let closestId: string | null = null;
		let minDist = 18;

		for (const train of activeTrains) {
			const { x, y } = proj.project(train.position);
			if (Math.abs(x - mouseX) > minDist || Math.abs(y - mouseY) > minDist) {
				continue;
			}
			const dist = Math.hypot(x - mouseX, y - mouseY);
			if (dist < minDist) {
				minDist = dist;
				closestId = train.service.id;
			}
		}

		if (closestId) {
			setHoverPos({ x: mouseX, y: mouseY });
		} else {
			setHoverPos(null);
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
		let minDist = 20;

		for (const train of activeTrains) {
			const { x, y } = proj.project(train.position);
			if (Math.abs(x - mouseX) > minDist || Math.abs(y - mouseY) > minDist) {
				continue;
			}
			const dist = Math.hypot(x - mouseX, y - mouseY);
			if (dist < minDist) {
				minDist = dist;
				closestService = train.service;
			}
		}

		onSelectService(closestService);
	};

	const handleResetView = () => {
		setZoom(1);
		setPan({ x: 0, y: 0 });
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
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}
				onPointerMove={handlePointerMove}
				onPointerLeave={() => {
					isDraggingRef.current = false;
					setHoverPos(null);
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

			{/* Floating Reset View / Center Button */}
			{(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
				<button
					type="button"
					onClick={handleResetView}
					style={{
						position: "absolute",
						bottom: 96,
						right: 20,
						zIndex: 15,
						background: "rgba(7, 19, 27, 0.88)",
						backdropFilter: "blur(8px)",
						border: "1px solid rgba(89, 215, 255, 0.4)",
						borderRadius: 8,
						color: "#59d7ff",
						padding: "6px 12px",
						fontSize: "0.8rem",
						fontWeight: 600,
						cursor: "pointer",
						boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
					}}
				>
					🎯 Reset Map Center
				</button>
			)}

			{/* Floating Hover HUD Tooltip */}
			{hoveredTrain && hoverPos && (
				<div
					style={{
						position: "absolute",
						left: Math.min(window.innerWidth - 240, hoverPos.x + 14),
						top: Math.max(16, hoverPos.y - 45),
						zIndex: 25,
						pointerEvents: "none",
						background: "rgba(7, 19, 27, 0.95)",
						backdropFilter: "blur(8px)",
						border: `1px solid ${
							CATEGORIES[hoveredTrain.service.category].color
						}`,
						borderRadius: 8,
						padding: "6px 10px",
						color: "#edf3f5",
						fontSize: "0.8rem",
						boxShadow: "0 6px 18px rgba(0,0,0,0.6)",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
						<span
							style={{
								color: CATEGORIES[hoveredTrain.service.category].color,
								fontWeight: "bold",
							}}
						>
							{hoveredTrain.service.serviceNumber}
						</span>
						<span style={{ fontWeight: 600 }}>{hoveredTrain.service.name}</span>
					</div>
					<div style={{ color: "#8ca0aa", fontSize: "0.74rem", marginTop: 2 }}>
						{hoveredTrain.isDwelling ? (
							<span style={{ color: "#59d7ff" }}>
								📍 At station: {hoveredTrain.currentStopName}
							</span>
						) : (
							<span>➡️ Next: {hoveredTrain.nextStopName ?? "Destination"}</span>
						)}
					</div>
				</div>
			)}
		</div>
	);
};
