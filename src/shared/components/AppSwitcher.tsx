import { LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ALL_APPS } from "../apps";
import { HeaderAction } from "./HeaderAction";

type AppSwitcherProps = {
	/** Current pathname; defaults to `window.location.pathname`. */
	current?: string;
};

/** A dropdown in the navbar that jumps between every app. */
export const AppSwitcher = ({ current }: AppSwitcherProps) => {
	const [open, setOpen] = useState(false);
	const container = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (!container.current?.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	const path =
		current ?? (typeof window === "undefined" ? "/" : window.location.pathname);

	return (
		<div className="app-switcher" ref={container}>
			<HeaderAction
				iconOnly
				active={open}
				label="Switch app"
				ariaHaspopup="menu"
				ariaExpanded={open}
				icon={<LayoutGrid size={16} />}
				onClick={() => setOpen((value) => !value)}
			/>
			{open && (
				<div className="app-switcher__menu" role="menu">
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
		</div>
	);
};
