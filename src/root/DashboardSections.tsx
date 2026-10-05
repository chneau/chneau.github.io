import { Button } from "@mantine/core";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { APPS, type AppEntry, EmptyState } from "../shared";
import { AppGrid } from "./AppGrid";

type GridProps = {
	items: AppEntry[];
	isPinned: (href: string) => boolean;
	visitedAt: Map<string, number>;
	onTogglePin: (href: string) => void;
};

/**
 * A titled grid of app cards. The count sits inside the heading because it is
 * the heading's own subject — "Pinned (2)" — and on the results section it is
 * also the only feedback a screen-reader user gets while typing.
 */
const Section = ({
	title,
	count,
	live,
	children,
}: {
	title: string;
	count: number;
	/** Announce the count politely; only the searching section changes. */
	live?: boolean;
	children: ReactNode;
}) => (
	<>
		<h2 className="app-section-title">
			{title}
			<span
				className="app-section-title__count"
				role={live ? "status" : undefined}
				aria-live={live ? "polite" : undefined}
			>
				{count}
			</span>
		</h2>
		{children}
	</>
);

/** What the search and category filter left, or why nothing is left. */
export const SearchResults = ({
	items,
	isPinned,
	visitedAt,
	onTogglePin,
	onReset,
}: GridProps & { onReset: () => void }) =>
	items.length > 0 ? (
		<Section title="Results" count={items.length} live>
			<AppGrid
				items={items}
				isPinned={isPinned}
				visitedAt={visitedAt}
				onTogglePin={onTogglePin}
			/>
		</Section>
	) : (
		<Section title="Results" count={0} live>
			<EmptyState
				icon={<Search size={22} />}
				title="No apps match that"
				body="Try a shorter query, or clear the filters to see everything."
				action={
					<Button variant="light" onClick={onReset}>
						Reset filters
					</Button>
				}
			/>
		</Section>
	);

/** One chip per recently opened app, so a return visit is one click. */
const RecentChips = ({ items }: { items: AppEntry[] }) => (
	<div className="app-recents">
		{items.map((app) => {
			const Icon = app.icon;
			return (
				<a key={app.href} className="app-recent-chip" href={app.href}>
					<Icon size={14} />
					{app.title}
				</a>
			);
		})}
	</div>
);

/**
 * The landing view: what the visitor pinned, what they opened lately, and
 * everything else. Pinned and recent are omitted rather than shown empty,
 * because an empty "Pinned" heading is a thing to read past.
 */
export const AppLists = ({
	pinned,
	recent,
	isPinned,
	visitedAt,
	onTogglePin,
}: Omit<GridProps, "items"> & { pinned: AppEntry[]; recent: AppEntry[] }) => (
	<>
		{pinned.length > 0 ? (
			<Section title="Pinned" count={pinned.length}>
				<AppGrid
					items={pinned}
					isPinned={isPinned}
					visitedAt={visitedAt}
					onTogglePin={onTogglePin}
				/>
			</Section>
		) : null}

		{recent.length > 0 ? (
			<Section title="Recently opened" count={recent.length}>
				<RecentChips items={recent} />
			</Section>
		) : null}

		<Section title="All apps" count={APPS.length}>
			<AppGrid
				items={APPS}
				isPinned={isPinned}
				visitedAt={visitedAt}
				onTogglePin={onTogglePin}
			/>
		</Section>
	</>
);
