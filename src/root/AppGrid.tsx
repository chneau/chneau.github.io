import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { AppCard, type AppEntry } from "../shared";

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
		const keys = [
			"ArrowRight",
			"ArrowLeft",
			"ArrowDown",
			"ArrowUp",
			"Home",
			"End",
		];
		if (!keys.includes(event.key)) return;
		const links = Array.from(
			event.currentTarget.querySelectorAll<HTMLAnchorElement>(
				".app-card__link",
			),
		);
		const index = links.indexOf(document.activeElement as HTMLAnchorElement);
		if (index === -1) return;
		event.preventDefault();
		const last = links.length - 1;
		let next = index;
		if (event.key === "ArrowRight" || event.key === "ArrowDown") {
			next = index === last ? 0 : index + 1;
		} else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
			next = index === 0 ? last : index - 1;
		} else if (event.key === "Home") {
			next = 0;
		} else if (event.key === "End") {
			next = last;
		}
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
