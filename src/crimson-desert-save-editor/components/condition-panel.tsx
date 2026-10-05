import {
	Alert,
	Badge,
	Box,
	Button,
	Group,
	NumberInput,
	ScrollArea,
	Select,
	Stack,
	Table,
	Text,
} from "@mantine/core";
import { ShieldCheck, TriangleAlert, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { PanelPager } from "@/components/panel-pager";
import { PanelSearchField } from "@/components/panel-search";
import { storageName } from "@/lib/inventory";
import type {
	ConditionDescription,
	ConditionEntry,
	ItemConditionEdit,
} from "@/lib/save-engine/item-condition";

type PanelProps = {
	description?: ConditionDescription;
	/** Resolves an item key to the catalog's name for that item. */
	nameOf: (itemKey: number) => string;
	edits: ItemConditionEdit[];
	busy: boolean;
	error: string;
	onStage: (edits: ItemConditionEdit[]) => void;
};

const PAGE_SIZE = 25;

/**
 * The table's columns, as data.
 *
 * The header and the empty row's `colSpan` were the same five labels written
 * out twice, and the span was a bare `5` that nothing held to the header — add
 * a wear field and the placeholder row silently stopped spanning the table.
 * Deriving both from one list makes that impossible, and it keeps the header
 * row identical in shape to the other panels' without repeating the markup.
 */
const COLUMNS = [
	"Item",
	"Where",
	"Endurance",
	"Sharpness",
	"Charges left",
] as const;

/**
 * The fallback for a save that carries no wear records.
 *
 * It is a module-level constant rather than a `?? []` written inline because
 * that literal is a *fresh* array on every render: the memos below depend on
 * `entries`, so a new identity each render meant neither of them ever hit and
 * the filtering re-ran on every keystroke. Nothing here mutates it — the panel
 * only maps, filters and slices — so sharing one empty array is safe.
 */
const NO_ENTRIES: readonly ConditionEntry[] = [];

const isSameItem = (edit: ItemConditionEdit, other: ConditionEntry): boolean =>
	edit.inventoryKey === other.inventoryKey &&
	edit.slotNo === other.slotNo &&
	edit.itemKey === other.itemKey;

/** The three channels a wear record can carry, in the order the table shows them. */
const WEAR_FIELDS = ["endurance", "sharpness", "chargedUses"] as const;

type WearField = (typeof WEAR_FIELDS)[number];

/**
 * One worn item: what it is, where it sits, and a box per channel.
 *
 * A row is the natural unit here — the three channels are the same input three
 * times over, and the only thing that differs between rows is the entry and the
 * limits — so it is its own component and the panel keeps the staged-edit rule.
 */
const WearRow = ({
	entry,
	name,
	staged,
	limits,
	busy,
	onStageField,
}: {
	entry: ConditionEntry;
	name: string;
	/** This row's staged edit, when the user has touched one of its channels. */
	staged: ItemConditionEdit | undefined;
	limits: NonNullable<ConditionDescription["limits"]> | undefined;
	busy: boolean;
	onStageField: (field: WearField, value: number | null) => void;
}) => {
	const wearField = (field: WearField, limit: number) => {
		const stored = entry.condition[field];
		const stagedValue = staged?.[field] ?? null;
		const active = stored !== null || stagedValue !== null;
		return (
			<NumberInput
				size="xs"
				w={104}
				hideControls
				min={0}
				max={limit}
				clampBehavior="strict"
				disabled={busy || !active}
				placeholder="not stored"
				value={stagedValue ?? stored ?? ""}
				onChange={(next) =>
					onStageField(
						field,
						next === "" || next === undefined
							? null
							: Math.min(limit, Math.max(0, Number(next))),
					)
				}
				aria-label={`${field} of item ${entry.itemKey}`}
			/>
		);
	};
	return (
		<Table.Tr>
			<Table.Td>
				<Group gap="xs" wrap="nowrap">
					<Box style={{ minWidth: 0 }}>
						<Text size="sm" fw={500} truncate>
							{name}
						</Text>
						<Text size="10px" c="dimmed" ff="monospace">
							{entry.itemKey} · ×{entry.stackCount}
						</Text>
					</Box>
					{staged && (
						<Badge size="xs" color="brand" variant="light">
							staged
						</Badge>
					)}
				</Group>
			</Table.Td>
			<Table.Td>
				<Text size="xs" c="dimmed">
					{storageName(entry.inventoryKey)} · slot {entry.slotNo}
				</Text>
			</Table.Td>
			<Table.Td>{wearField("endurance", limits?.endurance ?? 65535)}</Table.Td>
			<Table.Td>{wearField("sharpness", limits?.sharpness ?? 65535)}</Table.Td>
			<Table.Td>
				{wearField("chargedUses", limits?.chargedUses ?? 999_999_999)}
			</Table.Td>
		</Table.Tr>
	);
};

/**
 * Item wear: endurance, sharpness and the charges left on a useable item.
 *
 * Every field is optional in a record's mask — an item the game gave you often
 * stores no charge count because it still holds its default — and a field the
 * save does not carry is shown as an em dash and left alone. Writing one would
 * mean creating a field inside the inventory record, which this editor refuses
 * rather than guess at.
 */
export const ConditionPanel = ({
	description,
	nameOf,
	edits,
	busy,
	error,
	onStage,
}: PanelProps) => {
	const [query, setQuery] = useState("");
	const [storage, setStorage] = useState<string>("all");
	const [page, setPage] = useState(0);

	const entries = description?.entries ?? NO_ENTRIES;
	const storages = useMemo(() => {
		const keys = new Set(entries.map((entry) => entry.inventoryKey));
		return [...keys].sort((a, b) => a - b);
	}, [entries]);
	const matches = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return entries.filter((entry) => {
			if (storage !== "all" && String(entry.inventoryKey) !== storage) {
				return false;
			}
			if (!needle) return true;
			return (
				nameOf(entry.itemKey).toLowerCase().includes(needle) ||
				String(entry.itemKey).includes(needle)
			);
		});
	}, [entries, nameOf, query, storage]);
	const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
	const current = Math.min(page, pages - 1);
	const visible = matches.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

	const editFor = (entry: ConditionEntry): ItemConditionEdit | undefined => {
		return edits.find((edit) => isSameItem(edit, entry));
	};

	const stageField = (
		entry: ConditionEntry,
		field: WearField,
		value: number | null,
	) => {
		const currentEdit = editFor(entry);
		// A channel that would be set to the value the save already holds is
		// dropped: the applier refuses an edit that changes nothing, and failing
		// the whole download over a redundant keystroke would be worse than
		// ignoring it.
		const next =
			value !== null && entry.condition[field] === value ? null : value;
		const merged: ItemConditionEdit = {
			type: "condition",
			inventoryKey: entry.inventoryKey,
			slotNo: entry.slotNo,
			itemKey: entry.itemKey,
			itemName: nameOf(entry.itemKey),
			endurance: currentEdit?.endurance ?? null,
			sharpness: currentEdit?.sharpness ?? null,
			chargedUses: currentEdit?.chargedUses ?? null,
			[field]: next,
		};
		const rest = edits.filter((edit) => !isSameItem(edit, entry));
		const empty =
			merged.endurance === null &&
			merged.sharpness === null &&
			merged.chargedUses === null;
		onStage(empty ? rest : [...rest, merged]);
	};

	if (description?.error) {
		return (
			<Stack component="section" gap="lg" p="md" style={{ flex: 1 }}>
				<Alert color="yellow" title="Item wear editing unavailable">
					{description.error}
				</Alert>
			</Stack>
		);
	}

	const limits = description?.limits;

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
					title="Could not apply item wear changes"
				>
					{error}
				</Alert>
			)}

			<Group justify="space-between" gap="md" align="flex-start">
				<Box>
					<Group gap="xs">
						<ShieldCheck
							size={18}
							color="var(--mantine-primary-color-filled)"
						/>
						<Text component="h2" size="xl" fw={600}>
							Item wear
						</Text>
					</Group>
					<Text mt={4} size="sm" c="dimmed">
						Endurance, sharpness and the charges a useable item has left. Only
						items whose records store one of these are listed.
					</Text>
				</Box>
				{description && (
					<Text size="sm" c="dimmed" ta="right">
						{entries.length.toLocaleString()} items with wear data
					</Text>
				)}
			</Group>

			{edits.length > 0 && (
				<Group gap="sm">
					<Badge variant="light" color="brand">
						{edits.length} item{edits.length === 1 ? "" : "s"} staged
					</Badge>
					<Button
						size="compact-xs"
						variant="subtle"
						leftSection={<Undo2 size={14} />}
						disabled={busy}
						onClick={() => onStage([])}
					>
						Discard all
					</Button>
				</Group>
			)}

			<Group align="flex-end" gap="md">
				<PanelSearchField
					label="Search items"
					placeholder="Search names or item keys"
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
					w={220}
					label="Storage"
					value={storage}
					allowDeselect={false}
					data={[
						{ value: "all", label: `All storages (${entries.length})` },
						...storages.map((key) => ({
							value: String(key),
							label: `${storageName(key)} (${key})`,
						})),
					]}
					onChange={(value) => {
						setStorage(value ?? "all");
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
							{COLUMNS.map((column) => (
								<Table.Th key={column}>{column}</Table.Th>
							))}
						</Table.Tr>
					</Table.Thead>
					<Table.Tbody>
						{visible.map((entry) => (
							<WearRow
								key={`${entry.inventoryKey}:${entry.slotNo}:${entry.itemKey}`}
								entry={entry}
								name={nameOf(entry.itemKey)}
								staged={editFor(entry)}
								limits={limits}
								busy={busy}
								onStageField={(field, value) => stageField(entry, field, value)}
							/>
						))}
						{visible.length === 0 && (
							<Table.Tr>
								<Table.Td colSpan={COLUMNS.length}>
									<Text size="sm" c="dimmed" ta="center" py="md">
										No items match this filter.
									</Text>
								</Table.Td>
							</Table.Tr>
						)}
					</Table.Tbody>
				</Table>
			</ScrollArea.Autosize>
			<PanelPager
				count={`${matches.length.toLocaleString()} items`}
				pages={pages}
				current={current}
				onPageChange={setPage}
			/>
		</Stack>
	);
};
