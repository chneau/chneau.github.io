import {
	Alert,
	Badge,
	Box,
	Button,
	Checkbox,
	Group,
	Loader,
	Paper,
	ScrollArea,
	Select,
	Stack,
	Table,
	Text,
} from "@mantine/core";
import { CheckCheck, RotateCcw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "../../shared/save/components/ConfirmDialog";
import {
	type QuestDescription,
	type QuestEdit,
	type QuestEntry,
	type QuestKind,
	type QuestPresetEdit,
	questKindLabels,
	questStateLabel,
	questStateLabels,
} from "../lib/save-engine/quests";
import type { SaveSession } from "../lib/save-engine/session";
import type { QuestStateEdit } from "../lib/staged-edits";
import { PanelPager } from "./panel-pager";
import { PanelSearchField } from "./panel-search";

type PanelProps = {
	session: SaveSession;
	edits: QuestStateEdit[];
	busy: boolean;
	error: string;
	onStage: (edits: QuestStateEdit[]) => void;
};

const PAGE_SIZE = 25;

const kindOrder: QuestKind[] = ["quest", "mission", "stage", "gauge"];

type QuestPreset = "completeAll" | "resetAll";

const NO_ENTRIES: readonly QuestEntry[] = [];

const stagedByRow = (edits: QuestStateEdit[]): Map<string, number> => {
	const map = new Map<string, number>();
	for (const edit of edits) {
		if (edit.type !== "quest") continue;
		for (const id of edit.ids) map.set(id, edit.state);
	}
	return map;
};

const stagedRowCount = (edits: QuestStateEdit[]): number =>
	edits
		.filter((edit) => edit.type === "quest")
		.reduce(
			(total, edit) => total + (edit.type === "quest" ? edit.ids.length : 0),
			0,
		);

const withRowMovedTo = (
	edits: QuestStateEdit[],
	presets: QuestPresetEdit[],
	entry: QuestEntry,
	state: number,
): QuestStateEdit[] => {
	const idsByState = new Map<number, string[]>();
	for (const edit of edits) {
		if (edit.type !== "quest") continue;
		for (const id of edit.ids) {
			if (id === entry.id) continue;
			const ids = idsByState.get(edit.state) ?? [];
			ids.push(id);
			idsByState.set(edit.state, ids);
		}
	}
	if (state !== entry.state) {
		const ids = idsByState.get(state) ?? [];
		ids.push(entry.id);
		idsByState.set(state, ids);
	}
	const rows: QuestEdit[] = [...idsByState.entries()]
		.filter(([, ids]) => ids.length > 0)
		.map(([target, ids]) => ({
			type: "quest",
			ids,
			state: target,
			label: `${questStateLabel(target)} · ${ids.length} row${
				ids.length === 1 ? "" : "s"
			}`,
		}));
	return [...presets, ...rows];
};

const withPresetToggled = (
	edits: QuestStateEdit[],
	preset: QuestPreset,
	kinds: QuestKind[],
): QuestStateEdit[] => {
	const presets = edits.filter(
		(edit): edit is QuestPresetEdit => edit.type === "questPreset",
	);
	const rows = edits.filter((edit): edit is QuestEdit => edit.type === "quest");
	const rest = presets.filter((edit) => edit.preset !== preset);
	const queued = presets.find((edit) => edit.preset === preset);
	if (queued) return [...rest, ...rows];
	const verb = preset === "completeAll" ? "Complete" : "Reset";
	return [
		{
			type: "questPreset",
			preset,
			kinds,
			label: `${verb} every ${kinds
				.map((entry) => questKindLabels[entry])
				.join(", ")
				.toLowerCase()}`,
		},
		...rest,
		...rows,
	];
};

const QuestRow = ({
	entry,
	state,
	busy,
	onStage,
}: {
	entry: QuestEntry;
	state: number | null;
	busy: boolean;
	onStage: (state: number) => void;
}) => (
	<Table.Tr>
		<Table.Td>
			<Group gap="xs" wrap="nowrap">
				<Badge
					size="xs"
					variant="light"
					color="brand"
					styles={{ label: { textTransform: "none", fontWeight: 500 } }}
				>
					{questKindLabels[entry.kind]}
				</Badge>
				<Box style={{ minWidth: 0 }}>
					<Text size="sm" fw={500} truncate>
						{entry.kind === "stage"
							? `Stage ${entry.key}`
							: (entry.name ?? `Key ${entry.key}`)}
					</Text>
					<Text size="10px" c="dimmed" truncate>
						{entry.kind === "stage"
							? (entry.questName ?? "Owning quest unknown")
							: entry.id}
					</Text>
				</Box>
			</Group>
		</Table.Td>
		<Table.Td>
			<Text size="xs" ff="monospace">
				{entry.key}
			</Text>
		</Table.Td>
		<Table.Td>
			<Select
				size="xs"
				allowDeselect={false}
				disabled={busy || !entry.editable}
				placeholder="not stored"
				value={state === null ? null : String(state)}
				data={Object.entries(questStateLabels).map(([value, label]) => ({
					value,
					label: `${label} (${value})`,
				}))}
				onChange={(value) => {
					if (value === null) return;
					onStage(Number(value));
				}}
			/>
		</Table.Td>
	</Table.Tr>
);

const PresetControls = ({
	scope,
	presets,
	busy,
	loaded,
	onScopeChange,
	onConfirm,
}: {
	scope: QuestKind | "all";
	presets: QuestPresetEdit[];
	busy: boolean;
	loaded: boolean;
	onScopeChange: (scope: QuestKind | "all") => void;
	onConfirm: (preset: QuestPreset) => void;
}) => (
	<Group align="flex-end" gap="sm">
		<Select
			w={200}
			size="xs"
			label="Batch scope"
			value={scope}
			allowDeselect={false}
			data={[
				{ value: "all", label: "All four tables" },
				...kindOrder.map((entry) => ({
					value: entry,
					label: questKindLabels[entry],
				})),
			]}
			onChange={(value) =>
				onScopeChange((value ?? "quest") as QuestKind | "all")
			}
		/>
		<Button
			size="xs"
			variant={
				presets.some((edit) => edit.preset === "completeAll")
					? "filled"
					: "default"
			}
			leftSection={<CheckCheck size={14} />}
			disabled={busy || !loaded}
			onClick={() => onConfirm("completeAll")}
		>
			Complete all
		</Button>
		<Button
			size="xs"
			variant={
				presets.some((edit) => edit.preset === "resetAll")
					? "filled"
					: "default"
			}
			leftSection={<RotateCcw size={14} />}
			disabled={busy || !loaded}
			onClick={() => onConfirm("resetAll")}
		>
			Reset all
		</Button>
	</Group>
);

const StagedQuestSummary = ({
	edits,
	presets,
	busy,
	onDiscard,
}: {
	edits: QuestStateEdit[];
	presets: QuestPresetEdit[];
	busy: boolean;
	onDiscard: () => void;
}) => (
	<Paper
		withBorder
		p="md"
		style={{ borderColor: "var(--mantine-primary-color-light)" }}
		aria-label="Staged quest changes"
	>
		<Group justify="space-between" gap="md" wrap="nowrap">
			<Box>
				<Text size="sm" fw={500}>
					{stagedRowCount(edits).toLocaleString()} rows staged
				</Text>
				<Text size="xs" c="dimmed">
					{presets.length > 0
						? `${presets.map((edit) => edit.label).join(" · ")}. `
						: ""}
					Resetting a row also clears its timestamps and completion count.
				</Text>
			</Box>
			<Button
				size="compact-sm"
				variant="subtle"
				disabled={busy}
				onClick={onDiscard}
			>
				Discard all
			</Button>
		</Group>
	</Paper>
);

const PresetConfirmModal = ({
	preset,
	scope,
	onCancel,
	onConfirm,
}: {
	preset: QuestPreset | null;
	scope: QuestKind | "all";
	onCancel: () => void;
	onConfirm: (preset: QuestPreset) => void;
}) => (
	<ConfirmDialog
		opened={preset !== null}
		title={
			preset === "completeAll"
				? "Complete All Quests / Stages?"
				: "Reset All Quests / Stages?"
		}
		body={
			preset === "completeAll"
				? `Are you sure you want to mark all ${
						scope === "all" ? "four tables" : questKindLabels[scope]
					} as completed?`
				: `Are you sure you want to reset all progress on ${
						scope === "all" ? "four tables" : questKindLabels[scope]
					}? This clears timestamps and completion counters.`
		}
		confirmLabel={preset === "completeAll" ? "Complete all" : "Reset all"}
		dangerous={preset === "resetAll"}
		onCancel={onCancel}
		onConfirm={() => {
			if (preset) onConfirm(preset);
		}}
	/>
);

export const QuestsPanel = ({
	session,
	edits,
	busy,
	error,
	onStage,
}: PanelProps) => {
	const [description, setDescription] = useState<QuestDescription | null>(null);
	const [loadError, setLoadError] = useState("");
	const [loading, setLoading] = useState(true);
	const [kind, setKind] = useState<QuestKind | "all">("quest");
	const [query, setQuery] = useState("");
	const [onlyIncomplete, setOnlyIncomplete] = useState(true);
	const [page, setPage] = useState(0);
	const [scope, setScope] = useState<QuestKind | "all">("quest");
	const [confirmPreset, setConfirmPreset] = useState<QuestPreset | null>(null);

	useEffect(() => {
		let active = true;
		setLoading(true);
		session
			.describeQuests()
			.then((next) => {
				if (!active) return;
				setDescription(next);
				setLoadError("");
			})
			.catch((reason: unknown) => {
				if (!active) return;
				setLoadError(reason instanceof Error ? reason.message : String(reason));
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [session]);

	const entries = description?.entries ?? NO_ENTRIES;

	const staged = useMemo(() => stagedByRow(edits), [edits]);

	const presets = edits.filter(
		(edit): edit is QuestPresetEdit => edit.type === "questPreset",
	);

	const matches = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return entries.filter((entry) => {
			if (kind !== "all" && entry.kind !== kind) return false;
			const state = staged.get(entry.id) ?? entry.state;
			if (onlyIncomplete && state === 5) return false;
			if (!needle) return true;
			return (
				(entry.name ?? "").toLowerCase().includes(needle) ||
				(entry.questName ?? "").toLowerCase().includes(needle) ||
				String(entry.key).includes(needle)
			);
		});
	}, [entries, kind, onlyIncomplete, query, staged]);

	const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
	const current = Math.min(page, pages - 1);
	const visible = matches.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

	const stageState = useCallback(
		(entry: QuestEntry, state: number) => {
			onStage(withRowMovedTo(edits, presets, entry, state));
		},
		[edits, onStage, presets],
	);

	const stagePreset = (preset: QuestPreset) => {
		onStage(
			withPresetToggled(edits, preset, scope === "all" ? kindOrder : [scope]),
		);
	};

	if (loadError || description?.error) {
		return (
			<Stack component="section" gap="lg" p="md" style={{ flex: 1 }}>
				<Alert color="yellow" title="Quest editing unavailable">
					{loadError || description?.error}
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
			{error && (
				<Alert
					color="red"
					icon={<TriangleAlert size={16} />}
					title="Could not apply quest changes"
				>
					{error}
				</Alert>
			)}

			<Group justify="space-between" gap="md" align="flex-start">
				<Box>
					<Group gap="xs">
						<CheckCheck size={18} color="var(--mantine-primary-color-filled)" />
						<Text component="h2" size="xl" fw={600}>
							Quests, missions & stages
						</Text>
					</Group>
					<Text mt={4} size="sm" c="dimmed">
						A save tracks the story four times over: the journal entry, its
						missions, every stage the world reacts to, and the repeatable
						gauges.
					</Text>
				</Box>
				{description && (
					<Text size="sm" c="dimmed" ta="right">
						{kindOrder
							.map(
								(entry) =>
									`${questKindLabels[entry]} ${description.counts[
										entry
									].toLocaleString()}`,
							)
							.join(" · ")}
					</Text>
				)}
			</Group>

			<PresetControls
				scope={scope}
				presets={presets}
				busy={busy}
				loaded={Boolean(description)}
				onScopeChange={setScope}
				onConfirm={setConfirmPreset}
			/>

			{edits.length > 0 && (
				<StagedQuestSummary
					edits={edits}
					presets={presets}
					busy={busy}
					onDiscard={() => onStage([])}
				/>
			)}

			<Group align="flex-end" gap="md">
				<PanelSearchField
					label="Search"
					placeholder="Quest, mission or stage name, or a key"
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
						{
							value: "all",
							label: `All tables (${entries.length.toLocaleString()})`,
						},
						...kindOrder.map((entry) => ({
							value: entry,
							label: `${questKindLabels[entry]} (${(
								description?.counts[entry] ?? 0
							).toLocaleString()})`,
						})),
					]}
					onChange={(value) => {
						setKind((value ?? "all") as QuestKind | "all");
						setPage(0);
					}}
				/>
				<Checkbox
					mb={8}
					label="Not completed"
					checked={onlyIncomplete}
					onChange={(event) => {
						setOnlyIncomplete(event.currentTarget.checked);
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
							<Table.Th>Key</Table.Th>
							<Table.Th w={200}>State</Table.Th>
						</Table.Tr>
					</Table.Thead>
					<Table.Tbody>
						{loading && (
							<Table.Tr>
								<Table.Td colSpan={3}>
									<Group gap="xs" py="md" justify="center">
										<Loader size={16} />
										<Text size="sm" c="dimmed">
											Reading the quest tables — this one takes a moment.
										</Text>
									</Group>
								</Table.Td>
							</Table.Tr>
						)}
						{!loading &&
							visible.map((entry) => (
								<QuestRow
									key={entry.id}
									entry={entry}
									state={staged.get(entry.id) ?? entry.state}
									busy={busy}
									onStage={(next) => stageState(entry, next)}
								/>
							))}
						{!loading && visible.length === 0 && (
							<Table.Tr>
								<Table.Td colSpan={3}>
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

			<PresetConfirmModal
				preset={confirmPreset}
				scope={scope}
				onCancel={() => setConfirmPreset(null)}
				onConfirm={(preset) => {
					stagePreset(preset);
					setConfirmPreset(null);
				}}
			/>
		</Stack>
	);
};
