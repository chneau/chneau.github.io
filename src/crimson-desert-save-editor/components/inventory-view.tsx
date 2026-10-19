import {
	ActionIcon,
	Alert,
	Badge,
	Box,
	Button,
	Center,
	Drawer,
	Flex,
	Group,
	Modal,
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
import { useMediaQuery } from "@mantine/hooks";
import {
	Archive,
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	Hash,
	Info,
	Search,
	Sparkles,
	TriangleAlert,
	Wand2,
	X,
} from "lucide-react";
import {
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useCallback,
	useMemo,
	useState,
} from "react";
import type { EquipmentEdit, InsertEquipmentEdit } from "../lib/equipment";
import abyssGearRules from "../lib/generated/abyss-gear-compatibility.json";
import {
	type Catalog,
	type GroupedItem,
	groupRecords,
	type InventoryRecord,
	storageName,
} from "../lib/inventory";
import { itemSocketSummary } from "../lib/item-catalog";
import { maxEquipmentEdits } from "../lib/max-equipment";
import type { QuantityEdit, SaveEdit } from "../lib/staged-edits";
import type { EquipmentCatalog } from "./equipment-details";
import { EquipmentEditorDrawer } from "./equipment-editor-drawer";
import { ItemRow } from "./item-row";
import { Picture } from "./picture";

export type InventoryFocus = { itemKey: number; slotNo: number | null };

type SortColumn = "name" | "category" | "quantity";

const SortIndicator = ({
	column,
	sortBy,
	direction,
}: {
	column: SortColumn;
	sortBy: SortColumn;
	direction: "asc" | "desc";
}) => {
	if (sortBy !== column) return <ArrowUpDown size={14} opacity={0.45} />;
	return direction === "asc" ? (
		<ArrowUp size={14} color="var(--mantine-primary-color-filled)" />
	) : (
		<ArrowDown size={14} color="var(--mantine-primary-color-filled)" />
	);
};

const sortState = (
	column: SortColumn,
	sortBy: SortColumn,
	direction: "asc" | "desc",
) => {
	if (sortBy !== column) return "none" as const;
	return direction === "asc" ? ("ascending" as const) : ("descending" as const);
};

const replaceStorageEquipment = (
	current: SaveEdit[],
	staged: EquipmentEdit[],
	inventoryKey: number,
): SaveEdit[] => [
	...current.filter(
		(edit) => edit.type !== "equipment" || edit.inventoryKey !== inventoryKey,
	),
	...staged,
];

const SortButton = ({
	column,
	label,
	sortBy,
	direction,
	onToggle,
	alignRight = false,
}: {
	column: SortColumn;
	label: string;
	sortBy: SortColumn;
	direction: "asc" | "desc";
	onToggle: (column: SortColumn) => void;
	alignRight?: boolean;
}) => (
	<UnstyledButton
		onClick={() => onToggle(column)}
		style={{
			display: "flex",
			alignItems: "center",
			gap: 6,
			marginLeft: alignRight ? "auto" : undefined,
		}}
	>
		{label}{" "}
		<SortIndicator column={column} sortBy={sortBy} direction={direction} />
	</UnstyledButton>
);

const DetailRow = ({
	icon,
	label,
	value,
}: {
	icon?: ReactNode;
	label: string;
	value: ReactNode;
}) => (
	<Group
		justify="space-between"
		py={8}
		style={{ borderBottom: "1px solid var(--app-border)" }}
	>
		<Group gap="xs">
			{icon}
			<Text size="xs" c="dimmed">
				{label}
			</Text>
		</Group>
		{value}
	</Group>
);

const QuantityEditorPanel = ({
	item,
	record,
	stagedEdit,
	displayedQuantity,
	onQuantityChange,
	onChooseRecord,
	onStage,
}: {
	item: GroupedItem;
	record: InventoryRecord | null;
	stagedEdit: QuantityEdit | undefined;
	displayedQuantity: string;
	onQuantityChange: (value: string) => void;
	onChooseRecord: (record: InventoryRecord) => void;
	onStage: () => void;
}) => (
	<Alert variant="light" color="brand">
		<Text
			size="10px"
			fw={500}
			tt="uppercase"
			style={{ letterSpacing: "0.13em" }}
		>
			Quantity editor
		</Text>
		{item.recordList.length > 1 && (
			<Select
				mt="sm"
				label="Save record"
				value={record ? String(record.slotNo) : null}
				allowDeselect={false}
				data={item.recordList.map((candidate) => ({
					value: String(candidate.slotNo),
					label: `Slot ${candidate.slotNo} · quantity ${candidate.quantity}`,
				}))}
				onChange={(value) => {
					const chosen = item.recordList.find(
						(entry) => entry.slotNo === Number(value),
					);
					if (chosen) onChooseRecord(chosen);
				}}
			/>
		)}
		{stagedEdit && (
			<Badge color="blue" size="sm" variant="light" mt="xs">
				Staged: {stagedEdit.expectedQuantity.toLocaleString()} ➔{" "}
				{stagedEdit.newQuantity.toLocaleString()}
			</Badge>
		)}
		<Group mt="sm" gap="xs" align="flex-end">
			<TextInput
				aria-label="New quantity"
				inputMode="numeric"
				value={displayedQuantity}
				onChange={(event) => onQuantityChange(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						onStage();
					}
				}}
				ff="monospace"
				style={{ flex: 1 }}
			/>
			<Button onClick={onStage}>Stage</Button>
		</Group>
		<Group gap={4} mt="xs">
			{[
				{ label: "+10", add: 10 },
				{ label: "+100", add: 100 },
				{ label: "+1000", add: 1000 },
				{ label: "Set 999", set: 999 },
				{ label: "Set 9999", set: 9999 },
			].map((chip) => (
				<Button
					key={chip.label}
					size="compact-xs"
					variant="light"
					color="gray"
					onClick={() => {
						const current = Number(displayedQuantity) || 1;
						const next = chip.set ?? Math.max(1, current + (chip.add ?? 0));
						onQuantityChange(String(next));
					}}
				>
					{chip.label}
				</Button>
			))}
		</Group>
		<Text mt="xs" size="xs" c="dimmed">
			Press Enter or select Stage to stage the change.
		</Text>
	</Alert>
);

