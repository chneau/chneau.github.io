import { forwardRef, type MouseEvent, type ReactNode, type Ref } from "react";

type HeaderActionProps = {
	/** Accessible label and native tooltip text. */
	label?: string;
	icon?: ReactNode;
	/** Optional visible text; hidden on narrow screens by `.app-header-action__label`. */
	children?: ReactNode;
	onClick?: (event: MouseEvent) => void;
	href?: string;
	target?: string;
	/** Filled, accent-coloured control (one per bar at most). */
	accent?: boolean;
	/** Square control with no text label. */
	iconOnly?: boolean;
	/**
	 * Name shown when this control is collapsed into the narrow-screen overflow
	 * menu, where a bare icon is not a label. Falls back to `label`.
	 *
	 * Override it only where `label` is too long to read as a menu row — a label
	 * carrying a keyboard hint ("Print or save as PDF (Ctrl+P)") is a fine
	 * tooltip and a poor list entry.
	 */
	menuLabel?: string;
	/** Toggled-on state. */
	active?: boolean;
	/** Disabled controls are dimmed and inert. */
	disabled?: boolean;
	/** Marks the control as busy; also disables it. */
	loading?: boolean;
	/** For controls that open a menu. */
	ariaExpanded?: boolean;
	ariaHaspopup?: "menu" | "dialog" | "listbox" | "tree" | "grid";
	/** id of the element this control owns (e.g. the menu it opens). */
	ariaControls?: string;
	/** Toggle state for assistive tech; defaults to `active` when set. */
	ariaPressed?: boolean;
	/** Optional DOM id, useful when something references this control. */
	id?: string;
	className?: string;
	/**
	 * ARIA role override, used when the control is rendered inside a
	 * `role="menu"` as one of its items. Stated explicitly rather than spread
	 * from a clone, so the role a control ends up with is always visible at the
	 * point it is set.
	 */
	role?: string;
};

/**
 * The class list, built in one place because the same string has to appear on
 * both shapes: `.app-header-action__menulabel` is matched against this control's
 * class by the overflow menu, and a control that grew a second copy of the list
 * would stop being collected into that menu.
 */
const actionClassName = ({
	iconOnly,
	accent,
	active,
	className,
}: Pick<HeaderActionProps, "iconOnly" | "accent" | "active" | "className">) =>
	[
		"app-header-action",
		iconOnly ? "app-header-action--icon" : undefined,
		accent ? "app-header-action--accent" : undefined,
		active ? "app-header-action--active" : undefined,
		className,
	]
		.filter(Boolean)
		.join(" ");

/**
 * The attributes both an anchor and a button carry. Written once because the
 * label is three attributes here — the accessible name, the tooltip and the
 * menu entry — and a control missing one of them answers to a different name
 * depending on where it is rendered.
 */
const sharedAria = ({
	label,
	ariaExpanded,
	ariaHaspopup,
	ariaControls,
}: Pick<
	HeaderActionProps,
	"label" | "ariaExpanded" | "ariaHaspopup" | "ariaControls"
>) =>
	({
		"aria-label": label,
		"aria-expanded": ariaExpanded,
		"aria-haspopup": ariaHaspopup,
		"aria-controls": ariaControls,
		title: label,
	}) as const;

/**
 * What the control shows: its icon, then its text label if it has one, then
 * the menu-only label.
 */
const ActionContent = ({
	icon,
	children,
	menuLabel,
}: Pick<HeaderActionProps, "icon" | "children" | "menuLabel">) => (
	<>
		{icon}
		{children ? (
			<span className="app-header-action__label">{children}</span>
		) : null}
		{/*
		 * An `iconOnly` control carries no `label` span, so the overflow menu used
		 * to render it as a bare icon: five controls across the site (back home,
		 * theme, shortcuts, palette, GitHub) with nothing to read. This carries the
		 * same text, shown only inside the menu — `display: none` by default,
		 * because the bar has no room for it and that is the whole reason the menu
		 * exists.
		 */}
		{!children && menuLabel !== undefined ? (
			<span className="app-header-action__menulabel">{menuLabel}</span>
		) : null}
	</>
);

/** A 36px navbar control. Use `iconOnly`, otherwise text sits beside the icon. */
export const HeaderAction = forwardRef<
	HTMLButtonElement | HTMLAnchorElement,
	HeaderActionProps
>(
	(
		{
			label,
			icon,
			children,
			onClick,
			href,
			target,
			accent,
			iconOnly,
			menuLabel,
			active,
			disabled,
			loading,
			ariaExpanded,
			ariaHaspopup,
			ariaControls,
			ariaPressed,
			id,
			className,
			role,
		},
		ref,
	) => {
		const inert = disabled || loading;
		const pressed = ariaPressed ?? (active === undefined ? undefined : active);
		const aria = sharedAria({
			label,
			ariaExpanded,
			ariaHaspopup,
			ariaControls,
		});
		const content = (
			<ActionContent icon={icon} menuLabel={menuLabel}>
				{children}
			</ActionContent>
		);
		const classes = actionClassName({ iconOnly, accent, active, className });

		if (href) {
			return (
				<a
					ref={ref as Ref<HTMLAnchorElement>}
					id={id}
					className={classes}
					role={role}
					{...aria}
					href={inert ? undefined : href}
					target={target}
					rel={target === "_blank" ? "noreferrer" : undefined}
					aria-busy={loading || undefined}
					aria-disabled={inert || undefined}
					onClick={inert ? undefined : onClick}
				>
					{content}
				</a>
			);
		}

		return (
			<button
				ref={ref as Ref<HTMLButtonElement>}
				type="button"
				id={id}
				className={classes}
				role={role}
				{...aria}
				aria-pressed={pressed}
				aria-busy={loading || undefined}
				disabled={inert}
				onClick={onClick}
			>
				{content}
			</button>
		);
	},
);

HeaderAction.displayName = "HeaderAction";
