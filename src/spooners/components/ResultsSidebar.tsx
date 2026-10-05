import { Box, Button, Group, Stack, Text } from "@mantine/core";
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

/** One row of the by-area panel. */
type AreaStat = Parameters<typeof GeographyPanel>[0]["stats"][number];

type Props = {
	/**
	 * Everything derived from the round and the filters: the pubs, the counts,
	 * the options. One object rather than forty props, because this panel draws
	 * nothing of its own — it is the view, laid out.
	 */
	view: SpoonersView;
	/** Every pub, for the search box; not narrowed, so a name is findable. */
	venues: VenueInfo[];
	/** National price history per item, when the dataset carries any. */
	history: NonNullable<SpoonersCache["history"]>["items"];
	/** The filters' own state and handlers, which are not derivations. */
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

	/** The round, as edited, and what may be done to it. */
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
	/** How many pubs each ranking list shows, from the saved settings. */
	rankingRows: number;
};

/** Cheapest, median and dearest across the pubs the filters left. */
const PriceStats = ({
	view,
	portion,
}: {
	view: SpoonersView;
	portion: string | null;
}) =>
	view.withDistance.length > 0 ? (
		<Section title="Prices">
			<StatsBar
				pubs={view.withDistance.length}
				cheapest={money(view.scale.min, view.displayCurrency)}
				median={money(view.medianPrice, view.displayCurrency)}
				dearest={money(view.scale.max, view.displayCurrency)}
				portion={portion}
				premium={view.premium}
			/>
		</Section>
	) : null;

/**
 * Nothing matched, and the ways out of it. Each action is offered only when it
 * would change something: "include partial" is pointless unless "whole round
 * only" is what excluded them.
 */
const NoMatches = ({
	partialCount,
	onlyComplete,
	canClearRound,
	onIncludePartial,
	onResetFilters,
	onClearRound,
}: {
	partialCount: number;
	onlyComplete: boolean;
	canClearRound: boolean;
	onIncludePartial: () => void;
	onResetFilters: () => void;
	onClearRound: () => void;
}) => (
	<EmptyState
		title="No pubs match"
		body="Nothing serves this round with the current filters."
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
				{canClearRound ? (
					<Button size="xs" variant="subtle" color="red" onClick={onClearRound}>
						Clear round
					</Button>
				) : null}
			</Group>
		}
	/>
);

/**
 * The scrollable left column: what you are ordering, and everything the app
 * knows about the pubs that can serve it.
 *
 * Split out of `App` because this is the app's second screen, not part of its
 * shell. It re-renders on every keystroke in the round, and taking it out of
 * `App` lets the header, the map and the dialogs stay put while it does.
 */
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
	// The portion belongs to the pub, so it is only meaningful while the round
	// is a single item; a whole round has no one portion to quote.
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
				scale={view.scale}
				metric={view.itemMetric}
				trend={view.trend}
				converted={view.converting ? { currency, rateDate } : null}
			/>
			<PriceStats view={view} portion={portion} />
			{withDistance.length === 0 ? (
				<NoMatches
					partialCount={view.partialCount}
					onlyComplete={onlyComplete}
					canClearRound={resolvedBasket.length > 0}
					onIncludePartial={() => onOnlyComplete(false)}
					onResetFilters={onResetFilters}
					onClearRound={onClear}
				/>
			) : null}
			<Section title="Price distribution">
				<Distribution
					prices={view.prices}
					scale={view.scale}
					currency={displayCurrency}
					median={view.medianPrice}
					history={view.singleName ? history?.[view.singleName] : undefined}
				/>
			</Section>
			<Section title="Rankings">
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
			</Section>
			{areas.length >= 2 ? (
				<Section
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
				</Section>
			) : null}
			{view.rare.length || view.fresh.length ? (
				<Section title="Discover">
					<DiscoverPanel
						rare={view.rare}
						fresh={view.fresh}
						sellers={view.sellers}
						onSelect={onOnlyItem}
					/>
				</Section>
			) : null}
			{view.unpricedAll.length ? (
				<Section
					title="No published menu"
					badge={
						<Text size="xs" c="dimmed">
							{view.unpricedAll.length}
						</Text>
					}
				>
					<MenuLessPanel venues={view.unpricedAll} onSelect={onSelectVenue} />
				</Section>
			) : null}
		</Stack>
	);
};