const ItemDetails = ({
	item,
	record,
	sockets,
	activeStorage,
	busy,
	displayedQuantity,
	stagedEdit,
	onQuantityChange,
	onChooseRecord,
	onStageQuantity,
	onOpenEquipment,
}: {
	item: GroupedItem | null;
	record: InventoryRecord | null;
	sockets: ReturnType<typeof itemSocketSummary>;
	activeStorage: number | null;
	busy: boolean;
	displayedQuantity: string;
	stagedEdit: QuantityEdit | undefined;
	onQuantityChange: (value: string) => void;
	onChooseRecord: (record: InventoryRecord) => void;
	onStageQuantity: () => void;
	onOpenEquipment: () => void;
}) => {
	if (!item) {
		return (
			<Center p="xl">
				<Text size="sm" c="dimmed" ta="center">
					Select an item to inspect its record.
				</Text>
			</Center>
		);
	}
	return (
		<>
			<Box
				p="lg"
				style={{
					borderBottom: "1px solid var(--app-border)",
				}}
			>
				<Group justify="space-between" gap="sm" align="flex-start">
					<Badge
						variant="outline"
						color="brand"
						styles={{ label: { textTransform: "uppercase" } }}
					>
						{item.category}
					</Badge>
					<Text size="xs" c="dimmed" ff="monospace">
						#{item.itemKey}
					</Text>
				</Group>
				<Group gap="md" mt="lg" wrap="nowrap">
					<Picture kind="item" pictureKey={item.itemKey} size={80} />
					<Text component="h2" size="xl" fw={600}>
						{item.name}
					</Text>
				</Group>
				<Text mt="sm" size="xs" c="dimmed" lineClamp={5}>
					{item.description}
				</Text>
			</Box>
			<Stack gap="lg" p="lg">
				<SimpleGrid cols={2} spacing={1}>
					<Paper withBorder p="sm">
						<Text
							size="10px"
							c="dimmed"
							tt="uppercase"
							style={{ letterSpacing: "0.12em" }}
						>
							Total quantity
						</Text>
						<Text mt={4} size="lg" ff="monospace">
							{item.quantity.toLocaleString()}
						</Text>
					</Paper>
					<Paper withBorder p="sm">
						<Text
							size="10px"
							c="dimmed"
							tt="uppercase"
							style={{ letterSpacing: "0.12em" }}
						>
							Save records
						</Text>
						<Text mt={4} size="lg" ff="monospace">
							{item.records}
						</Text>
					</Paper>
				</SimpleGrid>
				<Stack gap={4}>
					<DetailRow
						icon={<Archive size={14} />}
						label="Location"
						value={
							<Text size="xs">
								{activeStorage === null ? "—" : storageName(activeStorage)}
							</Text>
						}
					/>
					{item.staged ? (
						<DetailRow
							label="Status"
							value={
								<Text size="xs" fw={500} c="brand">
									Staged addition
								</Text>
							}
						/>
					) : (
						<DetailRow
							icon={<Hash size={14} />}
							label="First slot"
							value={
								<Text size="xs" ff="monospace">
									{item.firstSlot}
								</Text>
							}
						/>
					)}
					{sockets && (
						<DetailRow
							label="Sockets"
							value={
								<Text size="xs" ff="monospace">
									{sockets.filled}/{sockets.unlocked} filled
								</Text>
							}
						/>
					)}
				</Stack>
				{item.staged ? (
					<Alert variant="light" color="brand" p="sm">
						<Text size="xs">
							This item will be added to the downloaded save. Its final save
							slot is assigned automatically during validation.
						</Text>
					</Alert>
				) : record?.noGearToEdit ? (
					<Text size="sm" c="dimmed">
						This item has no refinement or sockets to edit.
					</Text>
				) : record?.equipment ? (
					<Alert variant="light" color="brand">
						<Text size="sm" fw={500}>
							Refinement {record.equipment.refinement}
						</Text>
						{sockets && (
							<Text size="sm" c="dimmed">
								{sockets.unlocked} unlocked sockets
								{` · maximum ${record.equipment.socketCap}`}
							</Text>
						)}
						<Button fullWidth mt="sm" disabled={busy} onClick={onOpenEquipment}>
							Edit equipment
						</Button>
					</Alert>
				) : (
					<QuantityEditorPanel
						item={item}
						record={record}
						stagedEdit={stagedEdit}
						displayedQuantity={displayedQuantity}
						onQuantityChange={onQuantityChange}
						onChooseRecord={onChooseRecord}
						onStage={onStageQuantity}
					/>
				)}
			</Stack>
		</>
	);
};

