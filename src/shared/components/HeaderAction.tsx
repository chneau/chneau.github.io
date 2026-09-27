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
	/** Toggled-on state. */
	active?: boolean;
	/** Disabled controls are dimmed and inert. */
	disabled?: boolean;
	/** Marks the control as busy; also disables it. */
	loading?: boolean;
	/** For controls that open a menu. */
	ariaExpanded?: boolean;
	ariaHaspopup?: "menu" | "dialog" | "listbox" | "tree" | "grid";
	/** Toggle state for assistive tech; defaults to `active` when set. */
	ariaPressed?: boolean;
	className?: string;
};

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
			active,
			disabled,
			loading,
			ariaExpanded,
			ariaHaspopup,
			ariaPressed,
			className,
		},
		ref,
	) => {
		const inert = disabled || loading;
		const pressed = ariaPressed ?? (active === undefined ? undefined : active);
		const classes = [
			"app-header-action",
			iconOnly ? "app-header-action--icon" : undefined,
			accent ? "app-header-action--accent" : undefined,
			active ? "app-header-action--active" : undefined,
			className,
		]
			.filter(Boolean)
			.join(" ");

		const content = (
			<>
				{icon}
				{children ? (
					<span className="app-header-action__label">{children}</span>
				) : null}
			</>
		);

		if (href) {
			return (
				<a
					ref={ref as Ref<HTMLAnchorElement>}
					className={classes}
					href={inert ? undefined : href}
					target={target}
					rel={target === "_blank" ? "noreferrer" : undefined}
					aria-label={label}
					aria-disabled={inert || undefined}
					title={label}
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
				className={classes}
				aria-label={label}
				title={label}
				aria-expanded={ariaExpanded}
				aria-haspopup={ariaHaspopup}
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
