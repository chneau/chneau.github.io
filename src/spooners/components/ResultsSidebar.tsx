import { Box, Button, Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { EmptyState, Section } from "../../shared";
import type { BasketItem } from "../basket";
import { money } from "../price";
import type { MapPoint, PricedVenue, SpoonersCache, VenueInfo } from "../types";
import type { SpoonersView } from "../useSpoonersView";
import { DiscoverPanel } from "./DiscoverPanel";
import { Distribution } from "./Distribution";
import { GeographyPanel } from "./GeographyPanel";
import { MenuLessPanel } from "./MenuLessPanel";
import { PubSearch } from "./PubSearch";
import { RankingPanel } from "./RankingPanel";
import { RoundCard } from "./RoundCard";
import { StatsBar } from "./StatsBar";

type AreaStat = Parameters<typeof GeographyPanel>[0]["stats"][number];

type Props = {
	view: SpoonersView;
	venues: VenueInfo[];
	history: NonNullable<SpoonersCache["history"]>["items"];
	activeFilters: string[];
	onFilters: (ids: string[]) => void;
	activeFacilities: string[];
	onFacilities: (labels: string[]) => void;
	onResetFilters: () => void;
	openNow: boolean;
	onOpenNow: (value: boolean) => void;
	hideSpecial: boolean;
	onHideSpecial: (value: boolean) => void;
	hideClosed: boolean;
	onHideClosed: (value: boolean) => void;
	onlyComplete: boolean;
	onOnlyComplete: (value: boolean) => void;

	resolvedBasket: BasketItem[];
	onAdd: (name: string) => void;
	onQty: (name: string, qty: number) => void;
	onRemove: (name: string) => void;
	onClear: () => void;
	onUndo: (() => void) | null;
	undoText: string | null;

	currency: string;
	onCurrency: (currency: string) => void;
	rateDate: string | null;
	hasLocation: boolean;
	geoState: "idle" | "loading" | "error";
	onNearMe: () => void;
	onClearLocation: () => void;

	onSelectVenue: (ref: number) => void;
	focused: MapPoint | null;
	onFocus: (venue: PricedVenue) => void;
	onDetails: (venue: PricedVenue) => void;
	selectedArea: string | null;
	onSelectArea: (stat: AreaStat) => void;
	onOnlyItem: (name: string) => void;
	rankingRows: number;
};

const Panel = ({
	title,
	badge,
	children,
}: {
	title: string;
	badge?: ReactNode;
	children: ReactNode;
}) => (
	<Section title={title} badge={badge}>
		<Box role="region" aria-label={title}>
			{children}
		</Box>
	</Section>
);

const PriceStats = ({
	view,
	portion,
}: {
	view: SpoonersView;
	portion: string | null;
}) =>
	view.withDistance.length > 0 ? (
		<Panel title="Prices">
			<StatsBar
				pubs={view.withDistance.length}
				cheapest={money(view.scale.min, view.displayCurrency)}
				median={money(view.medianPrice, view.displayCurrency)}
				dearest={money(view.scale.max, view.displayCurrency)}
				scale={view.scale}
				portion={portion}
				premium={view.premium}
			/>
		</Panel>
	) : null;

const NoMatches = ({
	partialCount,
	onlyComplete,
	onIncludePartial,
	onResetFilters,
	onClearRound,
}: {
	partialCount: number;
	onlyComplete: boolean;
	onIncludePartial: () => void;
	onResetFilters: () => void;
	onClearRound: () => void;
}) => (
	<EmptyState
		title="No pubs match"
		body="No pub serving this round is left after the current filters."
		action={
			<Group gap="xs" justify="center">
				{partialCount > 0 && onlyComplete ? (
					<Button size="xs" onClick={onIncludePartial}>
						Include partial pubs ({partialCount})
					</Button>
				) : null}
				<Button size="xs" variant="light" onClick={onResetFilters}>
					Reset filters
				</Button>
				<Button size="xs" variant="subtle" color="red" onClick={onClearRound}>
					Clear round
				</Button>
			</Group>
		}
	/>
);

const NoRound = () => (
	<EmptyState
		title="Your round is empty"
		body="Add a drink above to price it across every pub."
	/>
);

const NoDrinks = ({ onResetFilters }: { onResetFilters: () => void }) => (
	<EmptyState
		title="No drinks match the filters"
		body="Nothing on the menu passes the current filters, so there is no round to price."
		action={
			<Button size="xs" variant="light" onClick={onResetFilters}>
				Reset filters
			</Button>
		}
	/>
);

const SidebarEmptyState = ({
	hasPubs,
	basketLength,
	fallbackName,
	partialCount,
	onlyComplete,
	onIncludePartial,
	onResetFilters,
	onClear,
}: {
	hasPubs: boolean;
	basketLength: number;
	fallbackName: string | null;
	partialCount: number;
	onlyComplete: boolean;
	onIncludePartial: () => void;
	onResetFilters: () => void;
	onClear: () => void;
}) => {
	if (hasPubs) return null;
	if (basketLength > 0)
		return (
			<NoMatches
				partialCount={partialCount}
				onlyComplete={onlyComplete}
				onIncludePartial={onIncludePartial}
				onResetFilters={onResetFilters}
				onClearRound={onClear}
			/>
		);
	return fallbackName === null ? (
		<NoDrinks onResetFilters={onResetFilters} />
	) : (
		<NoRound />
	);
};

const RankedPanels = ({
	view,
	withDistance,
	areas,
	displayCurrency,
	history,
	focused,
	onFocus,
	onDetails,
	rankingRows,
	selectedArea,
	onSelectArea,
}: {
	view: SpoonersView;
	withDistance: Props["view"]["withDistance"];
	areas: AreaStat[];
	displayCurrency: string;
	history: Props["history"];
	focused: MapPoint | null;
	onFocus: (venue: PricedVenue) => void;
	onDetails: (venue: PricedVenue) => void;
	rankingRows: number;
	selectedArea: string | null;
	onSelectArea: (stat: AreaStat) => void;
}) => {
	if (withDistance.length === 0) return null;
	return (
		<>
			<Panel title="Price distribution">
				<Distribution
					prices={view.prices}
					scale={view.scale}
					currency={displayCurrency}
					median={view.medianPrice}
					history={view.singleName ? history?.[view.singleName] : undefined}
				/>
			</Panel>
			<Panel title="Rankings">
				<RankingPanel
					venues={withDistance}
					scale={view.scale}
					currency={displayCurrency}
					focused={focused}
					onFocus={onFocus}
					onDetails={onDetails}
					nearby={view.nearby}
					count={rankingRows}
				/>
			</Panel>
			{areas.length >= 2 ? (
				<Panel
					title="By area"
					badge={
						<Text size="xs" c="dimmed">
							{areas.length} areas
						</Text>
					}
				>
					<GeographyPanel
						stats={areas}
						currency={displayCurrency}
						selected={selectedArea}
						onSelect={onSelectArea}
					/>
				</Panel>
			) : null}
		</>
	);
};

const DiscoverPanels = ({
	view,
	onOnlyItem,
	onSelectVenue,
}: {
	view: SpoonersView;
	onOnlyItem: (name: string) => void;
	onSelectVenue: (ref: number) => void;
}) => (
	<>
		{view.rare.length || view.fresh.length ? (
			<Panel title="Discover">
				<DiscoverPanel
					rare={view.rare}
					fresh={view.fresh}
					sellers={view.sellers}
					onSelect={onOnlyItem}
				/>
			</Panel>
		) : null}
		{view.unpricedAll.length ? (
			<Panel
				title="No published menu"
				badge={
					<Text size="xs" c="dimmed">
						{view.unpricedAll.length}
					</Text>
				}
			>
				<MenuLessPanel venues={view.unpricedAll} onSelect={onSelectVenue} />
			</Panel>
		) : null}
	</>
);

export const ResultsSidebar = ({
	view,
	venues,
	history,
	activeFilters,
	onFilters,
	activeFacilities,
	onFacilities,
	onResetFilters,
	openNow,
	onOpenNow,
	hideSpecial,
	onHideSpecial,
	hideClosed,
	onHideClosed,
	onlyComplete,
	onOnlyComplete,
	resolvedBasket,
	onAdd,
	onQty,
	onRemove,
	onClear,
	onUndo,
	undoText,
	currency,
	onCurrency,
	rateDate,
	hasLocation,
	geoState,
	onNearMe,
	onClearLocation,
	onSelectVenue,
	focused,
	onFocus,
	onDetails,
	selectedArea,
	onSelectArea,
	onOnlyItem,
	rankingRows,
}: Props) => {
	const { displayCurrency, withDistance, areas } = view;
	const portion = view.singleName
		? (view.completeVenues[0]?.portion ?? null)
		: null;

	return (
		<Stack gap="sm">
			<Text className="sr-only" role="status" aria-live="polite">
				{withDistance.length === 0
					? "No pubs match the current round and filters."
					: `${withDistance.length} ${
							withDistance.length === 1 ? "pub" : "pubs"
						} match the current round and filters.`}
			</Text>
			<Box hiddenFrom="md">
				<PubSearch venues={venues} onSelect={onSelectVenue} />
			</Box>
			<RoundCard
				items={view.visibleIndex}
				basket={resolvedBasket}
				onAdd={onAdd}
				onQty={onQty}
				onRemove={onRemove}
				onClear={onClear}
				onUndo={onUndo}
				undoText={undoText}
				currencies={view.converting ? [] : view.currencies}
				currency={currency}
				onCurrency={onCurrency}
				filters={view.filters}
				activeFilters={activeFilters}
				onFilters={onFilters}
				onResetFilters={onResetFilters}
				dietaryRelevant={view.dietaryRelevant}
				facilities={view.facilityOptions}
				activeFacilities={activeFacilities}
				onFacilities={onFacilities}
				openNow={openNow}
				onOpenNow={onOpenNow}
				openCount={view.openCount}
				hideSpecial={hideSpecial}
				onHideSpecial={onHideSpecial}
				specialCount={view.specialCount}
				hideClosed={hideClosed}
				onHideClosed={onHideClosed}
				closedCount={view.closedCount}
				completeCount={view.completeCount}
				partialCount={view.partialCount}
				onlyComplete={onlyComplete}
				onOnlyComplete={onOnlyComplete}
				hasLocation={hasLocation}
				geoState={geoState}
				onNearMe={onNearMe}
				onClearLocation={onClearLocation}
				scale={withDistance.length ? view.scale : null}
				metric={view.itemMetric}
				trend={view.trend}
				converted={view.converting ? { currency, rateDate } : null}
			/>
			<SidebarEmptyState
				hasPubs={withDistance.length > 0}
				basketLength={resolvedBasket.length}
				fallbackName={view.fallbackName}
				partialCount={view.partialCount}
				onlyComplete={onlyComplete}
				onIncludePartial={() => onOnlyComplete(false)}
				onResetFilters={onResetFilters}
				onClear={onClear}
			/>
			<PriceStats view={view} portion={portion} />
			<RankedPanels
				view={view}
				withDistance={withDistance}
				areas={areas}
				displayCurrency={displayCurrency}
				history={history}
				focused={focused}
				onFocus={onFocus}
				onDetails={onDetails}
				rankingRows={rankingRows}
				selectedArea={selectedArea}
				onSelectArea={onSelectArea}
			/>
			<DiscoverPanels
				view={view}
				onOnlyItem={onOnlyItem}
				onSelectVenue={onSelectVenue}
			/>
		</Stack>
	);
};