const savedRecordFor = (
	savedRecords: InventoryRecord[],
	record: InventoryRecord | null,
): InventoryRecord | undefined =>
	record
		? savedRecords.find(
				(candidate) =>
					candidate.inventoryKey === record.inventoryKey &&
					candidate.slotNo === record.slotNo &&
					candidate.itemKey === record.itemKey,
			)
		: undefined;

const equipmentEditFor = (
	edits: SaveEdit[],
	record: InventoryRecord | null,
): EquipmentEdit | undefined =>
	record
		? edits.find(
				(edit): edit is EquipmentEdit =>
					edit.type === "equipment" &&
					edit.inventoryKey === record.inventoryKey &&
					edit.slotNo === record.slotNo &&
					edit.itemKey === record.itemKey,
			)
		: undefined;

const equipmentAdditionFor = (
	edits: SaveEdit[],
	record: InventoryRecord | null,
): InsertEquipmentEdit | undefined =>
	record
		? edits.find(
				(edit): edit is InsertEquipmentEdit =>
					edit.type === "insertEquipment" &&
					edit.inventoryKey === record.inventoryKey &&
					edit.itemKey === record.itemKey,
			)
		: undefined;

const quantityEditFor = (
	edits: SaveEdit[],
	record: InventoryRecord | null,
): QuantityEdit | undefined =>
	record
		? edits.find(
				(edit): edit is QuantityEdit =>
					edit.type === "quantity" &&
					edit.inventoryKey === record.inventoryKey &&
					edit.slotNo === record.slotNo,
			)
		: undefined;

const applyQuantityEdit = (
	current: SaveEdit[],
	edit: QuantityEdit | null,
): SaveEdit[] => {
	const remaining = current.filter(
		(entry) =>
			!(
				entry.type === "quantity" &&
				edit !== null &&
				entry.inventoryKey === edit.inventoryKey &&
				entry.slotNo === edit.slotNo
			),
	);
	return edit === null ? remaining : [...remaining, edit];
};

const nextSort = (
	column: SortColumn,
	sortBy: SortColumn,
	direction: "asc" | "desc",
): { column: SortColumn; direction: "asc" | "desc" } =>
	sortBy === column
		? { column, direction: direction === "asc" ? "desc" : "asc" }
		: { column, direction: column === "quantity" ? "desc" : "asc" };

const categoriesIn = (items: GroupedItem[]): string[] => {
	const categories = new Set<string>();
	for (const item of items) {
		if (item.category) categories.add(item.category);
	}
	return Array.from(categories).sort();
};

const filterItems = (
	items: GroupedItem[],
	query: string,
	category: string,
): GroupedItem[] => {
	const normalized = query.trim().toLowerCase();
	return items.filter((item) => {
		if (category !== "all" && item.category !== category) {
			return false;
		}
		if (!normalized) return true;
		return (
			item.name.toLowerCase().includes(normalized) ||
			item.category.toLowerCase().includes(normalized) ||
			String(item.itemKey).includes(normalized)
		);
	});
};

