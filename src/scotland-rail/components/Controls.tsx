import { Box, Card, Group } from "@mantine/core";
import { useThrottledSnapshots } from "../hooks";
import { railUiStores } from "../store";
import {
	CategoryFilters,
	PlaybackControls,
	QuickJumps,
	ReplayClock,
	ServiceSearch,
	TimelineScrubber,
	ViewPresetPicker,
} from "./control-parts";

/**
 * The bottom control bar. It owns nothing but the throttled subscription and
 * the arrangement; the controls themselves live in `control-parts` and write to
 * the store themselves, so this file reads as the shape of the bar rather than
 * as one long list of handlers.
 */
export const Controls = () => {
	// Throttled: the HUD does not need to follow the 60 fps clock exactly.
	const [snap, derivedSnap] = useThrottledSnapshots(railUiStores);

	const {
		timeOffset,
		isPlaying,
		speed,
		viewPreset,
		searchQuery,
		selectedCategory,
	} = snap;
	const { activeTrains, activeCountsByCategory } = derivedSnap;

	return (
		<div
			style={{
				position: "absolute",
				bottom: 16,
				left: 16,
				right: 16,
				display: "flex",
				flexDirection: "column",
				gap: 8,
				pointerEvents: "none",
			}}
		>
			<Card
				className="sr-glass sr-rise"
				radius={14}
				padding={0}
				style={{
					pointerEvents: "auto",
				}}
			>
				<Box style={{ padding: "12px 18px" }}>
					{/* Top Bar: Live Clock, Category Filters, Search and View Selector */}
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							flexWrap: "wrap",
							gap: 12,
							marginBottom: 10,
						}}
					>
						<ReplayClock
							timeOffset={timeOffset}
							activeCount={activeTrains.length}
						/>

						<CategoryFilters
							selectedCategory={selectedCategory}
							activeCountsByCategory={activeCountsByCategory}
						/>

						<Group gap="xs" wrap="wrap">
							<ServiceSearch searchQuery={searchQuery} />
							<ViewPresetPicker viewPreset={viewPreset} />
						</Group>
					</div>

					<TimelineScrubber timeOffset={timeOffset} />

					{/* Bottom Controls: Playback buttons & quick jumps */}
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							gap: 12,
							flexWrap: "wrap",
							marginTop: 6,
						}}
					>
						<PlaybackControls isPlaying={isPlaying} speed={speed} />
						<QuickJumps />
					</div>
				</Box>
			</Card>
		</div>
	);
};
