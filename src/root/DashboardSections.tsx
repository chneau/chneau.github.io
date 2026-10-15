import { Button, Text } from "@mantine/core";
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

const DashboardSection = ({
	title,
	count,
	live,
	children,
}: {
	title: string;
	count: number;
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

export const SearchResults = ({
	items,
	isPinned,
	visitedAt,
	onTogglePin,
	onReset,
}: GridProps & { onReset: () => void }) =>
	items.length > 0 ? (
		<DashboardSection title="Results" count={items.length} live>
			<AppGrid
				items={items}
				isPinned={isPinned}
				visitedAt={visitedAt}
				onTogglePin={onTogglePin}
			/>
		</DashboardSection>
	) : (
		<DashboardSection title="Results" count={0} live>
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
		</DashboardSection>
	);

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

export const AppLists = ({
	pinned,
	recent,
	isPinned,
	visitedAt,
	onTogglePin,
}: Omit<GridProps, "items"> & { pinned: AppEntry[]; recent: AppEntry[] }) => (
	<>
		{pinned.length > 0 ? (
			<DashboardSection title="Pinned" count={pinned.length}>
				<AppGrid
					items={pinned}
					isPinned={isPinned}
					visitedAt={visitedAt}
					onTogglePin={onTogglePin}
				/>
			</DashboardSection>
		) : null}

		{recent.length > 0 ? (
			<DashboardSection title="Recently opened" count={recent.length}>
				<RecentChips items={recent} />
			</DashboardSection>
		) : null}

		<DashboardSection title="All apps" count={APPS.length}>
			<AppGrid
				items={APPS}
				isPinned={isPinned}
				visitedAt={visitedAt}
				onTogglePin={onTogglePin}
			/>
			{pinned.length === 0 && recent.length === 0 ? (
				<Text size="sm" c="var(--app-text-muted)" mt="sm">
					Try Surprise me, or pin anything with the pin on each card.
				</Text>
			) : null}
		</DashboardSection>
	</>
);