const sortItems = (
	items: GroupedItem[],
	sortBy: SortColumn,
	sortDirection: "asc" | "desc",
): GroupedItem[] => {
	const direction = sortDirection === "asc" ? 1 : -1;
	return [...items].sort((left, right) => {
		if (sortBy === "quantity") {
			return (
				(left.quantity - right.quantity) * direction ||
				left.name.localeCompare(right.name)
			);
		}
		const leftValue = sortBy === "category" ? left.category : left.name;
		const rightValue = sortBy === "category" ? right.category : right.name;
		return (
			leftValue.localeCompare(rightValue, undefined, { numeric: true }) *
				direction || left.name.localeCompare(right.name)
		);
	});
};

const StorageToolbar = ({
	query,
	onQueryChange,
	visibleCount,
	totalCount,
	selected,
	activeStorage,
	savedRecords,
	setEdits,
	itemNameFor,
	confirm,
	onConfirm,
	onShowDetails,
}: {
	query: string;
	onQueryChange: (value: string) => void;
	visibleCount: number;
	totalCount: number;
	selected: boolean;
	activeStorage: number | null;
	savedRecords: InventoryRecord[];
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
	itemNameFor: (itemKey: number) => string;
	confirm: BulkConfirm | null;
	onConfirm: (confirm: BulkConfirm | null) => void;
	onShowDetails: () => void;
}) => (
	<Group
		p="md"
		gap="md"
		justify="space-between"
		style={{
			flexShrink: 0,
			borderBottom: "1px solid var(--app-border)",
		}}
	>
		<TextInput
			value={query}
			onChange={(event) => onQueryChange(event.currentTarget.value)}
			placeholder="Search names, categories, or IDs"
			leftSection={<Search size={16} />}
			rightSection={
				query ? (
					<ActionIcon
						size="xs"
						variant="subtle"
						color="gray"
						onClick={() => onQueryChange("")}
						title="Clear search"
						aria-label="Clear search"
					>
						<X size={14} />
					</ActionIcon>
				) : null
			}
			style={{ flex: 1, maxWidth: 384 }}
			aria-label="Search items"
		/>
		<Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
			<Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
				{visibleCount} of {totalCount} item types
			</Text>
			<BulkEquipmentPlanner
				activeStorage={activeStorage}
				savedRecords={savedRecords}
				setEdits={setEdits}
				itemNameFor={itemNameFor}
				confirm={confirm}
				onConfirm={onConfirm}
			/>
			<Button
				variant="default"
				size="sm"
				hiddenFrom="xl"
				leftSection={<Info size={14} />}
				disabled={!selected}
				title="Show this item's details"
				onClick={onShowDetails}
			>
				Details
			</Button>
		</Group>
	</Group>
);

type Selection = {
	item: GroupedItem | null;
	record: InventoryRecord | null;
	sockets: ReturnType<typeof itemSocketSummary>;
	savedRecord: InventoryRecord | undefined;
	stagedEquipment: EquipmentEdit | undefined;
	addition: InsertEquipmentEdit | undefined;
	additionDefinition: EquipmentCatalog["items"][string] | undefined;
	stagedEdit: QuantityEdit | undefined;
	displayedQuantity: string;
};

const selectionFor = ({
	items,
	selectedKey,
	selectedSlot,
	savedRecords,
	edits,
	equipmentCatalog,
	quantityDraft,
}: {
	items: GroupedItem[];
	selectedKey: number | null;
	selectedSlot: number | null;
	savedRecords: InventoryRecord[];
	edits: SaveEdit[];
	equipmentCatalog: EquipmentCatalog | null;
	quantityDraft: string;
}): Selection => {
	const item =
		items.find((entry) => entry.itemKey === selectedKey) ?? items[0] ?? null;
	const record =
		item?.recordList.find((entry) => entry.slotNo === selectedSlot) ??
		item?.recordList[0] ??
		null;
	const stagedEdit = quantityEditFor(edits, record);
	const addition = equipmentAdditionFor(edits, record);
	return {
		item,
		record,
		sockets: itemSocketSummary(record?.equipment),
		savedRecord: savedRecordFor(savedRecords, record),
		stagedEquipment: equipmentEditFor(edits, record),
		addition,
		additionDefinition: addition
			? equipmentCatalog?.items[String(addition.itemKey)]
			: undefined,
		stagedEdit,
		displayedQuantity:
			quantityDraft ||
			String(stagedEdit?.newQuantity ?? record?.quantity ?? ""),
	};
};

