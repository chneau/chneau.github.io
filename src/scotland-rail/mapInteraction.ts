import type { RefObject } from "react";
import type { Snapshot } from "valtio";
import type { TrainService, ViewPreset } from "./data/types";
import { VIEW_BOUNDS } from "./data/types";
import type { ActiveTrainState } from "./engine/interpolator";
import { nearestTrainAt } from "./engine/mapLayers";
import { createProjection } from "./engine/projection";
import { railActions } from "./store";

/**
 * Every gesture that drives the map, as one function of the map's current state.
 *
 * Wheel, drag, pinch, hover, click and the N/P keys are one question — "what
 * does pointing at this map mean?" — and they answer it with the same three
 * pieces: a hit test, the drag bookkeeping, and the projection from a pointer
 * event into the space the layers draw in. Written as a plain function called
 * during render rather than as a hook, because none of it needs to survive a
 * render: the handlers it returns close over this frame's camera exactly as
 * inline handlers did, and there is nothing here to keep between renders.
 */

/** How close, in pixels, the pointer has to be for a hover to register. */
const HOVER_RADIUS_PX = 18;
/** The click target is deliberately a little wider than the hover target. */
const CLICK_RADIUS_PX = 20;

type DragState = {
	isDragging: boolean;
	last: { x: number; y: number };
	touchStartDistance: number | null;
	initialTouchZoom: number;
};

/** The mutable drag bookkeeping, owned by the canvas element's ref. */
type MapInteractionState = DragState;

export const createInteractionState = (): MapInteractionState => ({
	isDragging: false,
	last: { x: 0, y: 0 },
	touchStartDistance: null,
	initialTouchZoom: 1,
});

type MapInteraction = {
	/**
	 * Read through the ref at event time rather than captured during render:
	 * on the first render the element does not exist yet, and a handler holding
	 * `null` would silently drop the visitor's first click.
	 */
	canvasRef: RefObject<HTMLCanvasElement | null>;
	state: MapInteractionState;
	viewPreset: ViewPreset;
	zoom: number;
	pan: { x: number; y: number };
	activeTrains: Snapshot<readonly ActiveTrainState[]>;
	selectedServiceId: string | null;
	setZoom: (next: number | ((prev: number) => number)) => void;
	setPan: (
		next: (prev: { x: number; y: number }) => { x: number; y: number },
	) => void;
	onHoverPos: (position: { x: number; y: number } | null) => void;
};

type MapHandlers = {
	onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
	onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
	onMouseUp: () => void;
	onTouchStart: (e: React.TouchEvent<HTMLCanvasElement>) => void;
	onTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => void;
	onTouchEnd: () => void;
	onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
	onPointerLeave: () => void;
	onClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
	onKeyDown: (e: React.KeyboardEvent<HTMLCanvasElement>) => void;
};

export const createMapHandlers = ({
	canvasRef,
	state,
	viewPreset,
	zoom,
	pan,
	activeTrains,
	selectedServiceId,
	setZoom,
	setPan,
	onHoverPos,
}: MapInteraction): MapHandlers => {
	/** Where the pointer is on the map, in the space the layers draw in. */
	const projectPointer = (clientX: number, clientY: number) => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		const pointer = { x: clientX - rect.left, y: clientY - rect.top };
		return {
			pointer,
			proj: createProjection(
				VIEW_BOUNDS[viewPreset],
				rect.width,
				rect.height,
				32,
				zoom,
				pan,
			),
		};
	};

	const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (e.button === 0) {
			state.isDragging = true;
			state.last = { x: e.clientX, y: e.clientY };
		}
	};

	const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (state.isDragging) {
			const dx = e.clientX - state.last.x;
			const dy = e.clientY - state.last.y;
			state.last = { x: e.clientX, y: e.clientY };
			setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
		}
	};

	const onMouseUp = () => {
		state.isDragging = false;
	};

	const onTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
		if (e.touches.length === 1 && e.touches[0]) {
			state.isDragging = true;
			state.last = { x: e.touches[0].clientX, y: e.touches[0].clientY };
		} else if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
			state.isDragging = false;
			const dist = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY,
			);
			state.touchStartDistance = dist;
			state.initialTouchZoom = zoom;
		}
	};

	const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
		if (e.touches.length === 1 && state.isDragging && e.touches[0]) {
			const dx = e.touches[0].clientX - state.last.x;
			const dy = e.touches[0].clientY - state.last.y;
			state.last = { x: e.touches[0].clientX, y: e.touches[0].clientY };
			setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
		} else if (
			e.touches.length === 2 &&
			state.touchStartDistance &&
			e.touches[0] &&
			e.touches[1]
		) {
			const dist = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY,
			);
			const factor = dist / state.touchStartDistance;
			setZoom(Math.min(8, Math.max(0.6, state.initialTouchZoom * factor)));
		}
	};

	const onTouchEnd = () => {
		state.isDragging = false;
		state.touchStartDistance = null;
	};

	const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const hit = projectPointer(e.clientX, e.clientY);
		if (!hit) return;

		const closest = nearestTrainAt(
			hit.proj,
			hit.pointer,
			activeTrains,
			HOVER_RADIUS_PX,
		);

		onHoverPos(closest ? hit.pointer : null);
		railActions.setHoveredServiceId(closest?.state.service.id ?? null);
	};

	const onPointerLeave = () => {
		state.isDragging = false;
		onHoverPos(null);
		railActions.setHoveredServiceId(null);
	};

	const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const hit = projectPointer(e.clientX, e.clientY);
		if (!hit) return;

		// Clicking empty map clears the selection, which is why the miss is
		// passed through to the store rather than short-circuited.
		const closest = nearestTrainAt(
			hit.proj,
			hit.pointer,
			activeTrains,
			CLICK_RADIUS_PX,
		);
		railActions.setSelectedService(
			closest ? (closest.state.service as TrainService) : null,
		);
	};

	// Keyboard equivalent of clicking a train: cycle the selection through the
	// currently running services (N = next, P = previous).
	const cycleSelectedService = (direction: 1 | -1) => {
		if (activeTrains.length === 0) return;
		const ids = activeTrains.map((train) => train.service.id);
		const currentIndex = selectedServiceId
			? ids.indexOf(selectedServiceId)
			: -1;
		const nextIndex =
			(((currentIndex + direction) % ids.length) + ids.length) % ids.length;
		const next = activeTrains[nextIndex];
		if (next) railActions.setSelectedService(next.service as TrainService);
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
		if (e.key === "n" || e.key === "N") {
			e.preventDefault();
			cycleSelectedService(1);
		} else if (e.key === "p" || e.key === "P") {
			e.preventDefault();
			cycleSelectedService(-1);
		}
	};

	return {
		onMouseDown,
		onMouseMove,
		onMouseUp,
		onTouchStart,
		onTouchMove,
		onTouchEnd,
		onPointerMove,
		onPointerLeave,
		onClick,
		onKeyDown,
	};
};

/**
 * The wheel zoom factor, and the clamp around it. A plain function so the
 * native listener and the on-screen buttons cannot drift apart on either.
 */
export const wheelZoom = (previous: number, deltaY: number): number =>
	Math.min(8, Math.max(0.6, previous * (deltaY < 0 ? 1.15 : 0.87)));

export const BUTTON_ZOOM_IN = (previous: number): number =>
	Math.min(8, previous * 1.25);

export const BUTTON_ZOOM_OUT = (previous: number): number =>
	Math.max(0.6, previous * 0.8);
