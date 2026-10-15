import { Box } from "@mantine/core";
import type { FilterState } from "../appState";
import type { SpoonersCache } from "../types";
import { ResultsSidebar } from "./ResultsSidebar";

type SidebarProps = Parameters<typeof ResultsSidebar>[0];

export const ResultsColumn = ({
	view,
	cache,
	filters,
	onAdd,
	onQty,
	onRemove,
	onClear,
	onUndo,
	undoText,
	onOnlyItem,
	rateDate,
	onCurrency,
	userLocation,
	geoState,
	onNearMe,
	onClearLocation,
	onSelectVenue,
	focused,
	onFocus,
	selectedArea,
	onSelectArea,
	rankingRows,
	isMobile,
}: {
	view: SidebarProps["view"];
	cache: SpoonersCache;
	filters: FilterState;
	onAdd: SidebarProps["onAdd"];
	onQty: SidebarProps["onQty"];
	onRemove: SidebarProps["onRemove"];
	onClear: SidebarProps["onClear"];
	onUndo: SidebarProps["onUndo"];
	undoText: SidebarProps["undoText"];
	onOnlyItem: SidebarProps["onOnlyItem"];
	rateDate: SidebarProps["rateDate"];
	onCurrency: SidebarProps["onCurrency"];
	userLocation: { lat: number; lng: number } | null;
	geoState: SidebarProps["geoState"];
	onNearMe: SidebarProps["onNearMe"];
	onClearLocation: SidebarProps["onClearLocation"];
	onSelectVenue: SidebarProps["onSelectVenue"];
	focused: SidebarProps["focused"];
	onFocus: SidebarProps["onFocus"];
	selectedArea: SidebarProps["selectedArea"];
	onSelectArea: SidebarProps["onSelectArea"];
	rankingRows: SidebarProps["rankingRows"];
	isMobile: boolean;
}) => (
	<Box
		className="spooners-scroll"
		role="region"
		aria-label="Round and results"
		style={{
			width: isMobile ? "100%" : 400,
			flex: isMobile ? 1 : undefined,
			flexShrink: isMobile ? 1 : 0,
			minHeight: 0,
			overflowY: "auto",
			borderRight: isMobile
				? undefined
				: "1px solid var(--mantine-color-default-border)",
			padding: 12,
		}}
	>
		<ResultsSidebar
			view={view}
			venues={cache.venueList}
			history={cache.history?.items}
			activeFilters={filters.activeFilters}
			onFilters={filters.setActiveFilters}
			activeFacilities={filters.activeFacilities}
			onFacilities={filters.setActiveFacilities}
			onResetFilters={filters.resetFilters}
			openNow={filters.openNowOnly}
			onOpenNow={filters.setOpenNowOnly}
			hideSpecial={filters.hideSpecial}
			onHideSpecial={filters.setHideSpecial}
			hideClosed={filters.hideClosed}
			onHideClosed={filters.setHideClosed}
			onlyComplete={filters.onlyComplete}
			onOnlyComplete={filters.setOnlyComplete}
			resolvedBasket={view.resolvedBasket}
			onAdd={onAdd}
			onQty={onQty}
			onRemove={onRemove}
			onClear={onClear}
			onUndo={onUndo}
			undoText={undoText}
			currency={view.displayCurrency}
			onCurrency={onCurrency}
			rateDate={rateDate}
			hasLocation={Boolean(userLocation)}
			geoState={geoState}
			onNearMe={onNearMe}
			onClearLocation={onClearLocation}
			onSelectVenue={onSelectVenue}
			focused={focused}
			onFocus={onFocus}
			onDetails={(venue) => onSelectVenue(venue.ref)}
			selectedArea={selectedArea}
			onSelectArea={onSelectArea}
			onOnlyItem={onOnlyItem}
			rankingRows={rankingRows}
		/>
	</Box>
);
