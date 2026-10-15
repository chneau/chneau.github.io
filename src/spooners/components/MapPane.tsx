import { Box } from "@mantine/core";
import type { MapView } from "../mapView";
import type { MapPoint } from "../types";
import { MapPanel } from "./MapPanel";

type Props = {
	compact: boolean;
	view: MapView;
	points: MapPoint[];
	unpriced: MapPoint[];
	pubCount: number;
	areaCount: number;
	scale: { min: number; max: number };
	currency: string;
	legendLabel: string | undefined;
	median: number | null;
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
