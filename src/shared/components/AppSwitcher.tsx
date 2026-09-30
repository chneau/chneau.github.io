import { LayoutGrid } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ALL_APPS } from "../apps";
import { HeaderAction } from "./HeaderAction";

type AppSwitcherProps = {
	/** Current pathname; defaults to `window.location.pathname`. */
	current?: string;
};

/** A dropdown in the navbar that jumps between every app. */
export const AppSwitcher = ({ current }: AppSwitcherProps) => {
	const [open, setOpen] = useState(false);
	const container = useRef<HTMLElement>(null);
	const trigger = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	const menuId = useId();

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
			menu.current?.querySelector<HTMLAnchorElement>("a")?.focus();
		}
	}, [open]);

	const path =
		current ?? (typeof window === "undefined" ? "/" : window.location.pathname);

	const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		const items = Array.from(
			menu.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [],
		);
		if (items.length === 0) return;
		const index = items.indexOf(document.activeElement as HTMLAnchorElement);
		if (event.key === "Escape") {
			event.preventDefault();
			close(true);
		} else if (event.key === "ArrowDown") {
			event.preventDefault();
			items[(index + 1) % items.length]?.focus();
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			items[(index - 1 + items.length) % items.length]?.focus();
		} else if (event.key === "Home") {
			event.preventDefault();
			items[0]?.focus();
		} else if (event.key === "End") {
			event.preventDefault();
			items[items.length - 1]?.focus();
		} else if (event.key === "Tab") {
			close();
		}
	};

	return (
		<nav className="app-switcher" aria-label="Apps" ref={container}>
			<HeaderAction
				ref={trigger}
				iconOnly
				active={open}
				label="Switch app"
				ariaHaspopup="menu"
				ariaExpanded={open}
				ariaControls={menuId}
				icon={<LayoutGrid size={16} />}
				onClick={() => setOpen((value) => !value)}
			/>
			{open && (
				<div
					ref={menu}
					id={menuId}
					className="app-switcher__menu"
					role="menu"
					aria-label="Switch app"
					onKeyDown={onMenuKeyDown}
				>
					{ALL_APPS.map((app) => {
						const isCurrent =
							app.href === "/" ? path === "/" : path.startsWith(app.href);
						const Icon = app.icon;
						return (
							<a
								key={app.href}
								role="menuitem"
								href={app.href}
								className={`app-switcher__item${
									isCurrent ? " app-switcher__item--current" : ""
								}`}
								aria-current={isCurrent ? "page" : undefined}
								onClick={() => setOpen(false)}
							>
								<span className="app-switcher__icon">
									<Icon size={16} />
								</span>
								<span className="app-switcher__text">
									<span className="app-switcher__label">{app.title}</span>
									<span className="app-switcher__tag">{app.tag}</span>
								</span>
							</a>
						);
					})}
				</div>
			)}
		</nav>
	);
};
