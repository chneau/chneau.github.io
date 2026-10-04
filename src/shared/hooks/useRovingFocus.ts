import { type KeyboardEvent, type RefObject, useCallback } from "react";

/**
 * Focusability, as the dropdowns in the shared chrome agree on it.
 *
 * Queried by focusability rather than by tag name, so a row can hold an anchor
 * and a button side by side. `a[href]` rather than `a` because an anchor without
 * an `href` is not focusable and is not a link; `button:not([disabled])` because a
 * disabled button takes no focus and roving focus must skip it.
 *
 * Shared because both menus used to carry their own copy and they had drifted:
 * one queried `a[href], button:not([disabled])` and the other `a, button`, so the
 * same key press moved focus differently depending on which menu was open, and
 * `ArrowUp` from an un-focused position landed on the second-to-last item rather
 * than the last.
 */
export const FOCUSABLE_SELECTOR = "a[href], button:not([disabled])";

type RovingFocusOptions = {
	/** The open menu; its `current` is queried on every keydown. */
	menuRef: RefObject<HTMLElement | null>;
	/** Closes the menu. `true` restores focus to the trigger. */
	close: (restoreFocus?: boolean) => void;
};

/**
 * A keydown handler that moves focus across a menu's controls, plus the two
 * behaviours that go with it.
 *
 * `focusFirst` is separate because opening a menu and arrowing within one want
 * the same list but not the same entry point: opening should land on the first
 * control, and the initial-focus call sites had drifted the same way the selector
 * had.
 *
 * Extracted rather than written twice because the two copies were already
 * diverging, and a divergence in a keyboard contract is invisible until someone
 * uses the keyboard.
 */
export const useRovingFocus = ({
	menuRef,
	close,
}: RovingFocusOptions): {
	focusFirst: () => void;
	onKeyDown: (event: KeyboardEvent<Element>) => void;
} => {
	const controls = useCallback((): HTMLElement[] => {
		return Array.from(
			menuRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
		);
	}, [menuRef]);

	/** Focus the first control, as opening a menu should. */
	const focusFirst = useCallback((): void => {
		controls()[0]?.focus();
	}, [controls]);

	const onKeyDown = useCallback(
		(event: KeyboardEvent<Element>) => {
			const items = controls();
			if (items.length === 0) return;
			// −1 when focus is outside the menu, which happens on the first key
			// press after a reopen. Treated as "from the start" so `ArrowUp` lands
			// on the last item rather than `items[length - 2]`.
			// `at` is −1 when focus is on the menu container rather than on one of
			// its controls. The two directions then need different origins, and
			// getting this wrong is invisible until someone reopens a menu and
			// presses an arrow:
			//
			//   ArrowDown from "nowhere" lands on the FIRST control, which is what
			//     the arithmetic already did with a −1.
			//   ArrowUp from "nowhere" lands on the LAST control, so its origin has
			//     to be 0. With −1 it computed `items[-2 + length]` and skipped the
			//     last item entirely — in both menus, because the arithmetic had been
			//     copied along with the bug.
			//
			// Clamping both to 0 is the tempting wrong answer: it fixes up and breaks
			// down, which is exactly what a first attempt here did.
			const at = items.indexOf(document.activeElement as HTMLElement);
			const last = items.length - 1;
			// Written out rather than folded into the modulo: "from nowhere" is a
			// different question from "one step", and expressing it as an index
			// adjustment is what made the two directions disagree in the first
			// place.
			const down = at < 0 ? 0 : (at + 1) % items.length;
			const up = at < 0 ? last : (at - 1 + items.length) % items.length;

			switch (event.key) {
				case "Escape":
					event.preventDefault();
					close(true);
					break;
				case "ArrowDown":
					event.preventDefault();
					items[down]?.focus();
					break;
				case "ArrowUp":
					event.preventDefault();
					items[up]?.focus();
					break;
				case "Home":
					event.preventDefault();
					items[0]?.focus();
					break;
				case "End":
					event.preventDefault();
					items[items.length - 1]?.focus();
					break;
				case "Tab":
					// Let focus leave, but close behind it: the menu is a popup and
					// must not survive the user tabbing away from it.
					close();
					break;
				default:
					break;
			}
		},
		[close, controls],
	);

	return { focusFirst, onKeyDown };
};
