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

export const Controls = () => {
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
					<div
						className="sr-controls-row"
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

					<div
						className="sr-controls-sub"
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
