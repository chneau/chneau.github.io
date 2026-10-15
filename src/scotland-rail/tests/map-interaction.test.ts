import { describe, expect, test } from "bun:test";
import type { TrainService } from "../data/types";
import type { ActiveTrainState } from "../engine/interpolator";
import {
	BUTTON_ZOOM_IN,
	BUTTON_ZOOM_OUT,
	createInteractionState,
	createMapHandlers,
	wheelZoom,
} from "../mapInteraction";
import { railStore } from "../store";

const ZOOM_MAX = 8;
const ZOOM_MIN = 0.6;

describe("wheelZoom", () => {
	test("a wheel-up notch multiplies by 1.15 and no delta is small enough to matter", () => {
		expect(wheelZoom(1, -100)).toBe(1.15);
		expect(wheelZoom(1, -1)).toBe(1.15);
		expect(wheelZoom(1, -1e6)).toBe(1.15);
	});

	test("a wheel-down notch multiplies by 0.87", () => {
		expect(wheelZoom(1, 100)).toBeCloseTo(0.87, 10);
		expect(wheelZoom(1, 1)).toBeCloseTo(0.87, 10);
		expect(wheelZoom(1, 1e6)).toBeCloseTo(0.87, 10);
	});

	test("the wheel is clamped at the top", () => {
		expect(wheelZoom(ZOOM_MAX, -100)).toBe(ZOOM_MAX);
		expect(wheelZoom(ZOOM_MAX, -100)).not.toBeCloseTo(9.2, 5);
		expect(wheelZoom(7, -100)).toBe(ZOOM_MAX);
		expect(wheelZoom(6, -100)).toBeCloseTo(6.9, 10);
	});

	test("the wheel is clamped at the bottom", () => {
		expect(wheelZoom(ZOOM_MIN, 100)).toBe(ZOOM_MIN);
		expect(wheelZoom(ZOOM_MIN, 100)).not.toBeCloseTo(0.522, 5);
	});

	test("a full run of one direction stays on the clamp and never crosses it", () => {
		let zoom = 1;
		for (let i = 0; i < 200; i++) zoom = wheelZoom(zoom, -100);
		expect(zoom).toBe(ZOOM_MAX);

		for (let i = 0; i < 200; i++) zoom = wheelZoom(zoom, 100);
		expect(zoom).toBe(ZOOM_MIN);
	});
});

describe("the on-screen zoom buttons", () => {
	test("IN is bounded above, and the bound is the only one it has", () => {
		expect(BUTTON_ZOOM_IN(1)).toBe(1.25);
		expect(BUTTON_ZOOM_IN(ZOOM_MAX)).toBe(ZOOM_MAX);
		expect(BUTTON_ZOOM_IN(ZOOM_MIN)).toBeCloseTo(0.75, 10);
	});

	test("OUT is bounded below, and the bound is the only one it has", () => {
		expect(BUTTON_ZOOM_OUT(1)).toBe(0.8);
		expect(BUTTON_ZOOM_OUT(ZOOM_MIN)).toBe(ZOOM_MIN);
		expect(BUTTON_ZOOM_OUT(ZOOM_MIN)).not.toBeCloseTo(0.48, 5);
		expect(BUTTON_ZOOM_OUT(ZOOM_MAX)).toBeCloseTo(6.4, 10);
	});

	test("repeated clicks converge on the bound rather than stepping past it", () => {
		let zoom = 1;
		for (let i = 0; i < 100; i++) zoom = BUTTON_ZOOM_IN(zoom);
		expect(zoom).toBe(ZOOM_MAX);

		zoom = 1;
		for (let i = 0; i < 100; i++) zoom = BUTTON_ZOOM_OUT(zoom);
		expect(zoom).toBe(ZOOM_MIN);
	});
});

const service = (id: string): TrainService => ({
	id,
	serviceNumber: id.toUpperCase(),
	name: `Service ${id}`,
	category: "Express",
	operator: "ScotRail",
	pathCoordinates: [
		[-3.19, 55.95],
		[-3.1, 56.05],
	],
	calls: [{ stationId: "edb", arrivalOffset: 480, departureOffset: 481 }],
});

const train = (id: string): ActiveTrainState => ({
	service: service(id),
	position: [-3.19, 55.95],
	previousPosition: null,
	progress: 0.5,
	currentSegmentIndex: 0,
	currentStopName: "Edinburgh Waverley",
	nextStopName: null,
	isDwelling: false,
	headingAngle: 0,
});

const IDS = ["a", "b", "c"] as const;

const pressKey = (key: "n" | "p", activeTrains: ActiveTrainState[]) => {
	const selectedServiceId = railStore.selectedService?.id ?? null;
	const handlers = createMapHandlers({
		canvasRef: { current: null },
		state: createInteractionState(),
		viewPreset: "scotland",
		zoom: 1,
		pan: { x: 0, y: 0 },
		activeTrains,
		selectedServiceId,
		setZoom: () => {},
		setPan: () => {},
		onHoverPos: () => {},
	});
	let defaultPrevented = false;
	handlers.onKeyDown({
		key,
		preventDefault: () => {
			defaultPrevented = true;
		},
	} as unknown as React.KeyboardEvent<HTMLCanvasElement>);
	expect(defaultPrevented).toBe(true);
	return railStore.selectedService?.id ?? null;
};

describe("N and P cycle the selected service", () => {
	test("N from no selection takes the first running service", () => {
		railStore.selectedService = null;
		expect(pressKey("n", IDS.map(train))).toBe("a");
	});

	test("repeated N wraps around the end of the list", () => {
		railStore.selectedService = service("c");
		expect(pressKey("n", IDS.map(train))).toBe("a");
		expect(pressKey("n", IDS.map(train))).toBe("b");
		expect(pressKey("n", IDS.map(train))).toBe("c");
		expect(pressKey("n", IDS.map(train))).toBe("a");
	});

	test("repeated P walks down the list and wraps at the first", () => {
		railStore.selectedService = service("b");
		expect(pressKey("p", IDS.map(train))).toBe("a");
		expect(pressKey("p", IDS.map(train))).toBe("c");
		expect(pressKey("p", IDS.map(train))).toBe("b");
	});

	test("P from no selection lands on the LAST running service", () => {
		railStore.selectedService = null;
		expect(pressKey("p", IDS.map(train))).toBe("c");
	});

	test("N then P returns to no selection's counterpart, not a skip", () => {
		railStore.selectedService = null;
		pressKey("p", IDS.map(train));
		expect(pressKey("p", IDS.map(train))).toBe("b");
		expect(pressKey("p", IDS.map(train))).toBe("a");
		expect(pressKey("n", IDS.map(train))).toBe("b");
	});

	test("an empty activeTrains list makes both keys a no-op", () => {
		railStore.selectedService = null;
		expect(pressKey("n", [])).toBeNull();
		expect(pressKey("p", [])).toBeNull();

		railStore.selectedService = service("a");
		expect(pressKey("n", [])).toBe("a");
		expect(pressKey("p", [])).toBe("a");
	});

	test("a stale selection is treated as no selection, and picks up where it left off", () => {
		railStore.selectedService = service("zz");
		expect(pressKey("n", IDS.map(train))).toBe("a");
		expect(pressKey("p", IDS.map(train))).toBe("c");
	});

	test("a single running service is selected by either key", () => {
		railStore.selectedService = null;
		expect(pressKey("n", [train("a")])).toBe("a");
		expect(pressKey("p", [train("a")])).toBe("a");
	});
});
