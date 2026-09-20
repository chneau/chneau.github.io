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
	TextInput,
	UnstyledButton,
} from "@mantine/core";
import { Check, Eraser, RotateCcw, Search, Sparkles } from "lucide-react";
import { useState } from "react";
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
					active
						? "var(--mantine-primary-color-light)"
						: "var(--mantine-color-dark-7)"
				}
				style={{
					borderColor: active
						? "var(--mantine-primary-color-filled)"
						: "var(--mantine-color-dark-4)",
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
							color: "var(--mantine-color-dark-9)",
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
			<Text size="sm" c={(entry.currentLevel ?? 0) >= 1 ? undefined : "dimmed"}>
				{entry.currentLevel === null ? "unlearned" : entry.currentLevel}
			</Text>
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
	const reset = (action: () => void) => {
		action();
		setPage(0);
	};
	const setOverride = (key: number, level: number | undefined) => {
		setOverrides((existing) => {
			const next = { ...existing };
			if (level === undefined) delete next[key];
			else next[key] = level;
			return next;
		});
	};
	const stage = () => {
		const levels = Object.entries(overrides)
			.map(([key, level]) => ({ key: Number(key), level }))
			.sort((a, b) => a.key - b.key);
		onStage({
			type: "skills",
			mode,
			levels: levels.length ? levels : undefined,
			label: info.label,
			targets: plan?.targets ?? 0,
			injected: plan?.injected ?? 0,
			patched: plan?.patched ?? 0,
			relearned: plan?.relearned ?? 0,
		});
	};

	if (description?.error) {
		return (
			<Stack component="main" gap="lg" p="md" style={{ flex: 1 }}>
				<Alert color="yellow" title="Skill editing unavailable">
					{description.error}
				</Alert>
			</Stack>
		);
	}

	return (
		<Stack
			component="main"
			gap="lg"
			p="md"
			style={{ flex: 1, minHeight: 0, overflow: "auto" }}
		>
			{(error || description?.error) && (
				<Alert color="red" title="Could not apply changes">
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
								Queued for your next download: {edit.label}
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
							Discard
						</Button>
					</Group>
				</Paper>
			)}

			<Box>
				<Group align="flex-end" gap="md">
					<TextInput
						w="100%"
						style={{ flex: 1, minWidth: "12rem" }}
						label="Search skill entries"
						placeholder="Search names or keys"
						leftSection={<Search size={16} />}
						value={query}
						onChange={(event) => {
							const value = event.currentTarget.value;
							reset(() => setQuery(value));
						}}
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
								label: `Skill tree (${
									(description?.skillTotal ?? 0) -
									(description?.entries.filter(
										(entry) => entry.group === "abilities",
									).length ?? 0)
								})`,
							},
							{
								value: "abilities",
								label: `Abilities (${
									description?.entries.filter(
										(entry) => entry.group === "abilities",
									).length ?? 0
								})`,
							},
						]}
						onChange={(value) =>
							reset(() => setGroup((value ?? "all") as SkillGroupFilter))
						}
					/>
					<Checkbox
						mb={8}
						label={`Unlearned only (${missingSkillCount(
							description,
							group,
						).toLocaleString()})`}
						checked={missingOnly}
						onChange={(event) => {
							const value = event.currentTarget.checked;
							reset(() => setMissingOnly(value));
						}}
					/>
				</Group>
			</Box>

			<Box>
				<ScrollArea.Autosize
					mah={420}
					type="auto"
					style={{ border: "1px solid var(--mantine-color-dark-4)" }}
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
								onClick={() =>
									reset(() => {
										setQuery("");
										setGroup("all");
										setMissingOnly(false);
									})
								}
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

			<Paper withBorder p="md" bg="var(--mantine-color-dark-7)">
				<Group justify="space-between" gap="md" align="flex-end">
					<Box maw={620}>
						<Text size="sm" fw={500}>
							Stage {info.label.toLowerCase()}
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
							onClick={() => setOverrides({})}
						>
							Clear overrides
						</Button>
						<Button
							leftSection={
								edit ? <RotateCcw size={16} /> : <Sparkles size={16} />
							}
							disabled={busy || !description}
							onClick={stage}
						>
							{edit ? "Replace staged change" : "Stage change"}
						</Button>
					</Group>
				</Group>
			</Paper>
		</Stack>
	);
};
