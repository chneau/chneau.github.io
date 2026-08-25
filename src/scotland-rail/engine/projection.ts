import type { Bounds, Coordinate } from "../data/types";

type Projection = {
	project: (coord: Coordinate) => { x: number; y: number };
	unproject: (point: { x: number; y: number }) => Coordinate;
	width: number;
	height: number;
	scale: number;
};

export const createProjection = (
	bounds: Bounds,
	width: number,
	height: number,
	padding = 24,
	zoom = 1,
	panOffset: { x: number; y: number } = { x: 0, y: 0 },
): Projection => {
	const [west, south, east, north] = bounds;
	const usableWidth = Math.max(1, width - padding * 2);
	const usableHeight = Math.max(1, height - padding * 2);

	const midLat = ((south + north) / 2) * (Math.PI / 180);
	const lonScale = Math.cos(midLat);

	const lonSpan = (east - west) * lonScale;
	const latSpan = north - south;

	const baseScale = Math.min(usableWidth / lonSpan, usableHeight / latSpan);
	const scale = baseScale * zoom;

	const mapCenterX = (west + east) / 2;
	const mapCenterY = (south + north) / 2;

	const screenCenterX = width / 2 + panOffset.x;
	const screenCenterY = height / 2 + panOffset.y;

	const project = (coord: Coordinate) => {
		const [lon, lat] = coord;
		const x = screenCenterX + (lon - mapCenterX) * lonScale * scale;
		const y = screenCenterY - (lat - mapCenterY) * scale;
		return { x, y };
	};

	const unproject = (point: { x: number; y: number }): Coordinate => {
		const lon = mapCenterX + (point.x - screenCenterX) / (lonScale * scale);
		const lat = mapCenterY - (point.y - screenCenterY) / scale;
		return [lon, lat];
	};

	return {
		project,
		unproject,
		width,
		height,
		scale,
	};
};
