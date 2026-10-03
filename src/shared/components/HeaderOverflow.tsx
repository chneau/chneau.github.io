import { useMediaQuery } from "@mantine/hooks";
import { MoreHorizontal } from "lucide-react";
import {
	Children,
	isValidElement,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";

/**
 * Controls that do not fit a phone's navbar, inline on a wide one.
 *
 * Measured at 360px with touch, the apps carry five to ten header controls at a
 * 44px hit area: birthday's row alone is 494px in a 360px viewport.
 * `.app-header__actions` is `flex: none` and the brand is what names the app, so
 * the actions win and the brand collapses to zero width — the app stops saying
 * which app you are in, and the row pushes the document sideways.
 *
 * So on a narrow screen the app declares only `BackHome` and the app switcher
 * inline and hands everything else to this, which puts it behind one "More"
 * control. The header stays a single 56px row.
 *
 * The breakpoint is 1100px rather than a phone width because the constraint is
 * not "is this a phone" but "do the controls fit": birthday's ten controls need
 * ~1000px, which overflows a 768px tablet just as badly as a 360px phone. A
 * desktop bar only goes inline again once there is genuinely room for it.
 *
 * A horizontally scrollable strip is the other option and it is the wrong one
 * here for a specific reason: `AppSwitcher`'s dropdown lives *inside* the
 * actions row, so any scroll container there clips the one menu that must stay
 * reachable.
 *
 * The menu mirrors `AppSwitcher`'s own dropdown contract — roving arrow-key
 * focus, Escape closing and restoring focus to the trigger — so the two menus
 * in a bar behave identically under the keyboard. That is why it is hand-rolled
 * rather than delegating to Mantine's `Menu`, whose `Menu.Item` cannot adopt an
 * existing `HeaderAction` without every app rebuilding its controls.
 *
 * Above the breakpoint the children render inline and no trigger appears at
 * all, so a desktop bar is unchanged and pays nothing for this component.
 */
export const HeaderOverflow = ({ children }: { children: React.ReactNode }) => {
	const isNarrow = useMediaQuery("(max-width: 1100px)");
	const [open, setOpen] = useState(false);
	const container = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLFieldSetElement>(null);
	const menuId = useId();

	// A resize out of narrow mode must not leave an orphaned open menu behind.
	useEffect(() => {
		if (!isNarrow) setOpen(false);
	}, [isNarrow]);

	const close = (restoreFocus = false) => {
		setOpen(false);
		if (restoreFocus) trigger.current?.focus();
	};

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (!container.current?.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [open]);

	useEffect(() => {
		if (open) {
			menu.current?.querySelector<HTMLElement>("a, button")?.focus();
		}
	}, [open]);

	if (isNarrow === false) {
		return <>{children}</>;
	}

	/**
	 * The menu is a labelled `group`, not a `menu`.
	 *
	 * A `role="menu"` admits only menuitem children, which would mean every
	 * control in here has to accept and forward a `role` prop — and three of
	 * them do not: `SchemeToggle`, `ShortcutsHelpButton`, and any action wrapped
	 * in a Mantine `Tooltip` (which renders its child, so the role would land on
	 * the wrapper and never reach the button). Those landed in the menu
	 * unlabelled, which is an `aria-required-children` violation. A group
	 * imposes no such contract on its children, so a control is whatever the
	 * app already made it — a link or a button, with its own name and state.
	 *
	 * `AppSwitcher` keeps true `menu` semantics because its rows are always its
	 * own `menuitem` links; the two differ deliberately rather than by accident.
	 *
	 * The children are wrapped only to hang the switcher's row styling off them,
	 * which keeps a menu entry looking like the app list beside it.
	 */
	const items = Children.map(children, (child) =>
		isValidElement(child) ? (
			<div role="none" className="app-header-overflow__row">
				{child}
			</div>
		) : (
			child
		),
	);

	/**
	 * Roving focus across the menu's controls. Querying by focusability rather
	 * than by tag name is what lets the list hold an anchor and a button side by
	 * side, exactly as `AppSwitcher` does.
	 */
	const onMenuKeyDown = (event: React.KeyboardEvent<HTMLFieldSetElement>) => {
		const focusable = Array.from(
			menu.current?.querySelectorAll<HTMLElement>(
				"a[href], button:not([disabled])",
			) ?? [],
		);
		if (focusable.length === 0) return;
		const index = focusable.indexOf(document.activeElement as HTMLElement);
		if (event.key === "Escape") {
			event.preventDefault();
			close(true);
		} else if (event.key === "ArrowDown") {
			event.preventDefault();
			focusable[(index + 1) % focusable.length]?.focus();
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			focusable[(index - 1 + focusable.length) % focusable.length]?.focus();
		} else if (event.key === "Home") {
			event.preventDefault();
			focusable[0]?.focus();
		} else if (event.key === "End") {
			event.preventDefault();
			focusable[focusable.length - 1]?.focus();
		} else if (event.key === "Tab") {
			close();
		}
	};

	return (
		<div className="app-header-overflow" ref={container}>
			<button
				ref={trigger}
				type="button"
				className="app-header-action app-header-action--icon app-header-overflow__trigger"
				aria-label="More actions"
				title="More actions"
				aria-haspopup="true"
				aria-expanded={open}
				aria-controls={menuId}
				onClick={() => setOpen((value) => !value)}
			>
				<MoreHorizontal size={16} aria-hidden="true" />
			</button>
			{open ? (
				<fieldset
					ref={menu}
					id={menuId}
					className="app-switcher__menu app-header-overflow__menu"
					onKeyDown={onMenuKeyDown}
				>
					<legend className="sr-only">More actions</legend>
					{items}
				</fieldset>
			) : null}
		</div>
	);
};