const quantityRangeError = (quantity: number): string | null =>
	Number.isInteger(quantity) && quantity >= 1 && quantity <= 999_999_999
		? null
		: "Quantity must be a whole number from 1 to 999,999,999.";

const DetailsSurface = ({
	isWide,
	opened,
	onClose,
	details,
}: {
	isWide: boolean;
	opened: boolean;
	onClose: () => void;
	details: ReactNode;
}) => (
	<>
		<Box w={340} visibleFrom="xl" style={{ flexShrink: 0, overflowY: "auto" }}>
			{isWide ? details : null}
		</Box>

		<Drawer
			opened={opened}
			onClose={onClose}
			position="right"
			size="32rem"
			title="Item details"
		>
			{isWide ? null : details}
		</Drawer>
	</>
);

const canEditQuantity = (record: InventoryRecord): boolean =>
	!record.equipment && !record.staged && !record.noGearToEdit;

const recordIdentity = (record: InventoryRecord | null): string | null =>
	record === null
		? null
		: `${record.inventoryKey}:${record.slotNo}:${record.itemKey}`;

const stagedQuantityChange = (
	record: InventoryRecord,
	item: GroupedItem,
	quantity: number,
): QuantityEdit | null => {
	const original = record.originalQuantity ?? record.quantity;
	return quantity === original
		? null
		: {
				type: "quantity",
				inventoryKey: record.inventoryKey,
				slotNo: record.slotNo,
				itemKey: record.itemKey,
				itemName: item.name,
				expectedQuantity: original,
				newQuantity: quantity,
			};
};

type BulkConfirm = {
	type: "max" | "random";
	count: number;
	plannedEdits: EquipmentEdit[];
};

const BulkEquipmentPlanner = ({
	activeStorage,
	savedRecords,
	setEdits,
	itemNameFor,
	confirm,
	onConfirm,
}: {
	activeStorage: number | null;
	savedRecords: InventoryRecord[];
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
	itemNameFor: (itemKey: number) => string;
	confirm: BulkConfirm | null;
	onConfirm: (confirm: BulkConfirm | null) => void;
}) => {
	const plan = (gear: "strongest" | "random") => {
		if (activeStorage === null) return;
		const planned = maxEquipmentEdits({
			records: savedRecords,
			inventoryKey: activeStorage,
			rules: abyssGearRules,
			itemNameFor,
			...(gear === "strongest" ? {} : { gear }),
		});
		onConfirm({
			type: gear === "strongest" ? "max" : "random",
			count: planned.edits.length,
			plannedEdits: planned.edits,
		});
	};
	return (
		<>
			{activeStorage !== null && (
				<>
					<Button
						variant="default"
						size="sm"
						leftSection={<Sparkles size={14} />}
						title="Take every item to the refinement and sockets this item allows, then fill the sockets with the strongest Abyss Gear that fits."
						onClick={() => plan("strongest")}
					>
						Max Equipment
					</Button>
					<Button
						variant="default"
						size="sm"
						leftSection={<Wand2 size={14} />}
						title="Same as Max Equipment, but each empty socket gets a random Abyss Gear. A family's lower tiers are never used: if a “… III” exists, only the III is ever socketed."
						onClick={() => plan("random")}
					>
						Randomize All Sockets
					</Button>
				</>
			)}
			<Modal
				opened={confirm !== null}
				onClose={() => onConfirm(null)}
				title={
					confirm?.type === "max"
						? "Confirm Max Equipment"
						: "Confirm Randomize Sockets"
				}
				centered
			>
				<Stack gap="md">
					<Text size="sm">
						{confirm?.type === "max"
							? `Upgrade all equipment in ${
									activeStorage !== null
										? storageName(activeStorage)
										: "storage"
								} to maximum refinement and fill sockets with best matching Abyss Gear?`
							: `Randomize all unlocked sockets in ${
									activeStorage !== null
										? storageName(activeStorage)
										: "storage"
								} with compatible Abyss Gear?`}
					</Text>
					<Text size="xs" c="dimmed">
						This will stage changes for {confirm?.count ?? 0} equipment items in
						this location. It replaces any equipment changes you have already
						staged in this location. Your original save file is never
						overwritten.
					</Text>
					<Group justify="flex-end" gap="sm" mt="md">
						<Button variant="default" onClick={() => onConfirm(null)}>
							Cancel
						</Button>
						<Button
							color="brand"
							onClick={() => {
								if (confirm && activeStorage !== null) {
									setEdits((current) =>
										replaceStorageEquipment(
											current,
											confirm.plannedEdits,
											activeStorage,
										),
									);
								}
								onConfirm(null);
							}}
						>
							Confirm &amp; Stage ({confirm?.count ?? 0})
						</Button>
					</Group>
				</Stack>
			</Modal>
		</>
	);
};

