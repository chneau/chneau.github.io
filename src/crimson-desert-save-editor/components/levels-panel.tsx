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
	Stack,
	Table,
	Text,
	TextInput,
} from "@mantine/core";
import { Search, TrendingUp, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
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

const BLANK: CharacterChange = {
	level: null,
	maxLevel: null,
	experience: null,
	threatRewarded: null,
	memoryRewarded: null,
};

const kindOrder: CharacterKind[] = ["player", "bond", "region", "companion"];

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

	const entries = description?.entries ?? [];
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

	const field = (
		entry: CharacterEntry,
		name: "level" | "maxLevel" | "experience",
		limit: number,
	) => {
		const stored = entry[name];
		const staged = rowEdit(entry.id)?.[name] ?? null;
		// A field the save omits because it still holds its default is editable
		// anyway — the applier creates it — so only a field this row does not
		// track at all is disabled.
		const canCreate = entry.creatable.includes(name);
		const active = stored !== null || staged !== null || canCreate;
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
				value={staged ?? stored ?? ""}
				onChange={(next) =>
					stageRow(entry, {
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

	const flag = (
		entry: CharacterEntry,
		name: "threatRewarded" | "memoryRewarded",
		label: string,
	) => {
		const staged = rowEdit(entry.id)?.[name] ?? null;
		const value = staged ?? entry[name] ?? false;
		return (
			<Checkbox
				size="xs"
				disabled={busy || entry.kind !== "bond"}
				label={label}
				checked={Boolean(value)}
				onChange={(event) =>
					stageRow(entry, { [name]: event.currentTarget.checked })
				}
			/>
		);
	};

	if (description?.error) {
		return (
			<Stack component="main" gap="lg" p="md" style={{ flex: 1 }}>
				<Alert color="yellow" title="Level editing unavailable">
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
			{error && (
				<Alert color="red" title="Could not apply changes">
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
								{edits.filter((edit) => edit.type === "character").length} row
								{edits.filter((edit) => edit.type === "character").length === 1
									? ""
									: "s"}{" "}
								queued
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
						label="Search rows"
						placeholder="Search names, ids or keys"
						leftSection={<Search size={16} />}
						value={query}
						onChange={(event) => {
							setQuery(event.currentTarget.value);
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
			</Box>

			<Box>
				<ScrollArea.Autosize
					mah={420}
					type="auto"
					style={{ border: "1px solid var(--mantine-color-dark-4)" }}
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
								<Table.Tr key={entry.id}>
									<Table.Td>
										<Group gap="xs" wrap="nowrap">
											<Badge
												size="xs"
												variant="light"
												color="brand"
												styles={{
													label: { textTransform: "none", fontWeight: 500 },
												}}
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
									<Table.Td>{field(entry, "level", levelLimit)}</Table.Td>
									<Table.Td>
										{entry.kind === "region" ? (
											field(entry, "maxLevel", levelLimit)
										) : (
											<Text size="xs" c="dimmed">
												—
											</Text>
										)}
									</Table.Td>
									<Table.Td>
										{field(entry, "experience", experienceLimit)}
									</Table.Td>
									<Table.Td>
										{entry.kind === "bond" ? (
											<Group gap="sm">
												{flag(entry, "threatRewarded", "Threat")}
												{flag(entry, "memoryRewarded", "Memory")}
											</Group>
										) : (
											<Text size="xs" c="dimmed">
												—
											</Text>
										)}
									</Table.Td>
								</Table.Tr>
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
				<Group justify="space-between" mt="sm">
					<Text size="xs" c="dimmed">
						{matches.length.toLocaleString()} rows
					</Text>
					<Pagination
						size="sm"
						total={pages}
						value={current + 1}
						onChange={(next) => setPage(next - 1)}
					/>
				</Group>
			</Box>
		</Stack>
	);
};
