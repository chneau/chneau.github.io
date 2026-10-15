import { describe, expect, test } from "bun:test";
import type { TrainService } from "../data/types";
import {
	clampReplayTime,
	cycleIndex,
	earliestServiceMinute,
	formatTime,
	MAX_REPLAY_TIME,
	MIN_REPLAY_TIME,
	type RailShortcutEvent,
	resolveRailShortcut,
	stepSpeed,
} from "../utils";

describe("formatTime", () => {
	test("renders the end of the replay day as 24:00, not 00:00", () => {
		expect(formatTime(1440)).toBe("24:00");
		expect(formatTime(MAX_REPLAY_TIME)).toBe("24:00");
		expect(formatTime(1440)).not.toBe(formatTime(0));
	});

	test("keeps counting past midnight for after-midnight calls", () => {
		expect(formatTime(1455)).toBe("24:15");
		expect(formatTime(1475)).toBe("24:35");
	});

	test("renders the window bounds and midnight unchanged", () => {
		expect(formatTime(0)).toBe("00:00");
		expect(formatTime(MIN_REPLAY_TIME)).toBe("05:00");
		expect(formatTime(480)).toBe("08:00");
		expect(formatTime(1439)).toBe("23:59");
	});

	test("clamps negative and non-finite input instead of rendering junk", () => {
		expect(formatTime(-0.5)).toBe("00:00");
		expect(formatTime(-1)).toBe("00:00");
		expect(formatTime(-90)).toBe("00:00");
		expect(formatTime(Number.NaN)).toBe("—");
		expect(formatTime(Number.POSITIVE_INFINITY)).toBe("—");
	});

	test("keeps the unknown marker for null", () => {
		expect(formatTime(null)).toBe("—");
	});

	test("truncates sub-minute playback instead of showing a future minute", () => {
		expect(formatTime(480.9)).toBe("08:00");
	});
});

describe("clampReplayTime", () => {
	test("confines the clock to the replay window", () => {
		expect(clampReplayTime(MIN_REPLAY_TIME)).toBe(300);
		expect(clampReplayTime(MAX_REPLAY_TIME)).toBe(1440);
		expect(clampReplayTime(100)).toBe(MIN_REPLAY_TIME);
		expect(clampReplayTime(0)).toBe(MIN_REPLAY_TIME);
		expect(clampReplayTime(-50)).toBe(MIN_REPLAY_TIME);
		expect(clampReplayTime(1455)).toBe(MAX_REPLAY_TIME);
		expect(clampReplayTime(1475)).toBe(MAX_REPLAY_TIME);
		expect(clampReplayTime(9999)).toBe(MAX_REPLAY_TIME);
	});

	test("rounds to the resolution a share link can carry", () => {
		expect(clampReplayTime(480.4)).toBe(480);
		expect(clampReplayTime(480.6)).toBe(481);
	});
});