const CategoryFilterBar = ({
	items,
	categories,
	selected,
	onSelect,
}: {
	items: GroupedItem[];
	categories: string[];
	selected: string;
	onSelect: (category: string) => void;
}) => (
	<Box
		px="md"
		py="xs"
		style={{
			flexShrink: 0,
			borderBottom: "1px solid var(--app-border)",
			background: "var(--app-surface-2)",
		}}
	>
		<ScrollArea type="never">
			<Group gap={6} wrap="nowrap">
				<Badge
					size="sm"
					variant={selected === "all" ? "filled" : "outline"}
					color={selected === "all" ? "brand" : "gray"}
					style={{ cursor: "pointer" }}
					onClick={() => onSelect("all")}
				>
					All ({items.length})
				</Badge>
				{categories.map((category) => {
					const count = items.filter(
						(item) => item.category === category,
					).length;
					const active = selected === category;
					return (
						<Badge
							key={category}
							size="sm"
							variant={active ? "filled" : "outline"}
							color={active ? "brand" : "gray"}
							style={{ cursor: "pointer" }}
							onClick={() => onSelect(active ? "all" : category)}
						>
							{category} ({count})
						</Badge>
					);
				})}
			</Group>
		</ScrollArea>
	</Box>
);

const StagedEquipmentList = ({
	edits,
	busy,
	setEdits,
}: {
	edits: SaveEdit[];
	busy: boolean;
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
}) => {
	const staged = edits.filter(
		(edit): edit is EquipmentEdit | InsertEquipmentEdit =>
			edit.type === "equipment" || edit.type === "insertEquipment",
	);
	if (!staged.length) return null;
	return (
		<Box
			component="section"
			aria-label="Staged equipment changes"
			px="md"
			py="sm"
			style={{
				flexShrink: 0,
				maxHeight: 192,
				overflowY: "auto",
				borderBottom: "1px solid var(--mantine-primary-color-filled)",
				background: "var(--mantine-primary-color-light)",
			}}
		>
			<Stack gap="xs">
				{staged.map((edit) => (
					<Group
						key={
							edit.type === "insertEquipment"
								? `${edit.type}:${edit.inventoryKey}:${edit.itemKey}`
								: `${edit.type}:${edit.inventoryKey}:${edit.itemKey}:${edit.slotNo}`
						}
						justify="space-between"
						gap="md"
						wrap="nowrap"
					>
						<Text size="sm">
							{edit.type === "insertEquipment" ? "Add" : "Edit"} {edit.itemName}{" "}
							· {storageName(edit.inventoryKey)} · refinement {edit.refinement}
							{` · ${edit.unlockedSockets} sockets · ${
								edit.socketItems.filter(Boolean).length
							} filled`}
						</Text>
						<Button
							size="compact-sm"
							variant="subtle"
							disabled={busy}
							onClick={() =>
								setEdits((current) => current.filter((entry) => entry !== edit))
							}
						>
							Remove
						</Button>
					</Group>
				))}
			</Stack>
		</Box>
	);
};

const ItemTable = ({
	items,
	selectedKey,
	sortBy,
	direction,
	busy,
	onToggleSort,
	onSelect,
	onEdit,
}: {
	items: GroupedItem[];
	selectedKey: number | null;
	sortBy: SortColumn;
	direction: "asc" | "desc";
	busy: boolean;
	onToggleSort: (column: SortColumn) => void;
	onSelect: (item: GroupedItem) => void;
	onEdit: (item: GroupedItem) => void;
}) => (
	<Box style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
		<Table
			stickyHeader
			highlightOnHover
			verticalSpacing="sm"
			horizontalSpacing="md"
		>
			<Table.Thead>
				<Table.Tr>
					<Table.Th aria-sort={sortState("name", sortBy, direction)}>
						<SortButton
							column="name"
							label="Item"
							sortBy={sortBy}
							direction={direction}
							onToggle={onToggleSort}
						/>
					</Table.Th>
					<Table.Th
						aria-sort={sortState("category", sortBy, direction)}
						visibleFrom="md"
					>
						<SortButton
							column="category"
							label="Category"
							sortBy={sortBy}
							direction={direction}
							onToggle={onToggleSort}
						/>
					</Table.Th>
					<Table.Th
						aria-sort={sortState("quantity", sortBy, direction)}
						ta="right"
					>
						<SortButton
							column="quantity"
							label="Quantity"
							sortBy={sortBy}
							direction={direction}
							onToggle={onToggleSort}
							alignRight
						/>
					</Table.Th>
					<Table.Th ta="right" w={80}>
						Edit
					</Table.Th>
				</Table.Tr>
			</Table.Thead>
			<Table.Tbody>
				{items.map((item) => (
					<ItemRow
						key={item.itemKey}
						item={item}
						selected={selectedKey === item.itemKey}
						busy={busy}
						onSelect={onSelect}
						onEdit={onEdit}
					/>
				))}
				{items.length === 0 && (
					<Table.Tr>
						<Table.Td colSpan={4}>
							<Text size="sm" c="dimmed" ta="center" py="xl">
								No items match that search.
							</Text>
						</Table.Td>
					</Table.Tr>
				)}
			</Table.Tbody>
		</Table>
	</Box>
);

