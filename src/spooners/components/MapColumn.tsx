import { Box, Button, Text } from "@mantine/core";
import { Component, lazy, type ReactNode, Suspense } from "react";
import type { MapView } from "../mapView";
import type { MapPoint } from "../types";
import type { SpoonersView } from "../useSpoonersView";

const MapPane = lazy(() =>
	import("./MapPane").then((module) => ({
		default: module.MapPane,
	})),
);

const MapFallback = ({
	compact,
	failed = false,
}: {
	compact: boolean;
	failed?: boolean;
}) => (
	<Box
		role={failed ? "alert" : undefined}
		style={{
			flex: compact ? undefined : 1,
			flexShrink: 0,
			minWidth: 0,
			height: compact ? "45vh" : "auto",
			borderRadius: "var(--app-radius-md)",
			border: "1px solid var(--app-border)",
			background: "var(--app-surface-2)",
			display: failed ? "grid" : undefined,
			placeItems: failed ? "center" : undefined,
			alignContent: failed ? "center" : undefined,
			gap: failed ? 4 : undefined,
			padding: failed ? "var(--mantine-spacing-md)" : undefined,
			textAlign: failed ? "center" : undefined,
		}}
	>
		{failed ? (
			<>
				<Text fw={600}>The map could not be loaded</Text>
				<Text size="sm" c="dimmed" maw={420}>
					It is a separate download from the rest of the page and something
					stopped it arriving. Reloading fetches it again.
				</Text>
				<Button
					mt="sm"
					variant="default"
					onClick={() => window.location.reload()}
				>
					Reload the page
				</Button>
			</>
		) : null}
	</Box>
);

class MapErrorBoundary extends Component<
	{ compact: boolean; children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	render() {
		if (!this.state.failed) return this.props.children;
		return <MapFallback compact={this.props.compact} failed />;
	}
}

export const MapColumn = ({
	compact,
	view,
	mode,
	focused,
	onFocus,
	onOpen,
	onArea,
	area,
	onClearArea,
	onView,
	initialView,
	onViewport,
}: {
	compact: boolean;
	view: SpoonersView;
	mode: MapView;
	focused: MapPoint | null;
	onFocus: (point: MapPoint) => void;
	onOpen: (ref: number) => void;
	onArea: (name: string) => void;
	area: string | null;
	onClearArea: () => void;
	onView: (mode: MapView) => void;
	initialView: { center: [number, number]; zoom: number } | null;
	onViewport: (center: [number, number], zoom: number) => void;
}) => (
	<MapErrorBoundary compact={compact}>
		<Suspense fallback={<MapFallback compact={compact} />}>
			<MapPane
				compact={compact}
				view={mode}
				points={view.mapData}
				unpriced={view.unpricedPoints}
				pubCount={view.mapData.length}
				areaCount={view.areaPoints.length}
				scale={view.mapScale}
				currency={view.displayCurrency}
				legendLabel={view.legendLabel}
				median={view.prices.length ? view.medianPrice : null}
				hiddenCount={view.hiddenCount}
				focused={focused}
				onFocus={onFocus}
				onOpen={onOpen}
				onArea={onArea}
				area={area}
				onClearArea={onClearArea}
				onView={onView}
				initialView={initialView}
				onViewport={onViewport}
			/>
		</Suspense>
	</MapErrorBoundary>
);
