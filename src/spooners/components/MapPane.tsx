import { Box } from "@mantine/core";
import type { MapView } from "../mapView";
import type { MapPoint } from "../types";
import { MapPanel } from "./MapPanel";

type Props = {
	compact: boolean;
	view: MapView;
	/** The markers for the current mode: pubs, or one per area. */
	points: MapPoint[];
	/** Grey markers for pubs with no menu, which only make sense in pub mode. */
	unpriced: MapPoint[];
	/** How many of each kind, for the "N pubs" / "N areas" count. */
	pubCount: number;
	areaCount: number;
	scale: { min: number; max: number };
	currency: string;
	/** The legend the map shows when it is not in area mode. */
	legendLabel: string | undefined;
	median: number | null;
	/** Pubs the filters removed, which area mode does not report. */
	hiddenCount: number | undefined;
	focused: MapPoint | null;
	onFocus: (point: MapPoint) => void;
	onOpen: (ref: number) => void;
	onArea: (name: string) => void;
	area: string | null;
	onClearArea: () => void;
	onView: (view: MapView) => void;
	initialView: { center: [number, number]; zoom: number } | null;
	onViewport: (center: [number, number], zoom: number) => void;
};

/**
 * The map half of the page.
 *
 * Its own component for two reasons: the sizing rule, which differs below the
 * breakpoint, and the wording, which differs by mode. Area mode shows one
 * marker per area with no median line and no count of hidden pubs, so what the
 * map's own chrome says belongs here rather than in the caller, which would
 * otherwise repeat that comparison beside every marker.
 */
export const MapPane = ({
	compact,
	view,
	points,
	unpriced,
	pubCount,
	areaCount,
	scale,
	currency,
	legendLabel,
	median,
	hiddenCount,
	focused,
	onFocus,
	onOpen,
	onArea,
	area,
	onClearArea,
	onView,
	initialView,
	onViewport,
}: Props) => {
	const areaMode = view === "area";
	const markerCount = areaMode ? areaCount : pubCount;
	return (
		<Box
			style={{
				flex: compact ? undefined : 1,
				flexShrink: 0,
				minWidth: 0,
				height: compact ? "45vh" : "auto",
			}}
		>
			<MapPanel
				points={points}
				unpriced={areaMode ? undefined : unpriced}
				scale={scale}
				currency={currency}
				focused={focused}
				onFocus={onFocus}
				onOpen={onOpen}
				onArea={onArea}
				area={area}
				onClearArea={onClearArea}
				compact={compact}
				view={view}
				onView={onView}
				countLabel={`${markerCount} ${areaMode ? "areas" : "pubs"}`}
				legendLabel={areaMode ? "median of the area" : legendLabel}
				median={areaMode ? null : median}
				hiddenCount={areaMode ? undefined : hiddenCount}
				initialView={initialView}
				onViewport={onViewport}
			/>
		</Box>
	);
};
