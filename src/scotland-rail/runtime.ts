import { useEffect, useRef } from "react";
import type { useShortcutsHelp } from "../shared";
import { railActions, railStore, recomputeActiveTrains } from "./store";
import {
	MAX_REPLAY_TIME,
	MIN_REPLAY_TIME,
	resolveRailShortcut,
	stepSpeed,
} from "./utils";

/**
 * The global shortcuts, the replay clock and the ambient audio, extracted from
 * `App` because they are three independent concerns that happened to share one
 * component: each is bound once, reads live state from the store rather than
 * from props, and would be missed in a diff of the page layout.
 */

/**
 * Elements that own a key the map also binds. Escape and the arrow keys have to
 * reach a focused control rather than the page, or a visitor who tabs to the
 * speed picker cannot use the arrow keys inside it.
 */
const OWNS_ITS_OWN_KEYS = new Set([
	"input",
	"textarea",
	"button",
	"select",
	"a",
]);

/** Roles and states that intercept keys the map also uses. */
const OWNS_SLIDER_KEYS = '[role="slider"], [contenteditable="true"]';

/**
 * Whether the event came from somewhere that handles its own keys. A focused
 * native control first, then an editable region — which is not always
 * focusable through `tabIndex` and so is not covered by the tag check.
 */
const isHandledElsewhere = (): boolean => {
	const active = document.activeElement;
	const tag = active?.tagName.toLowerCase();
	if (tag && OWNS_ITS_OWN_KEYS.has(tag)) return true;
	if (active instanceof HTMLElement) {
		return (
			active.isContentEditable || active.closest(OWNS_SLIDER_KEYS) !== null
		);
	}
	return false;
};

/**
 * Undoes the audio unlock gesture for a shortcut, when turning sound on.
 *
 * Browsers only allow audio to start from a gesture, and a keypress is not one,
 * so the synthesiser would otherwise stay silent until the next click.
 */
const unlockIfEnabling = (nextSound: boolean) => {
	if (!nextSound) return;
	import("./engine/audio").then(({ railAudio }) => railAudio.unlockAudio());
};

/**
 * Binds the always-on keydown handler. It is registered once and reads live
 * state from the store, so a stale closure is impossible by construction.
 *
 * `shortcuts` is read through a ref rather than closed over: `shortcuts.close`
 * is a fresh closure on every render, and listing it as a dependency would
 * rebind the listener on every frame of the replay. The ref is synced after
 * commit and the listener is bound in the effect below it, so the handler can
 * only ever see a value that actually rendered.
 */
export const useRailShortcuts = (
	shortcuts: ReturnType<typeof useShortcutsHelp>,
): void => {
	const shortcutsRef = useRef(shortcuts);
	useEffect(() => {
		shortcutsRef.current = shortcuts;
	});

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			// Auto-repeat and an already-handled key mean another listener owns it.
			if (event.repeat || event.defaultPrevented) return;
			if (isHandledElsewhere()) return;

			const shortcut = resolveRailShortcut(event);
			if (!shortcut) return;

			switch (shortcut.kind) {
				case "toggle-play":
					event.preventDefault();
					railActions.togglePlay();
					break;
				case "scrub":
					event.preventDefault();
					// `setTimeOffset` clamps to the replay window, so holding an
					// arrow key stops at the ends instead of leaving it.
					railActions.setTimeOffset(
						railStore.timeOffset + shortcut.deltaMinutes,
					);
					break;
				case "speed": {
					event.preventDefault();
					const speed = stepSpeed(railStore.speed, shortcut.direction);
					if (speed !== null) railActions.setSpeed(speed);
					break;
				}
				case "toggle-sound": {
					event.preventDefault();
					const nextSound = !railStore.settings.soundEffects;
					unlockIfEnabling(nextSound);
					railActions.updateSetting("soundEffects", nextSound);
					break;
				}
				case "escape": {
					// Ordered outermost-first: a dialog beats a panel, a panel
					// beats the selection underneath it.
					const help = shortcutsRef.current;
					if (help.opened) {
						help.close();
						break;
					}
					if (railStore.isSettingsOpen) {
						railActions.setIsSettingsOpen(false);
					} else if (railStore.isInfoOpen) {
						railActions.setIsInfoOpen(false);
					} else if (railStore.selectedService) {
						railActions.setSelectedService(null);
					}
					break;
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);
};

/**
 * Advances the replay clock while playing.
 *
 * The offset is written straight to the store rather than through
 * `setTimeOffset` so playback keeps sub-minute resolution; the replay window is
 * still enforced here, and only here, by looping back to 05:00.
 */
export const useReplayClock = (isPlaying: boolean, speed: number): void => {
	useEffect(() => {
		if (!isPlaying) return;

		let lastTimestamp = performance.now();
		let animId: number;

		const loop = (timestamp: number) => {
			const deltaMs = timestamp - lastTimestamp;
			lastTimestamp = timestamp;

			// Advance time: speed 1x = 1 minute per real second.
			const minutesToAdd = (deltaMs / 1000) * speed;
			let next = railStore.timeOffset + minutesToAdd;
			if (next >= MAX_REPLAY_TIME) next = MIN_REPLAY_TIME;

			railStore.timeOffset = next;
			recomputeActiveTrains();

			animId = requestAnimationFrame(loop);
		};

		animId = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(animId);
	}, [isPlaying, speed]);
};

/**
 * The ambient bed follows the network: it runs only while playing with trains on
 * the map and sound enabled, and stops otherwise. Stopping is the common case —
 * a visitor who pauses the replay should not keep hearing trains.
 */
export const useAmbientAudio = (
	soundEffects: boolean,
	isPlaying: boolean,
	activeTrainCount: number,
): void => {
	useEffect(() => {
		if (soundEffects && isPlaying && activeTrainCount > 0) {
			import("./engine/audio").then(({ railAudio }) => {
				railAudio.startAmbient(activeTrainCount);
				railAudio.updateIntensity(activeTrainCount);
			});
		} else {
			import("./engine/audio").then(({ railAudio }) => {
				railAudio.stop();
			});
		}
	}, [soundEffects, isPlaying, activeTrainCount]);
};
