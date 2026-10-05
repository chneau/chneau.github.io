import {
	Alert,
	Badge,
	Box,
	Button,
	Checkbox,
	Group,
	NumberInput,
	Paper,
	ScrollArea,
	Select,
	Stack,
	Table,
	Text,
} from "@mantine/core";
import { TrendingUp, TriangleAlert, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { PanelPager } from "@/components/panel-pager";
import { PanelSearchField } from "@/components/panel-search";
import type {
	CharacterChange,
	CharacterDescription,
	CharacterEdit,
	CharacterEntry,
	CharacterKind,
	CharacterPresetEdit,
} from "@/lib/save-engine/characters";
import {
	characterKindLabels,
	experienceLimit,
	levelLimit,
} from "@/lib/save-engine/characters";
import type { LevelEdit } from "@/lib/staged-edits";

type PanelProps = {
	description?: CharacterDescription;
	edits: LevelEdit[];
	busy: boolean;
	error: string;
	onStage: (edits: LevelEdit[]) => void;
};

const PAGE_SIZE = 25;

/**
 * The fallback for a save with no character rows.
 *
 * Module-level because the `matches` memo depends on this list, and an inline
 * `?? []` is a fresh array on every render — so the filter re-ran on every
 * keystroke in the one case where there is nothing to filter. Nothing mutates
 * it; the panel only filters it and reads its length.
 */
const NO_ENTRIES: readonly CharacterEntry[] = [];

const BLANK: CharacterChange = {
	level: null,
	maxLevel: null,
	experience: null,
	threatRewarded: null,
	memoryRewarded: null,
};

const kindOrder: CharacterKind[] = ["player", "bond", "region", "companion"];

/**
 * One tracked row: its kind and name, a box per numeric field it carries, and
 * the two reward checkboxes a bond has and nothing else does.
 *
 * The row is the natural unit — the field boxes are the same input three times
 * over and the checkboxes exist only for bonds, so both decisions belong with
 * the row rather than with the panel that filters it.
 */
const LevelRow = ({
	entry,
	staged,
	busy,
	onStage,
}: {
	entry: CharacterEntry;
	/** This row's staged change, when the user has touched one of its fields. */
	staged: CharacterEdit | undefined;
	busy: boolean;
	onStage: (patch: Partial<CharacterChange>) => void;
}) => {
	const field = (name: "level" | "maxLevel" | "experience", limit: number) => {
		const stored = entry[name];
		const stagedValue = staged?.[name] ?? null;
		// A field the save omits because it still holds its default is editable
		// anyway — the applier creates it — so only a field this row does not
		// track at all is disabled.
		const canCreate = entry.creatable.includes(name);
		const active = stored !== null || stagedValue !== null || canCreate;
		return (
			<NumberInput
				size="xs"
				w={96}
				hideControls
				min={0}
				max={limit}
				clampBehavior="strict"
				disabled={busy || !active}
				placeholder={canCreate && stored === null ? "add" : "not stored"}
				value={stagedValue ?? stored ?? ""}
				onChange={(next) =>
					onStage({
						[name]:
							next === "" || next === undefined
								? null
								: Math.min(limit, Math.max(0, Number(next))),
					})
				}
				aria-label={`${name} of ${entry.id}`}
			/>
		);
	};

	const flag = (name: "threatRewarded" | "memoryRewarded", label: string) => {
		const value = staged?.[name] ?? entry[name] ?? false;
		return (
			<Checkbox
				size="xs"
				disabled={busy || entry.kind !== "bond"}
				label={label}
				checked={Boolean(value)}
				onChange={(event) => onStage({ [name]: event.currentTarget.checked })}
			/>
		);
	};

	return (
		<Table.Tr>
			<Table.Td>
				<Group gap="xs" wrap="nowrap">
					<Badge
						size="xs"
						variant="light"
						color="brand"
						styles={{ label: { textTransform: "none", fontWeight: 500 } }}
					>
						{characterKindLabels[entry.kind]}
					</Badge>
					<Box style={{ minWidth: 0 }}>
						<Text size="sm" fw={500} truncate>
							{entry.name ?? `Key ${entry.key}`}
						</Text>
						<Text size="10px" c="dimmed" ff="monospace">
							{entry.id}
						</Text>
					</Box>
				</Group>
			</Table.Td>
			<Table.Td>{field("level", levelLimit)}</Table.Td>
			<Table.Td>
				{entry.kind === "region" ? (
					field("maxLevel", levelLimit)
				) : (
					<Text size="xs" c="dimmed">
						—
					</Text>
				)}
			</Table.Td>
			<Table.Td>{field("experience", experienceLimit)}</Table.Td>
			<Table.Td>
				{entry.kind === "bond" ? (
					<Group gap="sm">
						{flag("threatRewarded", "Threat")}
						{flag("memoryRewarded", "Memory")}
					</Group>
				) : (
					<Text size="xs" c="dimmed">
						—
					</Text>
				)}
			</Table.Td>
		</Table.Tr>
	);
};

/** How many of the staged edits are per-row changes rather than presets. */
const stagedRowCount = (edits: LevelEdit[]): number =>
	edits.filter((edit) => edit.type === "character").length;

/**
 * Every level the save tracks, in one table.
 *
 * The staged change lives on the page rather than here, so the panel is a pure
 * function of the `edits` it is handed: reopening the view shows the same
 * pending values, and nothing is lost by switching sections.
 */
export const LevelsPanel = ({
	description,
	edits,
	busy,
	error,
	onStage,
}: PanelProps) => {
	const [kind, setKind] = useState<CharacterKind | "all">("all");
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(0);

	const entries = description?.entries ?? NO_ENTRIES;
	const matches = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return entries.filter((entry) => {
			if (kind !== "all" && entry.kind !== kind) return false;
			if (!needle) return true;
			return (
				(entry.name ?? "").toLowerCase().includes(needle) ||
				entry.id.toLowerCase().includes(needle) ||
				String(entry.key).includes(needle)
			);
		});
	}, [entries, kind, query]);
	const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
	const current = Math.min(page, pages - 1);
	const visible = matches.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

	const rowEdit = (id: string): CharacterEdit | undefined => {
		return edits.find(
			(edit): edit is CharacterEdit =>
				edit.type === "character" && edit.id === id,
		);
	};

	const presets = edits.filter(
		(edit): edit is CharacterPresetEdit => edit.type === "characterPreset",
	);

	/** Replaces one row's staged change, keeping the presets and other rows. */
	const stageRow = (entry: CharacterEntry, patch: Partial<CharacterChange>) => {
		const merged: CharacterChange = {
			...BLANK,
			...rowEdit(entry.id),
			...patch,
		};
		const rows = edits.filter(
			(edit): edit is CharacterEdit => edit.type === "character",
		);
		const others = rows.filter((edit) => edit.id !== entry.id);
		const empty = Object.values(merged).every((value) => value === null);
		onStage(
			empty
				? [...presets, ...others]
				: [
						...presets,
						...others,
						{
							type: "character",
							id: entry.id,
							label: entry.name ?? entry.id,
							...merged,
						},
					],
		);
	};

	/** Queues an area-wide preset, or clears it when it is already queued. */
	const stagePreset = (
		preset: "bondRewards" | "regionLevels",
		level?: number,
	) => {
		const rows = edits.filter(
			(edit): edit is CharacterEdit => edit.type === "character",
		);
		const queued = presets.some((edit) => edit.preset === preset);
		onStage(
			queued
				? rows
				: [
						{
							type: "characterPreset",
							preset,
							label:
								preset === "bondRewards"
									? "Mark every bond reward earned"
									: `Set every progression row to ${level ?? levelLimit}`,
							level,
						},
						...rows,
					],
		);
	};

	if (description?.error) {
		return (
			<Stack component="section" gap="lg" p="md" style={{ flex: 1 }}>
				<Alert color="yellow" title="Level editing unavailable">
					{description.error}
				</Alert>
			</Stack>
		);
	}

	const stagedRows = stagedRowCount(edits);

	return (
		<Stack
			component="section"
			gap="lg"
			p="md"
			style={{ flex: 1, minHeight: 0, overflow: "auto" }}
		>
			{error && (
				<Alert
					color="red"
					icon={<TriangleAlert size={16} />}
					title="Could not apply level changes"
				>
					{error}
				</Alert>
			)}

			<Group justify="space-between" gap="md" align="flex-start">
				<Box>
					<Group gap="xs">
						<TrendingUp size={18} color="var(--mantine-primary-color-filled)" />
						<Text component="h2" size="xl" fw={600}>
							Levels & experience
						</Text>
					</Group>
					<Text mt={4} size="sm" c="dimmed">
						The player, every bond you have formed, the progression tracks
						behind them, and each companion you own. A field marked
						&ldquo;add&rdquo; is one the game has not written yet, and setting
						it creates it.
					</Text>
				</Box>
				{description && (
					<Text size="sm" c="dimmed" ta="right">
						{kindOrder
							.map(
								(entry) =>
									`${characterKindLabels[entry]} ${description.counts[entry]}`,
							)
							.join(" · ")}
					</Text>
				)}
			</Group>

			<Group gap="sm">
				<Button
					size="xs"
					variant={
						presets.some((edit) => edit.preset === "bondRewards")
							? "filled"
							: "default"
					}
					leftSection={<TrendingUp size={14} />}
					disabled={busy || !description}
					onClick={() => stagePreset("bondRewards")}
				>
					Mark every bond reward earned
				</Button>
				<Button
					size="xs"
					variant={
						presets.some((edit) => edit.preset === "regionLevels")
							? "filled"
							: "default"
					}
					leftSection={<TrendingUp size={14} />}
					disabled={busy || !description}
					onClick={() => stagePreset("regionLevels", levelLimit)}
				>
					Max every progression row
				</Button>
			</Group>

			{edits.length > 0 && (
				<Paper
					withBorder
					p="md"
					style={{ borderColor: "var(--mantine-primary-color-light)" }}
					aria-label="Staged level changes"
				>
					<Group justify="space-between" gap="md" wrap="nowrap">
						<Box>
							<Text size="sm" fw={500}>
								{stagedRows} row{stagedRows === 1 ? "" : "s"} staged
								{presets.length > 0
									? ` · ${presets.map((edit) => edit.label).join(" · ")}`
									: ""}
							</Text>
							<Text size="xs" c="dimmed">
								Applied when you download the edited save.
							</Text>
						</Box>
						<Button
							size="compact-sm"
							variant="subtle"
							leftSection={<Undo2 size={14} />}
							disabled={busy}
							onClick={() => onStage([])}
						>
							Discard all
						</Button>
					</Group>
				</Paper>
			)}

			<Group align="flex-end" gap="md">
				<PanelSearchField
					label="Search rows"
					placeholder="Search names, ids or keys"
					value={query}
					onChange={(value) => {
						setQuery(value);
						setPage(0);
					}}
					onClear={() => {
						setQuery("");
						setPage(0);
					}}
				/>
				<Select
					w={190}
					label="Table"
					value={kind}
					allowDeselect={false}
					data={[
						{ value: "all", label: `All rows (${entries.length})` },
						...kindOrder.map((entry) => ({
							value: entry,
							label: `${characterKindLabels[entry]} (${
								description?.counts[entry] ?? 0
							})`,
						})),
					]}
					onChange={(value) => {
						setKind((value ?? "all") as CharacterKind | "all");
						setPage(0);
					}}
				/>
			</Group>

			<ScrollArea.Autosize
				mah={420}
				type="auto"
				style={{ border: "1px solid var(--app-border)" }}
			>
				<Table stickyHeader highlightOnHover verticalSpacing="xs" fz="xs">
					<Table.Thead>
						<Table.Tr>
							<Table.Th>Row</Table.Th>
							<Table.Th>Level</Table.Th>
							<Table.Th>Highest reached</Table.Th>
							<Table.Th>Experience</Table.Th>
							<Table.Th>Rewards</Table.Th>
						</Table.Tr>
					</Table.Thead>
					<Table.Tbody>
						{visible.map((entry) => (
							<LevelRow
								key={entry.id}
								entry={entry}
								staged={rowEdit(entry.id)}
								busy={busy}
								onStage={(patch) => stageRow(entry, patch)}
							/>
						))}
						{visible.length === 0 && (
							<Table.Tr>
								<Table.Td colSpan={5}>
									<Text size="sm" c="dimmed" ta="center" py="md">
										No rows match this filter.
									</Text>
								</Table.Td>
							</Table.Tr>
						)}
					</Table.Tbody>
				</Table>
			</ScrollArea.Autosize>
			<PanelPager
				count={`${matches.length.toLocaleString()} rows`}
				pages={pages}
				current={current}
				onPageChange={setPage}
			/>
		</Stack>
	);
};
