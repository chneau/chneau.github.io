export const MIN_REPLAY_TIME = 300;

export const MAX_REPLAY_TIME = 1440;

export const clampReplayTime = (minutes: number): number =>
	Math.min(MAX_REPLAY_TIME, Math.max(MIN_REPLAY_TIME, Math.round(minutes)));

export const formatTime = (minutes: number | null): string => {
	if (minutes === null || !Number.isFinite(minutes)) return "—";
	const total = Math.max(0, Math.floor(minutes));
	const h = Math.floor(total / 60);
	const m = total % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

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

const SPEEDS = [0.5, 1, 2, 5, 15] as const;

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

export const stepSpeed = (speed: number, direction: 1 | -1): number | null => {
	const idx = (SPEEDS as readonly number[]).indexOf(speed);
	if (idx === -1) return null;
	const next = SPEEDS[idx + direction];
	return next === undefined ? null : next;
};
