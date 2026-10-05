import type { Snapshot } from "valtio";
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
import { mapColors } from "../theme";
import { drawSmoothPath } from "./curve";
import type { ActiveTrainState } from "./interpolator";
import { createProjection } from "./projection";

/**
 * Everything that paints the map, as plain functions over a canvas context.
 *
 * None of this is React. The two routines are ~400 lines of imperative drawing
 * that happened to live inside the component owning the canvas, which made that
 * component impossible to read. They are split by *when* they run — the static
 * layer only when the transform changes, the dynamic layer every frame — because
 * that is exactly the seam the offscreen-canvas design already draws.
 */

/** The projector returned by `createProjection`. */
type Projector = ReturnType<typeof createProjection>;

// The static layer (coastlines, lochs, rails, landmarks, stations) is baked to
// an offscreen canvas and then blitted. Pan is applied as a bitmap translation,
// so it never re-projects geometry. The bake is quantized to this grid: as long
// as the live pan stays within one grid cell the cached bitmap is reused, and
// STATIC_MARGIN of slack around the viewport hides the cell boundary.
export const STATIC_GRID = 128;
export const STATIC_MARGIN = STATIC_GRID;

type Atmosphere = {
	bgColor: string;
	landColor: string;
	coastColor: string;
	isNight: boolean;
	lightFactor: number;
};

// Calculate atmospheric day/night colors based on time offset (00:00 to 24:00)
const getDayNightAtmosphere = (
	timeOffset: number,
	enabled: boolean,
): Atmosphere => {
	if (!enabled) {
		return {
			bgColor: mapColors.bg,
			landColor: "#0d222f",
			coastColor: "#436577",
			isNight: false,
			lightFactor: 1,
		};
	}

	const hours = (timeOffset / 60) % 24;

	// Sunrise: 05:30 - 08:30
	// Daytime: 08:30 - 18:00
	// Sunset: 18:00 - 21:30
	// Night: 21:30 - 05:30
	if (hours >= 8.5 && hours <= 18) {
		return {
			bgColor: "#091724",
			landColor: "#0f2c3e",
			coastColor: "#567c92",
			isNight: false,
			lightFactor: 1,
		};
	}
	if (hours >= 5.5 && hours < 8.5) {
		return {
			bgColor: "#141525",
			landColor: "#1d2538",
			coastColor: "#a07d6a",
			isNight: false,
			lightFactor: 0.7,
		};
	}
	if (hours > 18 && hours <= 21.5) {
		return {
			bgColor: "#121422",
			landColor: "#1b2033",
			coastColor: "#8a6f66",
			isNight: true,
			lightFactor: 0.6,
		};
	}
	return {
		bgColor: "#040b10",
		landColor: "#081620",
		coastColor: "#283f4d",
		isNight: true,
		lightFactor: 0.3,
	};
};

// Vector marker for a scenic landmark, replacing the emoji glyphs used before.
const drawLandmarkMarker = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
) => {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(Math.PI / 4);
	ctx.fillStyle = "#c9a04e";
	ctx.strokeStyle = mapColors.bg;
	ctx.lineWidth = 1;
	ctx.fillRect(-3.4, -3.4, 6.8, 6.8);
	ctx.strokeRect(-3.4, -3.4, 6.8, 6.8);
	ctx.restore();
};

type StaticLayerFrame = {
	/** CSS pixels; the caller has already scaled the context by `dpr`. */
	width: number;
	height: number;
	/** Quantised to two minutes: the labels do not need redrawing faster. */
	quantisedTime: number;
	settings: AppSettings;
	viewPreset: ViewPreset;
	zoom: number;
	/** The pan this bitmap is baked for, quantised to `STATIC_GRID`. */
	bakeX: number;
	bakeY: number;
};

/**
 * Paints coastlines, lochs, rails, city lights, landmarks and stations onto the
 * offscreen layer, with a cell of slack on every side so translating the bitmap
 * to follow the live pan never exposes an unpainted edge.
 */