describe("resolveRailShortcut", () => {
	const key = (over: Partial<RailShortcutEvent>): RailShortcutEvent => ({
		code: "",
		key: "",
		shiftKey: false,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		...over,
	});

	test("N and P cycle the selected train from anywhere on the page", () => {
		expect(resolveRailShortcut(key({ key: "n" }))).toEqual({
			kind: "cycle-train",
			direction: 1,
		});
		expect(resolveRailShortcut(key({ key: "N" }))).toEqual({
			kind: "cycle-train",
			direction: 1,
		});
		expect(resolveRailShortcut(key({ key: "p" }))).toEqual({
			kind: "cycle-train",
			direction: -1,
		});
		expect(resolveRailShortcut(key({ key: "P" }))).toEqual({
			kind: "cycle-train",
			direction: -1,
		});
	});

	test("Cmd/Ctrl/Alt+N and command chords are left to the browser", () => {
		expect(resolveRailShortcut(key({ key: "n", metaKey: true }))).toBeNull();
		expect(resolveRailShortcut(key({ key: "p", ctrlKey: true }))).toBeNull();
		expect(resolveRailShortcut(key({ key: "n", altKey: true }))).toBeNull();
	});

	test("plain M toggles ambient audio", () => {
		expect(resolveRailShortcut(key({ key: "m" }))).toEqual({
			kind: "toggle-sound",
		});
		expect(resolveRailShortcut(key({ key: "M" }))).toEqual({
			kind: "toggle-sound",
		});
	});

	test("Cmd/Ctrl/Alt+M is not ours - those chords belong to the OS", () => {
		expect(resolveRailShortcut(key({ key: "m", metaKey: true }))).toBeNull();
		expect(resolveRailShortcut(key({ key: "M", metaKey: true }))).toBeNull();
		expect(resolveRailShortcut(key({ key: "m", ctrlKey: true }))).toBeNull();
		expect(resolveRailShortcut(key({ key: "m", altKey: true }))).toBeNull();
	});

	test("Shift+M is still ours: Shift is the only in-app modifier", () => {
		expect(resolveRailShortcut(key({ key: "m", shiftKey: true }))).toEqual({
			kind: "toggle-sound",
		});
	});

	test("playback shortcuts are unchanged", () => {
		expect(resolveRailShortcut(key({ code: "Space", key: " " }))).toEqual({
			kind: "toggle-play",
		});
		expect(resolveRailShortcut(key({ code: "ArrowLeft" }))).toEqual({
			kind: "scrub",
			deltaMinutes: -5,
		});
		expect(
			resolveRailShortcut(key({ code: "ArrowRight", shiftKey: true })),
		).toEqual({ kind: "scrub", deltaMinutes: 15 });
		expect(resolveRailShortcut(key({ code: "ArrowUp" }))).toEqual({
			kind: "speed",
			direction: 1,
		});
		expect(resolveRailShortcut(key({ code: "Escape" }))).toEqual({
			kind: "escape",
		});
	});

	test("unrelated keys resolve to nothing", () => {
		expect(resolveRailShortcut(key({ key: "k", code: "KeyK" }))).toBeNull();
		expect(resolveRailShortcut(key({ key: "F5", code: "F5" }))).toBeNull();
	});
});

describe("stepSpeed", () => {
	test("walks the offered speeds and stops at the ends", () => {
		expect(stepSpeed(2, 1)).toBe(5);
		expect(stepSpeed(2, -1)).toBe(1);
		expect(stepSpeed(15, 1)).toBeNull();
		expect(stepSpeed(0.5, -1)).toBeNull();
		expect(stepSpeed(99, 1)).toBeNull();
	});
});

const serviceWithCalls = (
	id: string,
	calls: readonly [number | null, number | null][],
): TrainService => ({
	id,
	serviceNumber: id.toUpperCase(),
	name: `Service ${id}`,
	category: "Express",
	operator: "ScotRail",
	pathCoordinates: [
		[-3.19, 55.95],
		[-3.1, 56.05],
	],
	calls: calls.map(([arrivalOffset, departureOffset], index) => ({
		stationId: `st${index}`,
		arrivalOffset,
		departureOffset,
	})),
});

describe("earliestServiceMinute", () => {
	test("finds the first departure of the day across every service", () => {
		expect(
			earliestServiceMinute([
				serviceWithCalls("a", [
					[600, 605],
					[700, 705],
				]),
				serviceWithCalls("b", [[380, null]]),
			]),
		).toBe(380);
	});

	test("falls back to the arrival of a first call that never departs", () => {
		expect(earliestServiceMinute([serviceWithCalls("c", [[420, null]])])).toBe(
			420,
		);
	});

	test("ignores services that start after the replay window closes", () => {
		expect(earliestServiceMinute([serviceWithCalls("d", [[1500, 1505]])])).toBe(
			MAX_REPLAY_TIME,
		);
	});

	test("never reports a minute outside the replay window", () => {
		expect(earliestServiceMinute([serviceWithCalls("e", [[0, 10]])])).toBe(
			MIN_REPLAY_TIME,
		);
	});

	test("an empty timetable falls back to the end of the window", () => {
		expect(earliestServiceMinute([])).toBe(MAX_REPLAY_TIME);
	});
});

describe("cycleIndex", () => {
	test("walks forwards and wraps at the end", () => {
		expect(cycleIndex(3, 1, 1)).toBe(2);
		expect(cycleIndex(3, 2, 1)).toBe(0);
	});

	test("walks backwards and wraps at the start", () => {
		expect(cycleIndex(3, 0, -1)).toBe(2);
		expect(cycleIndex(3, 2, -1)).toBe(1);
	});

	test("no selection enters at the leading or trailing end", () => {
		expect(cycleIndex(3, -1, 1)).toBe(0);
		expect(cycleIndex(3, -1, -1)).toBe(2);
	});

	test("an empty list has nothing to select", () => {
		expect(cycleIndex(0, -1, 1)).toBeNull();
	});
});
