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
import type { EquipmentCatalog } from "@/components/equipment-details";
import { EquipmentEditorDrawer } from "@/components/equipment-editor-drawer";
import { ItemRow } from "@/components/item-row";
import { Picture } from "@/components/picture";
import type { EquipmentEdit, InsertEquipmentEdit } from "@/lib/equipment";
import abyssGearRules from "@/lib/generated/abyss-gear-compatibility.json";
import {
	type Catalog,
	type GroupedItem,
	groupRecords,
	type InventoryRecord,
	storageName,
} from "@/lib/inventory";
import { itemSocketSummary } from "@/lib/item-catalog";
import { maxEquipmentEdits } from "@/lib/max-equipment";
import type { QuantityEdit, SaveEdit } from "@/lib/staged-edits";

/** Where a staged change just put something, so the view selects it. */
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

/**
 * Swap this storage's staged equipment edits for a freshly planned set.
 *
 * One pass replaces whatever the storage had staged, so pressing either button
 * twice matches pressing it once: the new plan is built from the save's own
 * records, not from the previously staged edits.
 */
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

/** The clickable heading of one sortable column. */
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

/**
 * One detail row: a label, and the value that answers it.
 *
 * A component because the pane stacks a dozen of these and the divider under
 * each was written out every time — which is how a row ends up without its
 * border and the column reads as one block.
 */
