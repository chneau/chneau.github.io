import { Badge } from "@mantine/core";
import { ArrowRight, Pin } from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";
import type { AppEntry } from "../apps";
import { formatRelativeTime } from "../recent";

type AppCardProps = {
	item: AppEntry;
	/** Position in the grid, used to stagger the entrance animation. */
	index?: number;
	/** Whether the app is currently pinned (favourite). */
	pinned?: boolean;
	/** Timestamp of the last visit, if the app was opened before. */
	lastVisitedAt?: number;
	/** Toggle pin state; omit to hide the pin control. */
	onTogglePin?: (href: string) => void;
	/** Called before navigating, so the visit can be recorded. */
	onVisit?: (href: string) => void;
};

/**
 * The dashboard's app tile. The whole surface is a single link (a stretched
 * link via `.app-card__link`) so pointer and keyboard users get the same
 * target; the pin control is a real button layered on top.
 */
export const AppCard = ({
	item,
	index = 0,
	pinned = false,
	lastVisitedAt,
	onTogglePin,
	onVisit,
}: AppCardProps) => {
	const Icon = item.icon;

	const handleVisit = (_event: MouseEvent<HTMLAnchorElement>) => {
		onVisit?.(item.href);
	};

	const style = { "--app-index": index } as CSSProperties;

	return (
		<article className="app-card app-rise" style={style}>
			<a
				className="app-card__link"
				href={item.href}
				aria-label={`Open ${item.title} — ${item.tag}`}
				onClick={handleVisit}
			>
				<span className="app-card__icon" aria-hidden="true">
					<Icon size={24} strokeWidth={1.5} />
				</span>
				<span className="app-card__body">
					<span className="app-card__head">
						<span className="app-card__title">{item.title}</span>
						<Badge
							className="app-card__tag"
							variant="light"
							color={item.tagColor}
							tt="none"
							fw={600}
							size="sm"
						>
							{item.tag}
						</Badge>
					</span>
					<span className="app-card__desc">{item.description}</span>
					<span className="app-card__foot">
						{lastVisitedAt ? (
							<span className="app-card__visited">
								Visited {formatRelativeTime(lastVisitedAt)}
							</span>
						) : (
							<span className="app-card__visited app-card__visited--new">
								New to you
							</span>
						)}
						{kbd(item)}
					</span>
				</span>
				<ArrowRight
					className="app-card__arrow"
					size={18}
					strokeWidth={1.5}
					aria-hidden="true"
				/>
			</a>
			{onTogglePin ? (
				<button
					type="button"
					className={`app-card__pin${pinned ? " app-card__pin--on" : ""}`}
					aria-pressed={pinned}
					aria-label={pinned ? `Unpin ${item.title}` : `Pin ${item.title}`}
					title={pinned ? "Unpin" : "Pin to top"}
					onClick={(event) => {
						event.preventDefault();
						onTogglePin(item.href);
					}}
				>
					<Pin size={14} strokeWidth={2} aria-hidden="true" />
				</button>
			) : null}
		</article>
	);
};

/** The keyboard shortcut hint, hidden on touch devices via CSS. */
const kbd = (item: AppEntry) => (
	<kbd className="app-kbd app-card__kbd">{item.hotkey}</kbd>
);
