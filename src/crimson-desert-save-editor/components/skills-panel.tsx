import {
	Alert,
	Badge,
	Box,
	Button,
	Checkbox,
	Group,
	NumberInput,
	Pagination,
	Paper,
	ScrollArea,
	Select,
	SimpleGrid,
	Stack,
	Table,
	Text,
	UnstyledButton,
} from "@mantine/core";
import {
	Check,
	Eraser,
	RotateCcw,
	Sparkles,
	TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { PanelSearchField } from "@/components/panel-search";
import type {
	SkillDescription,
	SkillEntry,
	SkillMode,
} from "@/lib/save-engine/browser-skills";
import {
	filterSkillEntries,
	maxKnowledgeLevel,
	missingSkillCount,
	modeInfo,
	type SkillEdit,
	type SkillGroupFilter,
	skillEditSummary,
	skillGroupLabels,
	skillModes,
} from "@/lib/skills";

type PanelProps = {
	description?: SkillDescription;
	edit?: SkillEdit;
	busy: boolean;
	error: string;
	onStage: (edit: SkillEdit) => void;
	onDiscard: () => void;
};

const PAGE_SIZE = 25;

/**
 * The staged edit one "Stage change" press produces.
 *
 * The overrides are an object, and the applier walks them in key order, so the
 * sort is not cosmetic: without it the written save differs byte for byte
 * depending on the order the user happened to type into the table, and the
 * round-trip suites could no longer hold it.
 */
const skillEditFor = (
	mode: SkillMode,
	overrides: Record<number, number>,
	label: string,
	plan: SkillDescription["modes"][SkillMode] | undefined,
): SkillEdit => {
	const levels = Object.entries(overrides)
		.map(([key, level]) => ({ key: Number(key), level }))
		.sort((a, b) => a.key - b.key);
	return {
		type: "skills",
		mode,
		levels: levels.length ? levels : undefined,
		label,
		targets: plan?.targets ?? 0,
		injected: plan?.injected ?? 0,
		patched: plan?.patched ?? 0,
		relearned: plan?.relearned ?? 0,
	};
};

const ModeCard = ({
	mode,
	active,
	description,
	onSelect,
}: {
	mode: SkillMode;
	active: boolean;
	description?: SkillDescription;
	onSelect: (mode: SkillMode) => void;
}) => {
	const info = modeInfo(mode);
	const plan = description?.modes[mode];
	const counts = plan
		? [
				`${plan.targets.toLocaleString()} keys`,
				`${plan.injected.toLocaleString()} to add`,
				`${plan.patched.toLocaleString()} to re-level`,
			]
		: [];
	return (
		<UnstyledButton
			onClick={() => onSelect(mode)}
			w="100%"
			aria-pressed={active}
		>
			<Paper
				withBorder
				p="md"
				h="100%"
				bg={
					active ? "var(--mantine-primary-color-light)" : "var(--app-surface-2)"
				}
				style={{
					borderColor: active
						? "var(--mantine-primary-color-filled)"
						: "var(--app-border)",
				}}
			>
				<Group gap="xs" wrap="nowrap">
					<Box
						w={18}
						h={18}
						style={{
							flexShrink: 0,
							display: "grid",
							placeItems: "center",
							border: "1px solid var(--mantine-primary-color-filled)",
							background: active
								? "var(--mantine-primary-color-filled)"
								: "transparent",
							color: "var(--mantine-primary-color-contrast)",
						}}
					>
						{active && <Check size={12} />}
					</Box>
					<Text size="sm" fw={600}>
						{info.label}
					</Text>
				</Group>
				<Text mt="xs" size="xs" c="dimmed">
					{info.blurb}
				</Text>
				{counts.length > 0 && (
					<Text mt="xs" size="xs" c="dimmed" ff="monospace">
						{counts.join(" · ")}
					</Text>
				)}
				{plan && plan.injected === 0 && plan.patched === 0 && (
					<Badge mt="xs" variant="light" color="teal" size="sm">
						Nothing to change
					</Badge>
				)}
			</Paper>
		</UnstyledButton>
	);
};

const EntryRow = ({
	entry,
	override,
	onOverride,
	busy,
}: {
	entry: SkillEntry;
	override: number | undefined;
	onOverride: (key: number, level: number | undefined) => void;
	busy: boolean;
}) => (
	<Table.Tr>
		<Table.Td>
			<Text size="sm">{entry.name}</Text>
			<Text size="xs" c="dimmed" ff="monospace">
				#{entry.key}
			</Text>
		</Table.Td>
		<Table.Td visibleFrom="md">
			<Badge
				variant="outline"
				color={entry.group === "skillTree" ? "brand" : "gray"}
				styles={{ label: { textTransform: "none" } }}
			>
				{skillGroupLabels[entry.group]}
			</Badge>
		</Table.Td>
		<Table.Td>
			<Text size="sm" c="dimmed">
				{entry.referenceLevel ?? "—"}
			</Text>
		</Table.Td>
		<Table.Td>
			{entry.currentLevel === null ? (
				<Badge size="xs" variant="light" color="gray">
					Unlearned
				</Badge>
			) : (
				<Badge size="xs" variant="filled" color="green">
					Level {entry.currentLevel}
				</Badge>
			)}
		</Table.Td>
		<Table.Td>
			<NumberInput
				size="xs"
				w={92}
				min={0}
				max={maxKnowledgeLevel}
				allowDecimal={false}
				placeholder="ref"
				disabled={busy}
				value={override ?? ""}
				aria-label={`Override level for ${entry.name}`}
				onChange={(value) =>
					onOverride(entry.key, typeof value === "number" ? value : undefined)
				}
			/>
		</Table.Td>
	</Table.Tr>
);

/**
 * Search, group and unlearned-only, as one filter row.
 *
 * The panel's own "clear filters" button only exists when the filters have
 * matched nothing, so this takes the three values rather than a reset: making
 * the reset unconditional would change when that button appears, which is a
 * change to what a reader sees and not one this refactor is for.
 */
const SkillFilters = ({
	description,
	query,
	group,
	missingOnly,
	onQueryChange,
	onGroupChange,
	onMissingOnlyChange,
}: {
	description?: SkillDescription;
	query: string;
	group: SkillGroupFilter;
	missingOnly: boolean;
	onQueryChange: (query: string) => void;
	onGroupChange: (group: SkillGroupFilter) => void;
	onMissingOnlyChange: (missingOnly: boolean) => void;
}) => {
	const abilityCount =
		description?.entries.filter((entry) => entry.group === "abilities")
			.length ?? 0;
	return (
		<Group align="flex-end" gap="md">
			<PanelSearchField
				label="Search skill entries"
				placeholder="Search names or keys"
				value={query}
				onChange={onQueryChange}
				onClear={() => onQueryChange("")}
			/>
			<Select
				w={170}
				label="Group"
				value={group}
				allowDeselect={false}
				data={[
					{
						value: "all",
						label: `All entries (${description?.skillTotal ?? 0})`,
					},
					{
						value: "skillTree",
						label: `Skill tree (${(description?.skillTotal ?? 0) - abilityCount})`,
					},
					{ value: "abilities", label: `Abilities (${abilityCount})` },
				]}
				onChange={(value) =>
					onGroupChange((value ?? "all") as SkillGroupFilter)
				}
			/>
			<Checkbox
				mb={8}
				label={`Unlearned only (${missingSkillCount(
					description,
					group,
				).toLocaleString()})`}
				checked={missingOnly}
				onChange={(event) => onMissingOnlyChange(event.currentTarget.checked)}
			/>
		</Group>
	);
};

/**
 * The staged progression change, and the button that replaces it.
 *
 * The table edits one entry at a time while the stage button commits all of
 * them, so the two sit together: what the button will do is stated next to the
 * entries it will do it to.
 */
const SkillStageBar = ({
	mode,
	edit,
	overrideCount,
	busy,
	description,
	onClearOverrides,
	onStage,
}: {
	mode: SkillMode;
	edit: SkillEdit | undefined;
	overrideCount: number;
	busy: boolean;
	description?: SkillDescription;
	onClearOverrides: () => void;
	onStage: () => void;
}) => {
	const label = modeInfo(mode).label;
	return (
		<Paper withBorder p="md" bg="var(--app-surface-2)">
			<Group justify="space-between" gap="md" align="flex-end">
				<Box maw={620}>
					<Text size="sm" fw={500}>
						Stage {label.toLowerCase()}
					</Text>
					<Text mt={4} size="xs" c="dimmed">
						{overrideCount
							? `${overrideCount} of the entries above get your level instead of the reference. Leave a field empty to use the reference value.`
							: "Every entry uses its reference level. Type a level in the table to force a specific value for that entry."}
					</Text>
				</Box>
				<Group gap="xs">
					<Button
						variant="default"
						leftSection={<Eraser size={16} />}
						disabled={busy || overrideCount === 0}
						onClick={onClearOverrides}
					>
						Clear overrides
					</Button>
					<Button
						leftSection={
							edit ? <RotateCcw size={16} /> : <Sparkles size={16} />
						}
						disabled={busy || !description}
						onClick={onStage}
					>
						{edit ? "Replace staged change" : "Stage change"}
					</Button>
				</Group>
			</Group>
		</Paper>
	);
};

export const SkillsPanel = ({
	description,
	edit,
	busy,
	error,
	onStage,
	onDiscard,
}: PanelProps) => {
	const [mode, setMode] = useState<SkillMode>("skills");
	const [overrides, setOverrides] = useState<Record<number, number>>({});
	const [query, setQuery] = useState("");
	const [group, setGroup] = useState<SkillGroupFilter>("all");
	const [missingOnly, setMissingOnly] = useState(false);
	const [page, setPage] = useState(0);

	const info = modeInfo(mode);
	const plan = description?.modes[mode];
	const matches = filterSkillEntries(description, query, group, missingOnly);
	const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
	const current = Math.min(page, pages - 1);
	const visible = matches.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
	const overrideCount = Object.keys(overrides).length;
	/**
	 * Return to the first page after a filter change.
	 *
	 * This used to take the change as a callback — `applyFilter(() => setQuery(v))`
	 * — which reads exactly like a `useState` updater, so
	 * `no-impure-state-updater` flagged every call that closed over `setQuery`
	 * and friends. Nothing was ever handed to React: the closure ran once,
	 * synchronously, from a real event handler. But the shape was a genuine
	 * ambiguity, so the callback is gone and each handler says what it sets.
	 * The page reset is shared here because "a filter changed, so page 0" is the
	 * invariant, not a detail worth repeating at every call site.
	 */
	const toFirstPage = () => setPage(0);
	const setOverride = (key: number, level: number | undefined) => {
		setOverrides((existing) => {
			const next = { ...existing };
			if (level === undefined) delete next[key];
			else next[key] = level;
			return next;
		});
	};
	const stage = () => {
		onStage(skillEditFor(mode, overrides, info.label, plan));
	};

	if (description?.error) {
		return (
			<Stack component="section" gap="lg" p="md" style={{ flex: 1 }}>
				<Alert color="yellow" title="Skill editing unavailable">
					{description.error}
				</Alert>
			</Stack>
		);
	}

	return (
		<Stack
			component="section"
			gap="lg"
			p="md"
			style={{ flex: 1, minHeight: 0, overflow: "auto" }}
		>
			{(error || description?.error) && (
				<Alert
					color="red"
					icon={<TriangleAlert size={16} />}
					title="Could not apply skill changes"
				>
					{error || description?.error}
				</Alert>
			)}

			<Group justify="space-between" gap="md" align="flex-end">
				<Box>
					<Group gap="xs">
						<Sparkles size={18} color="var(--mantine-primary-color-filled)" />
						<Text component="h2" size="xl" fw={600}>
							Skills, knowledge & stats
						</Text>
					</Group>
					<Text mt={4} size="sm" c="dimmed">
						The skill tree is rebuilt by the game from knowledge entries, so
						these edits change knowledge — never the skill list.
					</Text>
				</Box>
				<Text size="sm" c="dimmed" ta="right">
					{description
						? `${description.skillTotal.toLocaleString()} skill entries · ${description.skillsMissing.toLocaleString()} unlearned`
						: "No save is open."}
					{description && (
						<>
							<br />
							{description.knowledgeEntries.toLocaleString()} knowledge entries
							· {description.learnedEntries.toLocaleString()} learned
						</>
					)}
				</Text>
			</Group>

			<SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
				{skillModes.map((entry) => (
					<ModeCard
						key={entry.id}
						mode={entry.id}
						active={entry.id === mode}
						description={description}
						onSelect={(next) => setMode(next)}
					/>
				))}
			</SimpleGrid>

			<Text size="sm" c="dimmed">
				{info.detail}
			</Text>

			{edit && (
				<Paper
					withBorder
					p="md"
					style={{ borderColor: "var(--mantine-primary-color-light)" }}
					aria-label="Staged progression change"
				>
					<Group justify="space-between" gap="md" wrap="nowrap">
						<Box>
							<Text size="sm" fw={500}>
								Staged for your next download: {edit.label}
							</Text>
							<Text size="xs" c="dimmed">
								{skillEditSummary(edit)}
							</Text>
						</Box>
						<Button
							size="compact-sm"
							variant="subtle"
							disabled={busy}
							onClick={onDiscard}
						>
							Remove
						</Button>
					</Group>
				</Paper>
			)}

			<SkillFilters
				description={description}
				query={query}
				group={group}
				missingOnly={missingOnly}
				onQueryChange={(value) => {
					setQuery(value);
					toFirstPage();
				}}
				onGroupChange={(value) => {
					setGroup(value);
					toFirstPage();
				}}
				onMissingOnlyChange={(value) => {
					setMissingOnly(value);
					toFirstPage();
				}}
			/>

			<Box>
				<ScrollArea.Autosize
					mah={420}
					type="auto"
					style={{ border: "1px solid var(--app-border)" }}
				>
					<Table
						stickyHeader
						highlightOnHover
						verticalSpacing="xs"
						horizontalSpacing="md"
					>
						<Table.Thead>
							<Table.Tr>
								<Table.Th>Entry</Table.Th>
								<Table.Th visibleFrom="md">Group</Table.Th>
								<Table.Th>Reference</Table.Th>
								<Table.Th>In save</Table.Th>
								<Table.Th>Your level</Table.Th>
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{visible.map((entry) => (
								<EntryRow
									key={entry.key}
									entry={entry}
									override={overrides[entry.key]}
									onOverride={setOverride}
									busy={busy}
								/>
							))}
						</Table.Tbody>
					</Table>
					{!matches.length && (
						<Stack align="center" gap="xs" py="xl">
							<Text size="sm" c="dimmed">
								No skill entries match these filters.
							</Text>
							<Button
								variant="subtle"
								size="sm"
								onClick={() => {
									setQuery("");
									setGroup("all");
									setMissingOnly(false);
									toFirstPage();
								}}
							>
								Clear filters
							</Button>
						</Stack>
					)}
				</ScrollArea.Autosize>
				<Group justify="space-between" gap="md" mt="xs">
					<Text size="xs" c="dimmed" aria-live="polite">
						{matches.length
							? `${current * PAGE_SIZE + 1}–${Math.min(
									(current + 1) * PAGE_SIZE,
									matches.length,
								)} of ${matches.length} entries`
							: "0 entries"}
						{overrideCount ? ` · ${overrideCount} overridden` : ""}
					</Text>
					{pages > 1 && (
						<Pagination
							total={pages}
							value={current + 1}
							onChange={(value) => setPage(value - 1)}
							withEdges
							size="sm"
							aria-label="Skill entry pages"
						/>
					)}
				</Group>
			</Box>

			<SkillStageBar
				mode={mode}
				edit={edit}
				overrideCount={overrideCount}
				busy={busy}
				description={description}
				onClearOverrides={() => setOverrides({})}
				onStage={stage}
			/>
		</Stack>
	);
};