export const bakeStaticLayer = (
	sCtx: CanvasRenderingContext2D,
	{
		width,
		height,
		quantisedTime,
		settings,
		viewPreset,
		zoom,
		bakeX,
		bakeY,
	}: StaticLayerFrame,
) => {
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const bakeWidth = width + STATIC_MARGIN * 2;
	const bakeHeight = height + STATIC_MARGIN * 2;

	sCtx.setTransform(dpr, 0, 0, dpr, STATIC_MARGIN * dpr, STATIC_MARGIN * dpr);
	sCtx.clearRect(-STATIC_MARGIN, -STATIC_MARGIN, bakeWidth, bakeHeight);

	const atmo = getDayNightAtmosphere(quantisedTime, settings.dayNightCycle);

	// Background
	sCtx.fillStyle = atmo.bgColor;
	sCtx.fillRect(-STATIC_MARGIN, -STATIC_MARGIN, bakeWidth, bakeHeight);

	const proj = createProjection(
		VIEW_BOUNDS[viewPreset],
		width,
		height,
		32,
		zoom,
		{
			x: bakeX,
			y: bakeY,
		},
	);

	// 1. Coastlines
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

	// 2. Scottish Lochs
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

	// 3. Rail Paths (Curved High-Resolution Multi-Layer Track)
	// Track base glow / bed
	sCtx.strokeStyle = settings.congestionHeatmap
		? "rgba(255, 100, 50, 0.35)"
		: "#1b3342";
	sCtx.lineWidth = settings.congestionHeatmap ? 4.5 : 3.5;
	sCtx.lineCap = "round";
	sCtx.lineJoin = "round";
	for (const rail of RAIL_PATHS) {
		sCtx.beginPath();
		const projected = rail.coordinates.map((pt) => proj.project(pt));
		drawSmoothPath(sCtx, projected);
		sCtx.stroke();
	}

	// Track main line
	sCtx.strokeStyle = settings.congestionHeatmap ? "#ff7b47" : "#4d7388";
	sCtx.lineWidth = 1.5;
	for (const rail of RAIL_PATHS) {
		sCtx.beginPath();
		const projected = rail.coordinates.map((pt) => proj.project(pt));
		drawSmoothPath(sCtx, projected);
		sCtx.stroke();
	}

	// 4. City Night Lights
	if (settings.cityLights && atmo.isNight) {
		const majorCities = [
			{ coord: [-4.258, 55.859] as [number, number], r: 35 },
			{ coord: [-3.189, 55.952] as [number, number], r: 30 },
			{ coord: [-2.973, 56.457] as [number, number], r: 18 },
			{ coord: [-2.098, 57.143] as [number, number], r: 22 },
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
			if (
				x < -STATIC_MARGIN - 20 ||
				x > width + STATIC_MARGIN + 20 ||
				y < -STATIC_MARGIN - 20 ||
				y > height + STATIC_MARGIN + 20
			) {
				continue;
			}

			drawLandmarkMarker(sCtx, x, y);

			if (zoom > 1.2 || viewPreset !== "scotland") {
				sCtx.font = "bold 9.5px system-ui, sans-serif";
				sCtx.fillStyle = "#c9a04e";
				sCtx.shadowColor = "rgba(6, 13, 18, 0.85)";
				sCtx.shadowBlur = 4;
				sCtx.fillText(lm.name, x + 10, y + 3);
				sCtx.shadowBlur = 0;
			}
		}
	}

	// 6. Stations & Labels
	for (const st of STATIONS) {
		const { x, y } = proj.project(st.coordinate);
		if (
			x < -STATIC_MARGIN - 30 ||
			x > width + STATIC_MARGIN + 30 ||
			y < -STATIC_MARGIN - 30 ||
			y > height + STATIC_MARGIN + 30
		) {
			continue;
		}

		// Station Halo
		if (st.isMajor) {
			sCtx.fillStyle = "rgba(90, 169, 201, 0.16)";
			sCtx.beginPath();
			sCtx.arc(x, y, 7, 0, Math.PI * 2);
			sCtx.fill();
		}

		// Station dot
		sCtx.fillStyle = st.isMajor ? "#ffffff" : "#98b1be";
		sCtx.strokeStyle = mapColors.bg;
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
			sCtx.fillStyle = st.isMajor ? "#eef3f5" : "#93a6b0";

			sCtx.shadowColor = "rgba(6, 13, 18, 0.9)";
			sCtx.shadowBlur = 4;
			sCtx.fillText(st.name, x + 6, y + 3.5);
			sCtx.shadowBlur = 0;
		}
	}
};

/** One running train, projected, ready to draw. */
type ProjectedTrain = {
	x: number;
	y: number;
	state: Snapshot<ActiveTrainState>;
};

type DynamicLayerFrame = {
	/** The baked bitmap, blitted first and then overdrawn. */
	staticCanvas: HTMLCanvasElement;
	/** CSS pixels; the caller has already scaled the context by `dpr`. */
	width: number;
	height: number;
	pan: { x: number; y: number };
	/** The pan this bitmap was baked for, quantised to `STATIC_GRID`. */
	bakeX: number;
	bakeY: number;
	viewPreset: ViewPreset;
	zoom: number;
	timeOffset: number;
	settings: AppSettings;
	reducedMotion: boolean;
	selectedServiceId: string | null;
	hoveredServiceId: string | null;
	filteredServices: Snapshot<readonly TrainService[]>;
	activeTrains: Snapshot<readonly ActiveTrainState[]>;
};

