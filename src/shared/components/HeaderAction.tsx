import { forwardRef, type MouseEvent, type ReactNode, type Ref } from "react";

type HeaderActionProps = {
	label?: string;
	icon?: ReactNode;
	children?: ReactNode;
	onClick?: (event: MouseEvent) => void;
	href?: string;
	target?: string;
	accent?: boolean;
	iconOnly?: boolean;
	menuLabel?: string;
	active?: boolean;
	disabled?: boolean;
	loading?: boolean;
	ariaExpanded?: boolean;
	ariaHaspopup?: "menu" | "dialog" | "listbox" | "tree" | "grid";
	ariaControls?: string;
	ariaPressed?: boolean;
	id?: string;
	className?: string;
	role?: string;
};

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
		{!children && menuLabel !== undefined ? (
			<span className="app-header-action__menulabel">{menuLabel}</span>
		) : null}
	</>
);

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
