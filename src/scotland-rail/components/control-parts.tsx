import {
	Badge,
	Button,
	CloseButton,
	Group,
	SegmentedControl,
	Select,
	Slider,
	Text,
	TextInput,
	Title,
} from "@mantine/core";
import {
	Clock,
	Moon,
	Pause,
	PlayCircle,
	RotateCcw,
	Search,
	Sun,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import { CATEGORIES, type Category, type ViewPreset } from "../data/types";
import { railActions } from "../store";
import { palette } from "../theme";
import { formatTime } from "../utils";

/**
 * The three groups the bottom control bar is made of — what is running, how the
 * replay is being played, and where it can jump to — split along the lines a
 * reader would draw. Each reads the store through `railActions` directly, so
 * none of them has to be handed the bar's snapshot to work.
 */

/**
 * The live clock and the "N active" badge. This is the only row that reports
 * *now*; everything else in the bar reports state the visitor set.
 */
export const ReplayClock = ({
	timeOffset,
	activeCount,
}: {
	timeOffset: number;
	activeCount: number;
}) => (
	<Group gap="md" align="center">
		<Title
			order={3}
			className="sr-num"
			style={{
				color: palette.text,
				margin: 0,
				fontSize: "1.4rem",
				fontWeight: 600,
				letterSpacing: "0.02em",
				display: "flex",
				alignItems: "center",
				gap: 8,
			}}
		>
			<Clock size={16} style={{ color: palette.accent }} />
			{formatTime(timeOffset)}
		</Title>
		<Badge
			component="button"
			type="button"
			variant="light"
			radius="xl"
			tt="none"
			aria-pressed={false}
			className="sr-press"
			onClick={() => railActions.setSelectedCategory("all")}
			style={{
				fontSize: "0.8rem",
				padding: "2px 10px",
				cursor: "pointer",
				background: palette.accentSoft,
				color: palette.accent,
			}}
		>
			<span className="sr-num">{activeCount}</span> active
		</Badge>
	</Group>
);

/**
 * One badge per category, each a toggle. Clicking the selected category clears
 * the filter rather than re-selecting it, which is why the badge reports itself
 * pressed when the category *is* the filter while the store is handed "all".
 */
export const CategoryFilters = ({
	selectedCategory,
	activeCountsByCategory,
}: {
	selectedCategory: Category | "all";
	activeCountsByCategory: Record<Category, number>;
}) => (
	<Group gap={4} wrap="wrap">
		{(Object.keys(CATEGORIES) as Category[]).map((cat) => {
			const cfg = CATEGORIES[cat];
			const count = activeCountsByCategory[cat] || 0;
			const isCatSelected = selectedCategory === cat;
			return (
				<Badge
					key={cat}
					component="button"
					type="button"
					className="sr-press"
					radius="xl"
					tt="none"
					aria-pressed={isCatSelected}
					onClick={() =>
						railActions.setSelectedCategory(isCatSelected ? "all" : cat)
					}
					style={{
						background: isCatSelected
							? `${cfg.color}22`
							: "var(--app-surface-2)",
						border: `1px solid ${isCatSelected ? cfg.color : palette.border}`,
						color: palette.text,
						fontSize: "0.74rem",
						cursor: "pointer",
						padding: "1px 10px",
					}}
				>
					<span
						style={{
							display: "inline-block",
							width: 6,
							height: 6,
							borderRadius: "50%",
							background: cfg.color,
							marginRight: 6,
							verticalAlign: "middle",
						}}
					/>
					{cfg.label}:{" "}
					<b className="sr-num" style={{ color: cfg.color }}>
						{count}
					</b>
				</Badge>
			);
		})}
	</Group>
);

/** The service/station search box, with its own clear affordance. */
export const ServiceSearch = ({ searchQuery }: { searchQuery: string }) => (
	<TextInput
		placeholder="Search service or station"
		aria-label="Search service or station"
		value={searchQuery}
		onChange={(e) => railActions.setSearchQuery(e.currentTarget.value)}
		size="xs"
		leftSection={<Search size={14} />}
		rightSection={
			searchQuery ? (
				<CloseButton
					size="sm"
					aria-label="Clear search"
					onClick={() => railActions.setSearchQuery("")}
				/>
			) : null
		}
		style={{ width: 200 }}
		styles={{
			input: {
				background: "var(--app-surface-2)",
				borderColor: palette.borderStrong,
				color: palette.text,
				fontSize: "0.8rem",
			},
		}}
	/>
);

/**
 * The map-view preset picker.
 *
 * Mantine hands `onChange` a bare string, so the value is checked against the
 * canonical list rather than asserted into `ViewPreset` — a stale option in the
 * `data` array would otherwise write a preset no viewport bounds exist for.
 */
export const ViewPresetPicker = ({
	viewPreset,
}: {
	viewPreset: ViewPreset;
}) => (
	<SegmentedControl
		size="xs"
		aria-label="Map view"
		value={viewPreset}
		onChange={(val) => {
			if (val === "scotland" || val === "central-belt" || val === "highlands") {
				railActions.setViewPreset(val);
			}
		}}
		data={[
			{ label: "All Scotland", value: "scotland" },
			{ label: "Central Belt", value: "central-belt" },
			{ label: "Highlands", value: "highlands" },
		]}
	/>
);

/** The scrubber. Its bounds are the replay window, 05:00 to 24:00. */
export const TimelineScrubber = ({ timeOffset }: { timeOffset: number }) => (
	<div style={{ padding: "0 4px" }}>
		<Slider
			min={300} // 05:00
			max={1440} // 24:00
			value={timeOffset}
			onChange={(val) => railActions.setTimeOffset(val)}
			label={(val) => formatTime(val)}
			thumbLabel="Replay time"
			thumbValueText={(val) => formatTime(val)}
			styles={{
				bar: { background: palette.accent },
				track: { background: "var(--app-border-strong)" },
			}}
		/>
	</div>
);

/** Play/pause, restart and the playback-speed picker. */
export const PlaybackControls = ({
	isPlaying,
	speed,
}: {
	isPlaying: boolean;
	speed: number;
}) => (
	<Group gap="xs" align="center">
		<Button
			variant="filled"
			radius="xl"
			className="sr-press"
			aria-label={isPlaying ? "Pause" : "Play"}
			onClick={() => railActions.togglePlay()}
			w={40}
			h={40}
			p={0}
			style={{
				background: palette.accent,
				color: palette.bgDeep,
			}}
		>
			{isPlaying ? <Pause size={18} /> : <PlayCircle size={18} />}
		</Button>
		<Button
			variant="default"
			radius="xl"
			className="sr-press"
			aria-label="Restart day"
			onClick={() => railActions.restart()}
			w={40}
			h={40}
			p={0}
			style={{
				color: palette.text,
				borderColor: palette.borderStrong,
			}}
		>
			<RotateCcw size={17} />
		</Button>

		<Group gap="xs" align="center" style={{ marginLeft: 8 }}>
			<Text style={{ color: palette.textMuted, fontSize: "0.8rem" }}>
				Speed
			</Text>
			<Select
				value={String(speed)}
				onChange={(val) => railActions.setSpeed(Number(val ?? 1))}
				aria-label="Playback speed"
				size="xs"
				allowDeselect={false}
				style={{ width: 116 }}
				data={[
					{ value: "0.5", label: "0.5x (30s/s)" },
					{ value: "1", label: "1x (1m/s)" },
					{ value: "2", label: "2x (2m/s)" },
					{ value: "5", label: "5x (5m/s)" },
					{ value: "15", label: "15x (15m/s)" },
				]}
			/>
		</Group>
	</Group>
);

/** The four named moments of the day, as one-click jumps. */
export const QuickJumps = () => (
	<Group gap={6} wrap="wrap" align="center">
		<Text
			className="sr-num"
			style={{ color: palette.textFaint, fontSize: "0.78rem" }}
		>
			Jump to
		</Text>
		<QuickJump label="08:00 Morning" icon={<TrendingUp size={14} />} to={480} />
		<QuickJump label="13:00 Midday" icon={<Sun size={14} />} to={780} />
		<QuickJump
			label="17:30 Evening"
			icon={<TrendingDown size={14} />}
			to={1050}
		/>
		<QuickJump label="22:00 Sleeper" icon={<Moon size={14} />} to={1320} />
	</Group>
);

const QuickJump = ({
	label,
	icon,
	to,
}: {
	label: string;
	icon: React.ReactNode;
	to: number;
}) => (
	<Button
		size="xs"
		variant="default"
		className="sr-chip sr-press"
		leftSection={icon}
		onClick={() => railActions.setTimeOffset(to)}
	>
		{label}
	</Button>
);
