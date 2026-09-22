import {
	Alert,
	Badge,
	Box,
	Button,
	Group,
	NumberInput,
	Pagination,
	ScrollArea,
	Select,
	Stack,
	Table,
	Text,
	TextInput,
} from "@mantine/core";
import { Search, ShieldCheck, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
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

const isSameItem = (edit: ItemConditionEdit, other: ConditionEntry): boolean =>
	edit.inventoryKey === other.inventoryKey &&
	edit.slotNo === other.slotNo &&
	edit.itemKey === other.itemKey;

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

	const entries = description?.entries ?? [];
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
		field: "endurance" | "sharpness" | "chargedUses",
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

	const wearField = (
		entry: ConditionEntry,
		field: "endurance" | "sharpness" | "chargedUses",
		limit: number,
	) => {
		const stored = entry.condition[field];
		const staged = editFor(entry)?.[field] ?? null;
		const active = stored !== null || staged !== null;
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
				value={staged ?? stored ?? ""}
				onChange={(next) =>
					stageField(
						entry,
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

	if (description?.error) {
		return (
			<Stack component="main" gap="lg" p="md" style={{ flex: 1 }}>
				<Alert color="yellow" title="Item wear editing unavailable">
					{description.error}
				</Alert>
			</Stack>
		);
	}

	const limits = description?.limits;

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
						{edits.length} item{edits.length === 1 ? "" : "s"} queued
					</Badge>
					<Button
						size="compact-xs"
						variant="subtle"
						leftSection={<Undo2 size={14} />}
						disabled={busy}
						onClick={() => onStage([])}
					>
						Discard
					</Button>
				</Group>
			)}

			<Box>
				<Group align="flex-end" gap="md">
					<TextInput
						w="100%"
						style={{ flex: 1, minWidth: "12rem" }}
						label="Search items"
						placeholder="Search names or item keys"
						leftSection={<Search size={16} />}
						value={query}
						onChange={(event) => {
							setQuery(event.currentTarget.value);
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
								<Table.Th>Item</Table.Th>
								<Table.Th>Where</Table.Th>
								<Table.Th>Endurance</Table.Th>
								<Table.Th>Sharpness</Table.Th>
								<Table.Th>Charges left</Table.Th>
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{visible.map((entry) => (
								<Table.Tr
									key={`${entry.inventoryKey}:${entry.slotNo}:${entry.itemKey}`}
								>
									<Table.Td>
										<Group gap="xs" wrap="nowrap">
											<Box style={{ minWidth: 0 }}>
												<Text size="sm" fw={500} truncate>
													{nameOf(entry.itemKey)}
												</Text>
												<Text size="10px" c="dimmed" ff="monospace">
													{entry.itemKey} · ×{entry.stackCount}
												</Text>
											</Box>
											{editFor(entry) && (
												<Badge size="xs" color="brand" variant="light">
													queued
												</Badge>
											)}
										</Group>
									</Table.Td>
									<Table.Td>
										<Text size="xs" c="dimmed">
											{storageName(entry.inventoryKey)} · slot {entry.slotNo}
										</Text>
									</Table.Td>
									<Table.Td>
										{wearField(entry, "endurance", limits?.endurance ?? 65535)}
									</Table.Td>
									<Table.Td>
										{wearField(entry, "sharpness", limits?.sharpness ?? 65535)}
									</Table.Td>
									<Table.Td>
										{wearField(
											entry,
											"chargedUses",
											limits?.chargedUses ?? 999_999_999,
										)}
									</Table.Td>
								</Table.Tr>
							))}
							{visible.length === 0 && (
								<Table.Tr>
									<Table.Td colSpan={5}>
										<Text size="sm" c="dimmed" ta="center" py="md">
											No items match this filter.
										</Text>
									</Table.Td>
								</Table.Tr>
							)}
						</Table.Tbody>
					</Table>
				</ScrollArea.Autosize>
				<Group justify="space-between" mt="sm">
					<Text size="xs" c="dimmed">
						{matches.length.toLocaleString()} items
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