const DetailRow = ({
	icon,
	label,
	value,
}: {
	/** A marker for the row, where the detail has one. */
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

/**
 * The quantity editor: which copy of a stack, what is already staged, and the
 * field that stages more.
 *
 * Its own component because it is one of three mutually exclusive editors the
 * details pane offers — the others are the staged-addition note and the
 * refinement summary — and it is by far the largest of the three. Splitting it
 * out is what lets the pane's branch read as a choice between editors rather
 * than as three editors written one after another.
 */
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

/**
 * The pane that describes whatever the table has selected: what the item is,
 * where it sits, and the one editor its record admits.
 *
 * It is a component because it has two call sites — the wide layout's own column
 * and, on a narrow one, the details drawer — not one. Which of the three
 * editors applies is decided here rather than in the view, because it is
 * decided by what the record is, and leaving that decision in the view meant
 * the quantity editor's whole markup sat inline beside the branch choosing it.
 */
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
	/** Filled and unlocked socket counts, when the item has sockets at all. */
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

/**
 * The save's own record for a projected one, matched on all three of its keys.
 *
 * `records` has the staged edits folded in and `savedRecords` has not, and
 * several places need the before — the equipment editor edits the save's record,
 * not the projection, or reopening the editor would show the user's own staged
 * change as though it were already in the file. A projected record with no
 * counterpart is a staged addition, which has no save record at all.
 */
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

/** The staged equipment edit for a record's own slot, if the user has made one. */
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

/**
 * The staged *addition* for a record's item, if the user has added one.
 *
 * Matched without a slot: an addition has no record yet, so there is nothing to
 * match a slot against, and a save holding the same item twice as an addition
 * has one addition, not two.
 */
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

/** The staged quantity edit for a record, if the user has changed its count. */
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

/**
 * Fold a quantity change into the staged edits, replacing any earlier one for
 * the same record; passing `null` only removes.
 *
 * Removing on a no-op is deliberate: staging the figure the save already holds
 * must clear the row from the staged list rather than leave it there looking
 * like a pending change that the next download would apply.
 */
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

/**
 * The sort the next click on a column's heading asks for.
 *
 * Clicking the column already sorted on flips the direction and nothing else;
 * clicking a different one sorts it, and quantity starts descending because
 * "most of it first" is the useful default for a count.
 */
const nextSort = (
	column: SortColumn,
	sortBy: SortColumn,
	direction: "asc" | "desc",
): { column: SortColumn; direction: "asc" | "desc" } =>
	sortBy === column
		? { column, direction: direction === "asc" ? "desc" : "asc" }
		: { column, direction: column === "quantity" ? "desc" : "asc" };

/** Every category the storage holds items of, in a stable order. */
const categoriesIn = (items: GroupedItem[]): string[] => {
	const categories = new Set<string>();
	for (const item of items) {
		if (item.category) categories.add(item.category);
	}
	return Array.from(categories).sort();
};

/**
 * The rows the search and the category pill leave behind.
 *
 * A storage can hold thousands of item types, so this runs on every keystroke
 * and the order of the two tests matters: a category pill that does not match is
 * excluded before the text is consulted, because the pills and the text are two
 * filters over one list and neither should be able to bring back a row the other
 * removed.
 */
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

/**
 * The rows in the order the chosen column asks for.
 *
 * Quantity is compared numerically — a stack of 9 must not sort above a stack of
 * 10 — and every comparison falls back to the name, so the order is total and
 * two rows with equal quantities never swap places between renders. A row that
 * moved because its neighbour changed is a row whose selection moves with it.
 */
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

/**
 * The bar above the table: the search, how much of the storage it left, and the
 * three actions that act on more than one item.
 *
 * Its own component because the actions it holds are whole-storage operations —
 * two planners and the details drawer — and having them in the view's body put
 * a `Modal` and its confirmation copy between the view's state and the table.
 */
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
	/** An item is selected, so there is something to show details for. */
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

/**
 * What the table's selection means: the item, the copy of it, and every staged
 * edit that belongs to that copy.
 *
 * These answers are one question asked nine ways, and four different parts of
 * the view branch on them together — the details pane, the equipment drawer and
 * the quantity editor all need the same record and the same three edits.
 * Deriving them in one place is what stops a reader having to reconstruct which
 * `.find` each of them used, and stops them drifting apart.
 */
type Selection = {
	item: GroupedItem | null;
	record: InventoryRecord | null;
	/** Filled and unlocked socket counts, when the item has sockets at all. */
	sockets: ReturnType<typeof itemSocketSummary>;
	/** The save's own record for `record`, before any staged edit. */
	savedRecord: InventoryRecord | undefined;
	stagedEquipment: EquipmentEdit | undefined;
	addition: InsertEquipmentEdit | undefined;
	/** The catalog entry for the added item, which has no save record. */
	additionDefinition: EquipmentCatalog["items"][string] | undefined;
	stagedEdit: QuantityEdit | undefined;
	/** What the quantity field shows: the user's draft, else the staged figure. */
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

/**
 * Why this quantity cannot be staged for this record, or `null` when it can.
 *
 * The same range the add-item drawer accepts, stated once per surface rather
 * than invented twice: a whole number the engine's stack size can hold.
 */
const quantityRangeError = (quantity: number): string | null =>
	Number.isInteger(quantity) && quantity >= 1 && quantity <= 999_999_999
		? null
		: "Quantity must be a whole number from 1 to 999,999,999.";

/**
 * Where the details pane lives: its own column on a wide screen, a drawer on a
 * narrow one.
 *
 * Both hosts render the same pane and only one is ever on screen, so the choice
 * belongs in one place rather than in two `isWide ? … : …` expressions the view
 * has to keep in agreement. The drawer stays mounted and closed on a wide
 * screen rather than being dropped: `hiddenFrom`/`visibleFrom` already hide it,
 * and remounting it would throw away the pane's own state each time the
 * breakpoint moved.
 */
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

/**
 * Whether a record's stack has a count worth editing at all.
 *
 * Only a plain stack does: an item with gear is one unit, a staged addition has
 * no save record yet, and a gear-less item is held once however the game counts
 * it. Offering a quantity field for any of those would stage a change the engine
 * would refuse, so the field and this check agree by construction.
 */
const canEditQuantity = (record: InventoryRecord): boolean =>
	!record.equipment && !record.staged && !record.noGearToEdit;

/**
 * The quantity edit this record should carry, or `null` to clear it.
 *
 * `expectedQuantity` is the figure the *file* holds, not the projected one: the
 * applier compares against it to refuse a change the save does not need, and
 * comparing against a quantity already staged would make the second press of
 * Stage look like a no-op.
 */
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

/** A whole-storage equipment plan, waiting for the user to confirm it. */
type BulkConfirm = {
	type: "max" | "random";
	count: number;
	plannedEdits: EquipmentEdit[];
};

/**
 * The two storage-wide planners, and the confirm each one opens.
 *
 * One component because the buttons and the modal are one action with two
 * possible bodies: pressing either plans over the whole storage and then asks
 * what the plan will do before anything is staged, and both halves were
 * otherwise written out twice — once per planner, including the plan call
 * itself.
 */
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

/**
 * The quick category filters under the toolbar.
 *
 * Its own component because the pills and the "All" pill are the same control
 * with a different value, and writing "All" separately is how a filter that
 * clears the category ends up not clearing it.
 */
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

/**
 * The staged equipment changes for this save, each with a way to drop it.
 *
 * Its own component because it is the one place the editor reports work the
 * user has queued but not downloaded, and it filters the whole edit list down
 * to the two equipment kinds before doing anything else — a filter that lived
 * in the view was applied to every render of the table for every item type.
 */
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

/**
 * The item table: the sortable headings, one row per item type, and the
 * placeholder for a search that matched nothing.
 *
 * Its own component so the view's body is the layout around the table rather
 * than the layout plus a hundred lines of columns, and so the `colSpan` of the
 * empty row and the header live beside each other — they are the same four
 * columns, and writing a bare `4` in one place and four headings in the other
 * is how they come to disagree.
 */
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

/**
 * One storage location: the searchable item table, the details of whatever is
 * selected, and the equipment editor for it.
 *
 * The view owns its own search, sort and selection. That is the point of the
 * split: a keystroke here re-renders this view, not the sidebar, the header or
 * the other drawers. The page only tells it what changed elsewhere — which
 * storage is open, and which item a staged change should reveal.
 */
type InventoryViewProps = {
	/** Every record, with staged edits already folded in. */
	records: InventoryRecord[];
	/** The save's own records, before any staged edit was folded in. */
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
	/** Another view is on screen; this one keeps its state but is not drawn. */
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
	const [editorOpen, setEditorOpen] = useState(false);
	const [detailsOpen, setDetailsOpen] = useState(false);
	/** The details pane has its own column only from the `xl` breakpoint. */
	const isWide = useMediaQuery("(min-width: 75em)") ?? true;
	const [bulkConfirm, setBulkConfirm] = useState<BulkConfirm | null>(null);

	// Opening another location starts a fresh browse; a staged change re-points
	// the selection at what was just staged. Both arrive as props, so they are
	// applied in one place instead of from every caller.
	//
	// Applied while rendering rather than in an effect, for the reason
	// `add-item-drawer.tsx` gives: an effect runs after the browser has already
	// painted, so the table would show one frame of the previous location's
	// selection — and the item the page just asked to reveal would appear a
	// frame late. The guard is the last `focus` this view acted on, which is
	// what React's "adjusting state when a prop changes" pattern is for: the
	// page holds `focus` in state, so its identity only changes when the page
	// means something new by it.
	//
	// Only what `focus` decides is reset. The sort column and direction are the
	// user's own choice and are left alone — resetting all of it because one
	// prop moved would throw away a preference nobody asked to lose.
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

	// The drawers are portalled, so hiding this view would not hide them: they
	// would stay on screen over whatever replaced it. Closed during the same
	// render that hides the view, so there is no frame in which the view is
	// gone and its drawer is not.
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

	/** The catalog name a staged equipment edit reports to the staged list. */
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

	const chooseRecord = useCallback(
		(record: InventoryRecord) => {
			setSelectedSlot(record.slotNo);
			const staged = quantityEditFor(edits, record);
			setQuantityDraft(String(staged?.newQuantity ?? record.quantity));
		},
		[edits],
	);

	// Stable row handlers, so memoized rows only re-render when they change.
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
			onQuantityChange={setQuantityDraft}
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

				{/* Quick Category Filter Pills */}
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
				onQuantityChange={setQuantityDraft}
				onChooseRecord={chooseRecord}
				onStageQuantity={stageQuantity}
				onStageEquipment={onStageEquipment}
				setEdits={setEdits}
			/>
		</Flex>
	);
};
