import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { AppCard, type AppEntry } from "../shared";
import { columnsInRow, nextGridIndex } from "./gridNavigation";

type AppGridProps = {
	items: AppEntry[];
	isPinned: (href: string) => boolean;
	visitedAt: Map<string, number>;
	onTogglePin: (href: string) => void;
};

/** A responsive grid of app cards with arrow-key roving focus between them. */
export const AppGrid = ({
	items,
	isPinned,
	visitedAt,
	onTogglePin,
}: AppGridProps) => {
	/** Arrow-key roving focus across the visible card grid. */
	const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		const links = Array.from(
			event.currentTarget.querySelectorAll<HTMLAnchorElement>(
				".app-card__link",
			),
		);
		const index = links.indexOf(document.activeElement as HTMLAnchorElement);
		if (index === -1) return;
		const next = nextGridIndex(
			index,
			links.length,
			columnsInRow(links),
			event.key,
		);
		if (next === null) return;
		event.preventDefault();
		links[next]?.focus();
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: keyboard roving focus over the card links (links stay focusable; this only adds arrow-key movement)
		<div className="app-grid" onKeyDown={onGridKeyDown}>
			{items.map((item, index) => (
				<AppCard
					key={item.href}
					item={item}
					index={index}
					pinned={isPinned(item.href)}
					lastVisitedAt={visitedAt.get(item.href)}
					onTogglePin={onTogglePin}
				/>
			))}
		</div>
	);
};
