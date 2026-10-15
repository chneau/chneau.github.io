import { useEffect, useRef } from "react";
import type { useShortcutsHelp } from "../shared";
import { railActions, railStore, recomputeActiveTrains } from "./store";
import {
	MAX_REPLAY_TIME,
	MIN_REPLAY_TIME,
	resolveRailShortcut,
	stepSpeed,
} from "./utils";

const OWNS_ITS_OWN_KEYS = new Set([
	"input",
	"textarea",
	"button",
	"select",
	"a",
]);

const OWNS_SLIDER_KEYS = '[role="slider"], [contenteditable="true"]';

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

const unlockIfEnabling = (nextSound: boolean) => {
	if (!nextSound) return;
	import("./engine/audio").then(({ railAudio }) => railAudio.unlockAudio());
};

export const useRailShortcuts = (
	shortcuts: ReturnType<typeof useShortcutsHelp>,
): void => {
	const shortcutsRef = useRef(shortcuts);
	useEffect(() => {
		shortcutsRef.current = shortcuts;
	});

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
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

export const useReplayClock = (isPlaying: boolean, speed: number): void => {
	useEffect(() => {
		if (!isPlaying) return;

		let lastTimestamp = performance.now();
		let animId: number;

		const loop = (timestamp: number) => {
			const deltaMs = timestamp - lastTimestamp;
			lastTimestamp = timestamp;

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
