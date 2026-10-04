import { LayoutGrid, Pin } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ALL_APPS, type AppEntry } from "../apps";
import { useRovingFocus } from "../hooks/useRovingFocus";
import { formatRelativeTime, usePinnedApps, useRecents } from "../recent";
import { HeaderAction } from "./HeaderAction";

type AppSwitcherProps = {
	/** Current pathname; defaults to `window.location.pathname`. */
	current?: string;
};

/** How many recents to surface above the full list. */
const MAX_VISIBLE_RECENTS = 3;

/**
 * Whether `path` is inside `app`. The dashboard is only the exact root, so
 * `/` must not match every other entry by prefix.
 */
const isCurrentPath = (app: AppEntry, path: string): boolean =>
	app.href === "/" ? path === "/" : path.startsWith(app.href);

/**
 * A dropdown in the navbar that jumps between every app.
 *
 * On top of the full registry it surfaces what this browser actually uses: the
 * apps opened most recently, and the ones pinned to the top, both read from
 * `localStorage` through `usePersistentState`. Both are strictly additive —
 * with an empty store this renders exactly the plain list of every app, and
 * the full registry is always rendered, so no app can become unreachable.
 */
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

	// Keyboard contract shared with `HeaderOverflow`, so the two dropdowns cannot
	// drift: same focusability selector, same arrow maths, same Escape/Tab.
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

	/**
	 * Record the app this page belongs to. The switcher is the only shared
	 * chrome rendered on every app, so it is the one place that can observe a
	 * visit to an app reached by deep link, a bookmark or a typed URL — the
	 * dashboard can only ever see clicks on its own cards. Recording the
	 * *current* app is what makes "jump back to where I was" work from inside a
	 * sub-app, which is the whole point of the feature.
	 *
	 * `visit` is stable (its setter is a `useCallback` over module constants),
	 * so this does not re-fire on unrelated renders, and it runs after paint so
	 * it never delays first render.
	 */
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

	/**
	 * The menu is ordered pinned → recent → the rest of the registry, each in
	 * registry order so neither can shuffle the underlying list. An app already
	 * shown as pinned is not repeated in the recents strip, and the app you are
	 * already on is not offered as somewhere to jump back to.
	 *
	 * Because the switcher records the current app on mount, dropping the
	 * current app here is also what keeps a first-time visitor — who by
	 * definition has no other recents — on exactly the plain list they saw
	 * before this feature existed.
	 */
	const { pinnedApps, recentApps } = useMemo(() => {
		const pinnedSet = new Set(pinned);
		return {
			pinnedApps: ALL_APPS.filter((app) => pinnedSet.has(app.href)),
			// Sort by timestamp rather than trusting the stored order: a payload
			// written by an older build, or one written by two tabs racing, can
			// list entries out of sequence, and "most recent first" is the whole
			// contract of this strip.
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

	// Recents are echoed at the top but every app still appears in "All apps",
	// so the full registry stays reachable regardless of what is pinned.
	const remaining = useMemo(() => {
		const shown = new Set(
			[...pinnedApps, ...recentApps].map((app) => app.href),
		);
		return ALL_APPS.filter((app) => !shown.has(app.href));
	}, [pinnedApps, recentApps]);

	/**
	 * Roving focus across every focusable thing in the menu — app links and pin
	 * buttons alike. Querying by focusability rather than by tag name keeps
	 * arrows working now that each row can hold a button after its link.
	 */

	/**
	 * One row: the app link plus a pin toggle. The link keeps the
	 * `.app-switcher__item` styling so the existing hover, current-app and
	 * forced-colors rules apply unchanged.
	 *
	 * The toggle is a `menuitemcheckbox` rather than a plain `aria-pressed`
	 * button: `role="menu"` only admits menuitem/menuitemcheckbox children, and
	 * a bare `<button>` there is an `aria-required-children` violation. A
	 * checkbox role also matches the affordance — it is a two-state toggle, and
	 * `aria-checked` is what a screen reader announces for it.
	 */
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
