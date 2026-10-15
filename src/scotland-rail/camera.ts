import { type RefObject, useCallback, useEffect, useState } from "react";
import { VIEW_BOUNDS, type ViewPreset } from "./data/types";
import { createProjection } from "./engine/projection";
import { wheelZoom } from "./mapInteraction";

type Camera = {
	preset: ViewPreset;
	zoom: number;
	pan: { x: number; y: number };
};

type Pan = { x: number; y: number };

type CameraFollow = {
	enabled: boolean;
	position: readonly [longitude: number, latitude: number] | null;
};

export const useMapCamera = ({
	viewPreset,
	canvasRef,
	follow,
}: {
	viewPreset: ViewPreset;
	canvasRef: RefObject<HTMLCanvasElement | null>;
	follow: CameraFollow;
}): {
	zoom: number;
	pan: Pan;
	setZoom: (next: number | ((prev: number) => number)) => void;
	setPan: (next: Pan | ((prev: Pan) => Pan)) => void;
} => {
	const [camera, setCamera] = useState<Camera>({
		preset: viewPreset,
		zoom: 1,
		pan: { x: 0, y: 0 },
	});

	if (camera.preset !== viewPreset) {
		setCamera({ preset: viewPreset, zoom: 1, pan: { x: 0, y: 0 } });
	}

	const setZoom = useCallback(
		(next: number | ((prev: number) => number)) =>
			setCamera((prev) => ({
				...prev,
				zoom: typeof next === "function" ? next(prev.zoom) : next,
			})),
		[],
	);

	const setPan = useCallback(
		(next: Pan | ((prev: Pan) => Pan)) =>
			setCamera((prev) => ({
				...prev,
				pan: typeof next === "function" ? next(prev.pan) : next,
			})),
		[],
	);

	const easeCameraPan = useCallback((target: Pan) => {
		setCamera((prev) => {
			const dx = (target.x - prev.pan.x) * 0.15;
			const dy = (target.y - prev.pan.y) * 0.15;
			if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return prev;
			return { ...prev, pan: { x: prev.pan.x + dx, y: prev.pan.y + dy } };
		});
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			setZoom((prev) => wheelZoom(prev, event.deltaY));
		};

		canvas.addEventListener("wheel", onWheel, { passive: false });
		return () => canvas.removeEventListener("wheel", onWheel);
	}, [canvasRef, setZoom]);

	useEffect(() => {
		if (!follow.enabled || !follow.position) return;

		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const proj = createProjection(
			VIEW_BOUNDS[viewPreset],
			rect.width,
			rect.height,
			32,
			camera.zoom,
			{ x: 0, y: 0 },
		);
		const trainScreen = proj.project(follow.position);

		easeCameraPan({
			x: rect.width / 2 - trainScreen.x,
			y: rect.height / 2 - trainScreen.y,
		});
	}, [
		follow.enabled,
		follow.position,
		viewPreset,
		camera.zoom,
		canvasRef,
		easeCameraPan,
	]);

	return { zoom: camera.zoom, pan: camera.pan, setZoom, setPan };
};
