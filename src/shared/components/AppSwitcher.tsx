import { LayoutGrid, Pin } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ALL_APPS, type AppEntry } from "../apps";
import { useRovingFocus } from "../hooks/useRovingFocus";
import { formatRelativeTime, usePinnedApps, useRecents } from "../recent";
import { HeaderAction } from "./HeaderAction";

type AppSwitcherProps = {
	current?: string;
};

const MAX_VISIBLE_RECENTS = 3;

const isCurrentPath = (app: AppEntry, path: string): boolean =>
	app.href === "/" ? path === "/" : path.startsWith(app.href);

export const AppSwitcher = ({ current }: AppSwitcherProps) => {
	const [open, setOpen] = useState(false);
	const container = useRef<HTMLElement>(null);
	const trigger = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	const menuId = useId();

	const { recents, visit } = useRecents();
	const { pinned, toggle: togglePin, isPinned } = usePinnedApps();

	const close = (restoreFocus = false) => {
		setOpen(false);
		if (restoreFocus) trigger.current?.focus();
	};

	const { focusFirst, onKeyDown } = useRovingFocus({ menuRef: menu, close });

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
		if (open) focusFirst();
	}, [open, focusFirst]);

	const path =
		current ?? (typeof window === "undefined" ? "/" : window.location.pathname);

	const currentHref = useMemo(
		() => ALL_APPS.find((app) => isCurrentPath(app, path))?.href,
		[path],
	);

	useEffect(() => {
		if (currentHref !== undefined) visit(currentHref);
	}, [currentHref, visit]);

	const lastSeenAt = useMemo(() => {
		const map = new Map<string, number>();
		for (const entry of recents) {
			if (!map.has(entry.href)) map.set(entry.href, entry.at);
		}
		return map;
	}, [recents]);

	const { pinnedApps, recentApps } = useMemo(() => {
		const pinnedSet = new Set(pinned);
		return {
			pinnedApps: ALL_APPS.filter((app) => pinnedSet.has(app.href)),
			recentApps: [...recents]
				.sort((a, b) => b.at - a.at)
				.map((entry) => ALL_APPS.find((app) => app.href === entry.href))
				.filter(
					(app): app is AppEntry =>
						app !== undefined &&
						!pinnedSet.has(app.href) &&
						app.href !== currentHref,
				)
				.slice(0, MAX_VISIBLE_RECENTS),
		};
	}, [currentHref, pinned, recents]);

	const remaining = useMemo(() => {
		const shown = new Set(
			[...pinnedApps, ...recentApps].map((app) => app.href),
		);
		return ALL_APPS.filter((app) => !shown.has(app.href));
	}, [pinnedApps, recentApps]);

	const renderRow = (app: AppEntry, { compact = false } = {}) => {
		const isCurrent = isCurrentPath(app, path);
		const Icon = app.icon;
		const at = lastSeenAt.get(app.href);
		const pinLabel = isPinned(app.href)
			? `Unpin ${app.title}`
			: `Pin ${app.title} to the top`;
		return (
			<div className="app-switcher__row" key={app.href}>
				<a
					role="menuitem"
					href={app.href}
					className={`app-switcher__item${
						isCurrent ? " app-switcher__item--current" : ""
					}`}
					aria-current={isCurrent ? "page" : undefined}
					onClick={() => {
						visit(app.href);
						setOpen(false);
					}}
				>
					<span className="app-switcher__icon" aria-hidden="true">
						<Icon size={16} />
					</span>
					<span className="app-switcher__text">
						<span className="app-switcher__label">{app.title}</span>
						<span className="app-switcher__tag">
							{compact && at !== undefined ? formatRelativeTime(at) : app.tag}
						</span>
					</span>
				</a>
				<button
					type="button"
					role="menuitemcheckbox"
					className="app-header-action app-header-action--icon"
					aria-checked={isPinned(app.href)}
					aria-label={pinLabel}
					title={pinLabel}
					onClick={() => togglePin(app.href)}
				>
					<Pin
						size={14}
						strokeWidth={2}
						aria-hidden="true"
						style={isPinned(app.href) ? { fill: "currentColor" } : undefined}
					/>
				</button>
			</div>
		);
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
					onKeyDown={onKeyDown}
				>
					{pinnedApps.length > 0 ? (
						// biome-ignore lint/a11y/useSemanticElements: menu > group > menuitem is the ARIA menu pattern, not a form
						<div role="group" aria-label="Pinned apps">
							{pinnedApps.map((app) => renderRow(app))}
						</div>
					) : null}
					{recentApps.length > 0 ? (
						// biome-ignore lint/a11y/useSemanticElements: menu > group > menuitem is the ARIA menu pattern, not a form
						<div role="group" aria-label="Recently opened apps">
							{recentApps.map((app) => renderRow(app, { compact: true }))}
						</div>
					) : null}
					{remaining.length > 0 ? (
						// biome-ignore lint/a11y/useSemanticElements: menu > group > menuitem is the ARIA menu pattern, not a form
						<div role="group" aria-label="All apps">
							{remaining.map((app) => renderRow(app))}
						</div>
					) : null}
				</div>
			)}
		</nav>
	);
};