/**
 * The Highland rain, from a fixed set of seeds so it falls consistently rather
 * than re-rolling every frame.
 */
const drawRain = (
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
) => {
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
};

/** The full route of the selected service: a soft underlay, then the line. */
const drawSelectedRoute = (
	ctx: CanvasRenderingContext2D,
	proj: Projector,
	service: Snapshot<TrainService>,
) => {
	const catConfig = CATEGORIES[service.category];
	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	const projected = service.pathCoordinates.map((pt) => proj.project(pt));
	// Soft desaturated underlay gives legibility without a neon glow.
	ctx.strokeStyle = catConfig.color;
	ctx.globalAlpha = 0.26;
	ctx.lineWidth = 6;
	ctx.beginPath();
	drawSmoothPath(ctx, projected);
	ctx.stroke();

	ctx.globalAlpha = 0.95;
	ctx.lineWidth = 2.4;
	ctx.beginPath();
	drawSmoothPath(ctx, projected);
	ctx.stroke();
	ctx.restore();
};

/** The fading trail behind a moving train. */
const drawTrail = (
	ctx: CanvasRenderingContext2D,
	proj: Projector,
	train: ProjectedTrain,
	accent: string,
) => {
	const previous = train.state.previousPosition;
	if (!previous || train.state.isDwelling) return;
	const prev = proj.project(previous);
	ctx.save();
	const grad = ctx.createLinearGradient(prev.x, prev.y, train.x, train.y);
	grad.addColorStop(0, "rgba(0,0,0,0)");
	grad.addColorStop(1, accent);
	ctx.strokeStyle = grad;
	ctx.lineWidth = 2.5;
	ctx.globalAlpha = 0.7;
	ctx.beginPath();
	ctx.moveTo(prev.x, prev.y);
	ctx.lineTo(train.x, train.y);
	ctx.stroke();
	ctx.restore();
};

/** The forward headlight cone, at night and only while the train is moving. */
const drawHeadlight = (
	ctx: CanvasRenderingContext2D,
	train: ProjectedTrain,
) => {
	const { x, y, state } = train;
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(state.headingAngle);

	const beamGrad = ctx.createRadialGradient(0, 0, 2, 30, 0, 38);
	beamGrad.addColorStop(0, "rgba(255, 250, 190, 0.7)");
	beamGrad.addColorStop(0.5, "rgba(255, 235, 140, 0.25)");
	beamGrad.addColorStop(1, "rgba(255, 220, 90, 0)");

	ctx.fillStyle = beamGrad;
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(38, -12);
	ctx.lineTo(38, 12);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
};

/** The two expanding rings a dwelling train pulses, so it reads as stopped. */
const drawDwellPulse = (
	ctx: CanvasRenderingContext2D,
	train: ProjectedTrain,
	size: number,
	accent: string,
	reducedMotion: boolean,
) => {
	const { x, y } = train;
	const nowMs = performance.now();
	const pulse1 = reducedMotion ? 0 : (nowMs % 1600) / 1600;
	const pulse2 = reducedMotion ? 0.5 : ((nowMs + 800) % 1600) / 1600;

	ctx.save();
	ctx.fillStyle = `${accent}22`;
	ctx.beginPath();
	ctx.arc(x, y, size + 6, 0, Math.PI * 2);
	ctx.fill();

	ctx.strokeStyle = accent;
	ctx.lineWidth = 1.6;
	ctx.globalAlpha = Math.max(0, 1 - pulse1) * 0.85;
	ctx.beginPath();
	ctx.arc(x, y, size + pulse1 * 16, 0, Math.PI * 2);
	ctx.stroke();

	ctx.lineWidth = 1.2;
	ctx.globalAlpha = Math.max(0, 1 - pulse2) * 0.65;
	ctx.beginPath();
	ctx.arc(x, y, size + pulse2 * 16, 0, Math.PI * 2);
	ctx.stroke();

	ctx.restore();
};

/** The selected/hovered white ring, drawn under the hull. */
const drawSelectionRing = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
) => {
	ctx.strokeStyle = "#ffffff";
	ctx.globalAlpha = 0.9;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(x, y, size + 4, 0, Math.PI * 2);
	ctx.stroke();
	ctx.globalAlpha = 1;
};

/**
 * The train body: a streamlined capsule along the heading, with a windshield.
 * Drawn last within a train so it sits over the trail and the dwell rings.
 */
