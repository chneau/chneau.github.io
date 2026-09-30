/** Earliest scrubbable time of the replay, in minutes from 00:00 (05:00). */
export const MIN_REPLAY_TIME = 300;

/** End of the replay day, in minutes from 00:00. Rendered as "24:00". */
export const MAX_REPLAY_TIME = 1440;

/**
 * The replay clock, constrained to the window the UI exposes.
 *
 * Lives here - a dependency-free module - because both the store and the
 * shareable URL must agree on it: `url.ts` used to clamp on its own, so a
 * `setTimeOffset(1455)` left the store at 1455 while the link recorded
 * `?t=1440`, and reloading that link silently moved the replay by 15 minutes
 * while the scrubber thumb stayed pinned at 100%. One clamp, imported by both
 * sides, removes the second source of truth.
 *
 * The result is rounded to whole minutes because that is the resolution a
 * shareable link can carry. Only user-initiated jumps go through it; the
 * animation loop writes fractional minutes straight to the store so playback
 * stays smooth.
 */
export const clampReplayTime = (minutes: number): number =>
	Math.min(MAX_REPLAY_TIME, Math.max(MIN_REPLAY_TIME, Math.round(minutes)));

/**
 * Render a minute-from-midnight clock as HH:MM.
 *
 * The hour is NOT wrapped with `% 24`: 1440 is the *end* of the replay day,
 * not midnight of it, and wrapping made the scrubber's right-hand end
 * indistinguishable from 00:00 the previous day. Hours past 24 (timetable
 * calls that land after midnight) keep counting, so 1475 reads 24:35.
 */
export const formatTime = (minutes: number | null): string => {
	if (minutes === null || !Number.isFinite(minutes)) return "—";
	// Clamp before decomposing: a negative value would otherwise decompose to
	// negative hours and minutes ("-1:-1").
	const total = Math.max(0, Math.floor(minutes));
	const h = Math.floor(total / 60);
	const m = total % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/** The keyboard-event state a shortcut decision depends on. */
export type RailShortcutEvent = {
	code: string;
	key: string;
	shiftKey: boolean;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
};

type RailShortcut =
	| { kind: "toggle-play" }
	| { kind: "scrub"; deltaMinutes: number }
	| { kind: "speed"; direction: 1 | -1 }
	| { kind: "toggle-sound" }
	| { kind: "escape" };

/** Playback speeds offered by the keyboard and the speed control. */
const SPEEDS = [0.5, 1, 2, 5, 15] as const;

/**
 * Map a key event to a replay shortcut, or `null` when it is not ours.
 *
 * Pure so the shortcut table can be tested without a DOM. Note the modifier
 * rule: Cmd/Ctrl/Alt combinations belong to the OS and the browser - Cmd+M
 * minimises the window on macOS, Ctrl+M is a terminal chord, Cmd+Left is
 * "back" - so a shortcut must never claim them (nor call `preventDefault` on
 * them). Shift is the one deliberate in-app modifier, used for coarse
 * scrubbing.
 */
export const resolveRailShortcut = (
	e: RailShortcutEvent,
): RailShortcut | null => {
	const isChord = e.metaKey || e.ctrlKey || e.altKey;

	if (e.code === "Space") return { kind: "toggle-play" };
	if (e.code === "ArrowLeft") {
		return { kind: "scrub", deltaMinutes: e.shiftKey ? -15 : -5 };
	}
	if (e.code === "ArrowRight") {
		return { kind: "scrub", deltaMinutes: e.shiftKey ? 15 : 5 };
	}
	if (e.code === "ArrowUp") return { kind: "speed", direction: 1 };
	if (e.code === "ArrowDown") return { kind: "speed", direction: -1 };
	if (e.key === "m" || e.key === "M") {
		return isChord ? null : { kind: "toggle-sound" };
	}
	if (e.code === "Escape") return { kind: "escape" };
	return null;
};

/**
 * The index of the next/previous offered playback speed, or `null` at the end
 * of the list. Shared by the keyboard handler and the speed control.
 */
export const stepSpeed = (speed: number, direction: 1 | -1): number | null => {
	const idx = (SPEEDS as readonly number[]).indexOf(speed);
	if (idx === -1) return null;
	const next = SPEEDS[idx + direction];
	return next === undefined ? null : next;
};
