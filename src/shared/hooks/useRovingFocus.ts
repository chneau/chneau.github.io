import { type KeyboardEvent, type RefObject, useCallback } from "react";

export const FOCUSABLE_SELECTOR = "a[href], button:not([disabled])";

type RovingFocusOptions = {
	menuRef: RefObject<HTMLElement | null>;
	close: (restoreFocus?: boolean) => void;
};

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

	const focusFirst = useCallback((): void => {
		controls()[0]?.focus();
	}, [controls]);

	const onKeyDown = useCallback(
		(event: KeyboardEvent<Element>) => {
			const items = controls();
			if (items.length === 0) return;
			const at = items.indexOf(document.activeElement as HTMLElement);
			const last = items.length - 1;
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