const drawHull = (
	ctx: CanvasRenderingContext2D,
	train: ProjectedTrain,
	size: number,
	accent: string,
) => {
	const { x, y, state } = train;
	ctx.translate(x, y);
	ctx.rotate(state.headingAngle);

	// Streamlined Aerodynamic Train Capsule Hull
	const halfL = size * 1.3;
	const halfW = size * 0.65;
	ctx.fillStyle = accent;
	ctx.strokeStyle = mapColors.bg;
	ctx.lineWidth = 1.4;

	ctx.beginPath();
	// Pointed / aerodynamic rounded nose along positive X axis (direction of heading)
	ctx.moveTo(halfL, 0);
	ctx.lineTo(halfL * 0.4, -halfW);
	ctx.lineTo(-halfL, -halfW);
	ctx.lineTo(-halfL, halfW);
	ctx.lineTo(halfL * 0.4, halfW);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();

	// Windshield cockpit glass at front
	ctx.fillStyle = "#ffffff";
	ctx.beginPath();
	ctx.moveTo(halfL * 0.7, 0);
	ctx.lineTo(halfL * 0.25, -halfW * 0.6);
	ctx.lineTo(halfL * 0.15, 0);
	ctx.lineTo(halfL * 0.25, halfW * 0.6);
	ctx.closePath();
	ctx.fill();
};

/**
 * Blits the baked static layer, then draws everything that moves on top of it.
 * Runs per frame, so `reducedMotion` gates every time-varying flourish here
 * rather than only the ones that animate a CSS class.
 */
export const drawDynamicLayer = (
	ctx: CanvasRenderingContext2D,
	frame: DynamicLayerFrame,
) => {
	const {
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
	} = frame;

	ctx.clearRect(0, 0, width, height);

	// Static layer: the bitmap was baked for `bakeX/bakeY`, so translating
	// it by the residual pan tracks the live camera without re-projecting.
	ctx.drawImage(
		staticCanvas,
		pan.x - bakeX - STATIC_MARGIN,
		pan.y - bakeY - STATIC_MARGIN,
		width + STATIC_MARGIN * 2,
		height + STATIC_MARGIN * 2,
	);

	const proj = createProjection(
		VIEW_BOUNDS[viewPreset],
		width,
		height,
		32,
		zoom,
		pan,
	);
	const atmo = getDayNightAtmosphere(timeOffset, settings.dayNightCycle);

	// 1. Highland Weather / Rain Effect
	if (settings.weatherEffects && !reducedMotion) {
		drawRain(ctx, width, height);
	}

	// 2. Draw Selected Service Full Route (High-Res Spline)
	if (selectedServiceId) {
		const activeSelected = filteredServices.find(
			(s) => s.id === selectedServiceId,
		);
		if (activeSelected) drawSelectedRoute(ctx, proj, activeSelected);
	}

	// 3. Draw Active Trains & Trails
	for (const state of activeTrains) {
		const { x, y } = proj.project(state.position);
		const train: ProjectedTrain = { x, y, state };
		const isSelected = state.service.id === selectedServiceId;
		const isHovered = state.service.id === hoveredServiceId;
		const catConfig = CATEGORIES[state.service.category];

		drawTrail(ctx, proj, train, catConfig.color);

		// Headlight beam (atmosphere is hoisted above the train loop)
		if (
			settings.trainHeadlights &&
			atmo.isNight &&
			!state.isDwelling &&
			!reducedMotion
		) {
			drawHeadlight(ctx, train);
		}

		const size = isSelected || isHovered ? 6.5 : 4.5;

		// Draw Station Dwelling / Stopped Train Visual Effect
		if (state.isDwelling) {
			drawDwellPulse(ctx, train, size, catConfig.color, reducedMotion);
		}

		// Draw Train Marker Outer Highlight Ring
		ctx.save();
		if (isSelected || isHovered) drawSelectionRing(ctx, x, y, size);

		drawHull(ctx, train, size, catConfig.color);

		ctx.restore();
	}
};

/**
 * Projects the running trains and returns the nearest within `radius`, or
 * `null`. Hover and click differ only in the radius they accept and what they
 * do with the answer, so the search itself is written once.
 */
export const nearestTrainAt = (
	proj: Projector,
	pointer: { x: number; y: number },
	activeTrains: Snapshot<readonly ActiveTrainState[]>,
	radius: number,
): ProjectedTrain | null => {
	let closest: ProjectedTrain | null = null;
	let minDist = radius;

	for (const state of activeTrains) {
		const { x, y } = proj.project(state.position);
		// Axis reject before the square root.
		if (
			Math.abs(x - pointer.x) > minDist ||
			Math.abs(y - pointer.y) > minDist
		) {
			continue;
		}
		const dist = Math.hypot(x - pointer.x, y - pointer.y);
		if (dist < minDist) {
			minDist = dist;
			closest = { x, y, state };
		}
	}

	return closest;
};
