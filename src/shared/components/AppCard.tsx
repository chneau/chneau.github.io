import { Badge, Title } from "@mantine/core";
import { ArrowRight, Pin } from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";
import type { AppEntry } from "../apps";
import { formatRelativeTime } from "../recent";

type AppCardProps = {
	item: AppEntry;
	index?: number;
	pinned?: boolean;
	lastVisitedAt?: number;
	onTogglePin?: (href: string) => void;
	onVisit?: (href: string) => void;
};

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
			<a className="app-card__link" href={item.href} onClick={handleVisit}>
				<span className="app-card__icon" aria-hidden="true">
					<Icon size={24} strokeWidth={1.5} />
				</span>
				<div className="app-card__body">
					<div className="app-card__head">
						<Title order={3} className="app-card__title">
							{item.title}
						</Title>
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
					</div>
					<p className="app-card__desc">{item.description}</p>
					<div className="app-card__foot">
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
					</div>
				</div>
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

const kbd = (item: AppEntry) => (
	<kbd
		className="app-kbd app-card__kbd"
		aria-label={item.shortcutKey}
		title={item.shortcutKey}
	>
		{item.hotkey}
	</kbd>
);
