import { type RefObject, useCallback, useEffect, useState } from "react";
import { VIEW_BOUNDS, type ViewPreset } from "./data/types";
import { createProjection } from "./engine/projection";
import { wheelZoom } from "./mapInteraction";

/**
 * The map's camera: zoom, pan, and the preset they are relative to — plus the
 * two things that move it without a hand on the pointer, the wheel and the
 * follow pass.
 *
 * The three live in ONE state object rather than three because they are only
 * meaningful together — a pan is a distance in screen pixels, which means
 * nothing without the zoom and the bounds that produced it. Splitting them
 * would allow a state the renderer cannot interpret, such as a pan twice as
 * large after a zoom change.
 *
 * Switching preset is adjusted while rendering rather than in an effect. The
 * follow pass reads the camera, so a reset that happened in an effect would let
 * that pass run once against the bounds the visitor just left.
 */
type Camera = {
	preset: ViewPreset;
	zoom: number;
	pan: { x: number; y: number };
};

type Pan = { x: number; y: number };

/**
 * What the follow pass is aiming at. `null` when nothing is selected, which is
 * the same as "do not follow" — the pass has no other opinion.
 */
type CameraFollow = {
	enabled: boolean;
	/** A Valtio snapshot coordinate, hence the readonly tuple. */
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

	// Narrow writers, so a handler that moves the camera touches one field and
	// leaves the other two — and the preset — exactly as they were. Memoised
	// because the wheel listener is bound in an effect that depends on one: a
	// setter rebuilt every render would rebind that listener every frame.
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

	// Moving *towards* a point rather than jumping to it, which is what follow
	// needs. Returning the previous state untouched once it has converged: an
	// ease that never quite arrives would re-render the map forever.
	const easeCameraPan = useCallback((target: Pan) => {
		setCamera((prev) => {
			const dx = (target.x - prev.pan.x) * 0.15;
			const dy = (target.y - prev.pan.y) * 0.15;
			if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return prev;
			return { ...prev, pan: { x: prev.pan.x + dx, y: prev.pan.y + dy } };
		});
	}, []);

	// Native wheel listener so preventDefault() is honoured — React's onWheel is
	// passive, so the page would scroll instead of zooming.
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

	// Follow the selected train, so watching a service does not mean re-centring
	// by hand every few seconds.
	useEffect(() => {
		if (!follow.enabled || !follow.position) return;

		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		// Projected from the preset's origin: the pan that centres the train is
		// measured in the same space the camera lives in, not the current one.
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