type InventoryViewProps = {
	records: InventoryRecord[];
	savedRecords: InventoryRecord[];
	activeStorage: number | null;
	catalog: Catalog | null;
	equipmentCatalog: EquipmentCatalog | null;
	edits: SaveEdit[];
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
	error: string;
	setError: Dispatch<SetStateAction<string>>;
	busy: boolean;
	focus: InventoryFocus | null;
	hidden: boolean;
	onStageEquipment: (edit: EquipmentEdit | InsertEquipmentEdit) => void;
};

export const InventoryView = ({
	records,
	savedRecords,
	activeStorage,
	catalog,
	equipmentCatalog,
	edits,
	setEdits,
	error,
	setError,
	busy,
	focus,
	hidden,
	onStageEquipment,
}: InventoryViewProps) => {
	const [query, setQuery] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string>("all");
	const [sortBy, setSortBy] = useState<SortColumn>("name");
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
	const [selectedKey, setSelectedKey] = useState<number | null>(null);
	const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
	const [quantityDraft, setQuantityDraft] = useState("");
	const [draftRecord, setDraftRecord] = useState<string | null>(null);
	const [editorOpen, setEditorOpen] = useState(false);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const isWide = useMediaQuery("(min-width: 75em)") ?? true;
	const [bulkConfirm, setBulkConfirm] = useState<BulkConfirm | null>(null);

	const [appliedFocus, setAppliedFocus] = useState(focus);
	if (appliedFocus !== focus) {
		setAppliedFocus(focus);
		setSelectedKey(focus?.itemKey ?? null);
		setSelectedSlot(focus?.slotNo ?? null);
		setQuantityDraft("");
		setEditorOpen(false);
		setQuery("");
		setSelectedCategory("all");
	}

	const [wasHidden, setWasHidden] = useState(hidden);
	if (wasHidden !== hidden) {
		setWasHidden(hidden);
		if (hidden) {
			setEditorOpen(false);
			setDetailsOpen(false);
		}
	}

	const items = useMemo(() => {
		if (activeStorage === null) return [];
		return groupRecords(
			records.filter((record) => record.inventoryKey === activeStorage),
			catalog,
		);
	}, [activeStorage, catalog, records]);

	const availableCategories = useMemo(() => categoriesIn(items), [items]);

	const visibleItems = useMemo(
		() => filterItems(items, query, selectedCategory),
		[items, query, selectedCategory],
	);

	const sortedItems = useMemo(
		() => sortItems(visibleItems, sortBy, sortDirection),
		[sortBy, sortDirection, visibleItems],
	);

	const equipmentName = useCallback(
		(itemKey: number) =>
			catalog?.items[String(itemKey)]?.name ?? `Item ${itemKey}`,
		[catalog],
	);

	const {
		item: selectedItem,
		record: selectedRecord,
		sockets: selectedSockets,
		savedRecord: originalSelectedRecord,
		stagedEquipment,
		addition: selectedEquipmentAddition,
		additionDefinition,
		stagedEdit: selectedStagedEdit,
		displayedQuantity,
	} = selectionFor({
		items: sortedItems,
		selectedKey,
		selectedSlot,
		savedRecords,
		edits,
		equipmentCatalog,
		quantityDraft,
	});

	const selectedIdentity = recordIdentity(selectedRecord);
	if (draftRecord !== null && draftRecord !== selectedIdentity) {
		setDraftRecord(null);
		setQuantityDraft("");
	}

	const chooseRecord = useCallback(
		(record: InventoryRecord) => {
			setSelectedSlot(record.slotNo);
			const staged = quantityEditFor(edits, record);
			setQuantityDraft(String(staged?.newQuantity ?? record.quantity));
			setDraftRecord(recordIdentity(record));
		},
		[edits],
	);

	const changeQuantityDraft = useCallback(
		(value: string) => {
			setQuantityDraft(value);
			setDraftRecord(recordIdentity(selectedRecord));
		},
		[selectedRecord],
	);

	const selectItem = useCallback(
		(item: GroupedItem) => {
			setSelectedKey(item.itemKey);
			const record = item.recordList[0];
			if (!item.staged && record) chooseRecord(record);
		},
		[chooseRecord],
	);
	const editItem = useCallback(
		(item: GroupedItem) => {
			setSelectedKey(item.itemKey);
			const record = item.recordList[0];
			if (!record) return;
			chooseRecord(record);
			setEditorOpen(true);
		},
		[chooseRecord],
	);

	const stageQuantity = () => {
		if (!selectedItem || !selectedRecord || busy) return;
		if (!canEditQuantity(selectedRecord)) return;
		const quantity = Number(displayedQuantity);
		const rangeError = quantityRangeError(quantity);
		if (rangeError) {
			setError(rangeError);
			return;
		}
		setError("");
		setEdits((current) =>
			applyQuantityEdit(
				current,
				stagedQuantityChange(selectedRecord, selectedItem, quantity),
			),
		);
	};

	const toggleSort = (column: SortColumn) => {
		const next = nextSort(column, sortBy, sortDirection);
		setSortBy(next.column);
		setSortDirection(next.direction);
	};

	const detailsContent = (
		<ItemDetails
			item={selectedItem}
			record={selectedRecord}
			sockets={selectedSockets}
			activeStorage={activeStorage}
			busy={busy}
			displayedQuantity={displayedQuantity}
			stagedEdit={selectedStagedEdit}
			onQuantityChange={changeQuantityDraft}
			onChooseRecord={chooseRecord}
			onStageQuantity={stageQuantity}
			onOpenEquipment={() => setEditorOpen(true)}
		/>
	);
	return (
		<Flex
			style={{
				flex: 1,
				minHeight: 0,
				minWidth: 0,
				display: hidden ? "none" : undefined,
			}}
		>
			<Flex
				direction="column"
				style={{
					flex: 1,
					minWidth: 0,
					minHeight: 0,
					borderRight: "1px solid var(--app-border)",
				}}
			>
				<StorageToolbar
					query={query}
					onQueryChange={setQuery}
					visibleCount={visibleItems.length}
					totalCount={items.length}
					selected={selectedItem !== null}
					activeStorage={activeStorage}
					savedRecords={savedRecords}
					setEdits={setEdits}
					itemNameFor={equipmentName}
					confirm={bulkConfirm}
					onConfirm={setBulkConfirm}
					onShowDetails={() => setDetailsOpen(true)}
				/>

				{availableCategories.length > 1 && (
					<CategoryFilterBar
						items={items}
						categories={availableCategories}
						selected={selectedCategory}
						onSelect={setSelectedCategory}
					/>
				)}

				{error && (
					<Alert
						color="red"
						m="md"
						icon={<TriangleAlert size={16} />}
						title="Could not apply equipment change"
					>
						{error}
					</Alert>
				)}

				<StagedEquipmentList edits={edits} busy={busy} setEdits={setEdits} />

				<ItemTable
					items={sortedItems}
					selectedKey={selectedItem?.itemKey ?? null}
					sortBy={sortBy}
					direction={sortDirection}
					busy={busy}
					onToggleSort={toggleSort}
					onSelect={selectItem}
					onEdit={editItem}
				/>
			</Flex>

			<DetailsSurface
				isWide={isWide}
				opened={detailsOpen}
				onClose={() => setDetailsOpen(false)}
				details={detailsContent}
			/>

			<EquipmentEditorDrawer
				open={editorOpen}
				onClose={() => setEditorOpen(false)}
				item={selectedItem}
				record={selectedRecord}
				activeStorage={activeStorage}
				catalog={catalog}
				busy={busy}
				error={error}
				savedRecord={originalSelectedRecord}
				stagedEquipment={stagedEquipment}
				addition={selectedEquipmentAddition}
				additionDefinition={additionDefinition}
				stagedEdit={selectedStagedEdit}
				displayedQuantity={displayedQuantity}
				onQuantityChange={changeQuantityDraft}
				onChooseRecord={chooseRecord}
				onStageQuantity={stageQuantity}
				onStageEquipment={onStageEquipment}
				setEdits={setEdits}
			/>
		</Flex>
	);
};
