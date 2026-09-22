import {
	Alert,
	Badge,
	Box,
	Button,
	Center,
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
import {
	Archive,
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	CircleHelp,
	Hash,
	Search,
	Sparkles,
	Wand2,
} from "lucide-react";
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { EquipmentEditorDrawer } from "@/components/equipment-editor-drawer";
import type { EquipmentCatalog } from "@/components/equipment-workshop";
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
 * One storage location: the searchable item table, the details of whatever is
 * selected, and the equipment editor for it.
 *
 * The view owns its own search, sort and selection. That is the point of the
 * split: a keystroke here re-renders this view, not the sidebar, the header or
 * the other drawers. The page only tells it what changed elsewhere — which
 * storage is open, and which item a staged change should reveal.
 */
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
}: {
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
}) => {
	const [query, setQuery] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string>("all");
	const [sortBy, setSortBy] = useState<SortColumn>("name");
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
	const [selectedKey, setSelectedKey] = useState<number | null>(null);
	const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
	const [quantityDraft, setQuantityDraft] = useState("");
	const [editorOpen, setEditorOpen] = useState(false);
	const [bulkConfirm, setBulkConfirm] = useState<{
		type: "max" | "random";
		count: number;
		plannedEdits: EquipmentEdit[];
	} | null>(null);

	// Opening another location starts a fresh browse; a staged change re-points
	// the selection at what was just staged. Both arrive as props, so they are
	// applied in one place instead of from every caller.
	useEffect(() => {
		setSelectedKey(focus?.itemKey ?? null);
		setSelectedSlot(focus?.slotNo ?? null);
		setQuantityDraft("");
		setEditorOpen(false);
		setQuery("");
		setSelectedCategory("all");
	}, [focus]);

	// The drawer is portalled, so hiding this view would not hide it.
	useEffect(() => {
		if (hidden) setEditorOpen(false);
	}, [hidden]);

	const items = useMemo(() => {
		if (activeStorage === null) return [];
		return groupRecords(
			records.filter((record) => record.inventoryKey === activeStorage),
			catalog,
		);
	}, [activeStorage, catalog, records]);

	const availableCategories = useMemo(() => {
		const cats = new Set<string>();
		for (const item of items) {
			if (item.category) cats.add(item.category);
		}
		return Array.from(cats).sort();
	}, [items]);

	const visibleItems = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		return items.filter((item) => {
			if (selectedCategory !== "all" && item.category !== selectedCategory) {
				return false;
			}
			if (!normalized) return true;
			return (
				item.name.toLowerCase().includes(normalized) ||
				item.category.toLowerCase().includes(normalized) ||
				String(item.itemKey).includes(normalized)
			);
		});
	}, [items, query, selectedCategory]);

	const sortedItems = useMemo(() => {
		const direction = sortDirection === "asc" ? 1 : -1;
		return [...visibleItems].sort((left, right) => {
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
	}, [sortBy, sortDirection, visibleItems]);

	/** The catalog name a staged equipment edit reports to the staged list. */
	const equipmentName = useCallback(
		(itemKey: number) =>
			catalog?.items[String(itemKey)]?.name ?? `Item ${itemKey}`,
		[catalog],
	);

	const selectedItem =
		sortedItems.find((item) => item.itemKey === selectedKey) ??
		sortedItems[0] ??
		null;
	const selectedRecord =
		selectedItem?.recordList.find((record) => record.slotNo === selectedSlot) ??
		selectedItem?.recordList[0] ??
		null;
	const selectedSockets = itemSocketSummary(selectedRecord?.equipment);
	const originalSelectedRecord = savedRecords.find(
		(record) =>
			record.inventoryKey === selectedRecord?.inventoryKey &&
			record.slotNo === selectedRecord?.slotNo &&
			record.itemKey === selectedRecord?.itemKey,
	);
	const stagedEquipment = edits.find(
		(edit): edit is EquipmentEdit =>
			edit.type === "equipment" &&
			edit.inventoryKey === selectedRecord?.inventoryKey &&
			edit.slotNo === selectedRecord?.slotNo &&
			edit.itemKey === selectedRecord?.itemKey,
	);
	const selectedEquipmentAddition = edits.find(
		(edit): edit is InsertEquipmentEdit =>
			edit.type === "insertEquipment" &&
			edit.inventoryKey === selectedRecord?.inventoryKey &&
			edit.itemKey === selectedRecord?.itemKey,
	);
	const additionDefinition = selectedEquipmentAddition
		? equipmentCatalog?.items[String(selectedEquipmentAddition.itemKey)]
		: undefined;
	const selectedStagedEdit = selectedRecord
		? edits.find(
				(edit): edit is QuantityEdit =>
					edit.type === "quantity" &&
					edit.inventoryKey === selectedRecord.inventoryKey &&
					edit.slotNo === selectedRecord.slotNo,
			)
		: undefined;
	const displayedQuantity =
		quantityDraft ||
		String(selectedStagedEdit?.newQuantity ?? selectedRecord?.quantity ?? "");

	const chooseRecord = useCallback(
		(record: InventoryRecord) => {
			setSelectedSlot(record.slotNo);
			const staged = edits.find(
				(edit): edit is QuantityEdit =>
					edit.type === "quantity" &&
					edit.inventoryKey === record.inventoryKey &&
					edit.slotNo === record.slotNo,
			);
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
		// Only a stack has a count to edit: an item with gear is one unit, a
		// staged addition has no record yet, and a gear-less item is held once
		// anyway.
		if (
			selectedRecord.equipment ||
			selectedRecord.staged ||
			selectedRecord.noGearToEdit
		) {
			return;
		}
		const quantity = Number(displayedQuantity);
		if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999_999_999) {
			setError("Quantity must be a whole number from 1 to 999,999,999.");
			return;
		}
		const originalQuantity =
			selectedRecord.originalQuantity ?? selectedRecord.quantity;
		setError("");
		setEdits((current) => {
			const remaining = current.filter(
				(edit) =>
					!(
						edit.type === "quantity" &&
						edit.inventoryKey === selectedRecord.inventoryKey &&
						edit.slotNo === selectedRecord.slotNo
					),
			);
			if (quantity === originalQuantity) return remaining;
			return [
				...remaining,
				{
					type: "quantity",
					inventoryKey: selectedRecord.inventoryKey,
					slotNo: selectedRecord.slotNo,
					itemKey: selectedRecord.itemKey,
					itemName: selectedItem.name,
					expectedQuantity: originalQuantity,
					newQuantity: quantity,
				},
			];
		});
	};

	const toggleSort = (column: SortColumn) => {
		if (sortBy === column) {
			setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
			return;
		}
		setSortBy(column);
		setSortDirection(column === "quantity" ? "desc" : "asc");
	};

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
					borderRight: "1px solid var(--mantine-color-dark-4)",
				}}
			>
				<Group
					p="md"
					gap="md"
					justify="space-between"
					style={{
						flexShrink: 0,
						borderBottom: "1px solid var(--mantine-color-dark-4)",
					}}
				>
					<TextInput
						value={query}
						onChange={(event) => setQuery(event.currentTarget.value)}
						placeholder="Search names, categories, or IDs"
						leftSection={<Search size={16} />}
						style={{ flex: 1, maxWidth: 384 }}
						aria-label="Search items"
					/>
					<Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
						<Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
							{visibleItems.length} of {items.length} item types
						</Text>
						{activeStorage !== null && (
							<>
								<Button
									variant="default"
									size="sm"
									leftSection={<Sparkles size={14} />}
									title="Take every item to the refinement and sockets this item allows, then fill the sockets with the strongest Abyss Gear that fits."
									onClick={() => {
										if (activeStorage === null) return;
										const plan = maxEquipmentEdits({
											records: savedRecords,
											inventoryKey: activeStorage,
											rules: abyssGearRules,
											itemNameFor: equipmentName,
										});
										setBulkConfirm({
											type: "max",
											count: plan.edits.length,
											plannedEdits: plan.edits,
										});
									}}
								>
									Max Equipment
								</Button>
								<Button
									variant="default"
									size="sm"
									leftSection={<Wand2 size={14} />}
									title="Same as Max Equipment, but each empty socket gets a random Abyss Gear. A family's lower tiers are never used: if a “… III” exists, only the III is ever socketed."
									onClick={() => {
										if (activeStorage === null) return;
										const plan = maxEquipmentEdits({
											records: savedRecords,
											inventoryKey: activeStorage,
											rules: abyssGearRules,
											itemNameFor: equipmentName,
											gear: "random",
										});
										setBulkConfirm({
											type: "random",
											count: plan.edits.length,
											plannedEdits: plan.edits,
										});
									}}
								>
									Randomize All Sockets
								</Button>
							</>
						)}
					</Group>
				</Group>

				{/* Quick Category Filter Pills */}
				{availableCategories.length > 1 && (
					<Box
						px="md"
						py="xs"
						style={{
							flexShrink: 0,
							borderBottom: "1px solid var(--mantine-color-dark-4)",
							background: "rgba(0,0,0,0.15)",
						}}
					>
						<ScrollArea type="never">
							<Group gap={6} wrap="nowrap">
								<Badge
									size="sm"
									variant={selectedCategory === "all" ? "filled" : "outline"}
									color={selectedCategory === "all" ? "brand" : "gray"}
									style={{ cursor: "pointer" }}
									onClick={() => setSelectedCategory("all")}
								>
									All ({items.length})
								</Badge>
								{availableCategories.map((cat) => {
									const count = items.filter((i) => i.category === cat).length;
									return (
										<Badge
											key={cat}
											size="sm"
											variant={selectedCategory === cat ? "filled" : "outline"}
											color={selectedCategory === cat ? "brand" : "gray"}
											style={{ cursor: "pointer" }}
											onClick={() =>
												setSelectedCategory(
													selectedCategory === cat ? "all" : cat,
												)
											}
										>
											{cat} ({count})
										</Badge>
									);
								})}
							</Group>
						</ScrollArea>
					</Box>
				)}

				{/* Bulk Action Confirmation Modal */}
				<Modal
					opened={bulkConfirm !== null}
					onClose={() => setBulkConfirm(null)}
					title={
						bulkConfirm?.type === "max"
							? "Confirm Max Equipment"
							: "Confirm Randomize Sockets"
					}
					centered
				>
					<Stack gap="md">
						<Text size="sm">
							{bulkConfirm?.type === "max"
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
							This will stage changes for {bulkConfirm?.count ?? 0} equipment
							items in this location. Your original save file is never
							overwritten.
						</Text>
						<Group justify="flex-end" gap="sm" mt="md">
							<Button variant="default" onClick={() => setBulkConfirm(null)}>
								Cancel
							</Button>
							<Button
								color="brand"
								onClick={() => {
									if (bulkConfirm && activeStorage !== null) {
										setEdits((current) =>
											replaceStorageEquipment(
												current,
												bulkConfirm.plannedEdits,
												activeStorage,
											),
										);
									}
									setBulkConfirm(null);
								}}
							>
								Confirm & Stage ({bulkConfirm?.count ?? 0})
							</Button>
						</Group>
					</Stack>
				</Modal>

				{error && (
					<Alert
						color="red"
						m="md"
						icon={<CircleHelp size={16} />}
						title="Could not apply changes"
					>
						{error}
					</Alert>
				)}

				{edits.some(
					(edit) =>
						edit.type === "equipment" || edit.type === "insertEquipment",
				) && (
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
							{edits.map((edit) =>
								edit.type === "equipment" || edit.type === "insertEquipment" ? (
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
											{edit.type === "insertEquipment" ? "Add" : "Edit"}{" "}
											{edit.itemName} · {storageName(edit.inventoryKey)} ·
											refinement {edit.refinement}
											{` · ${edit.unlockedSockets} sockets · ${
												edit.socketItems.filter(Boolean).length
											} filled`}
										</Text>
										<Button
											size="compact-sm"
											variant="subtle"
											disabled={busy}
											onClick={() =>
												setEdits((current) =>
													current.filter((entry) => entry !== edit),
												)
											}
										>
											Discard
										</Button>
									</Group>
								) : null,
							)}
						</Stack>
					</Box>
				)}

				<Box style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
					<Table
						stickyHeader
						highlightOnHover
						verticalSpacing="sm"
						horizontalSpacing="md"
					>
						<Table.Thead>
							<Table.Tr>
								<Table.Th aria-sort={sortState("name", sortBy, sortDirection)}>
									<SortButton
										column="name"
										label="Item"
										sortBy={sortBy}
										direction={sortDirection}
										onToggle={toggleSort}
									/>
								</Table.Th>
								<Table.Th
									aria-sort={sortState("category", sortBy, sortDirection)}
									visibleFrom="md"
								>
									<SortButton
										column="category"
										label="Category"
										sortBy={sortBy}
										direction={sortDirection}
										onToggle={toggleSort}
									/>
								</Table.Th>
								<Table.Th
									aria-sort={sortState("quantity", sortBy, sortDirection)}
									ta="right"
								>
									<SortButton
										column="quantity"
										label="Quantity"
										sortBy={sortBy}
										direction={sortDirection}
										onToggle={toggleSort}
										alignRight
									/>
								</Table.Th>
								<Table.Th ta="right" w={80}>
									Edit
								</Table.Th>
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{sortedItems.map((item) => (
								<ItemRow
									key={item.itemKey}
									item={item}
									selected={selectedItem?.itemKey === item.itemKey}
									busy={busy}
									onSelect={selectItem}
									onEdit={editItem}
								/>
							))}
							{sortedItems.length === 0 && (
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
			</Flex>

			<Box
				w={340}
				visibleFrom="xl"
				style={{ flexShrink: 0, overflowY: "auto" }}
			>
				{selectedItem ? (
					<>
						<Box
							p="lg"
							style={{
								borderBottom: "1px solid var(--mantine-color-dark-4)",
							}}
						>
							<Group justify="space-between" gap="sm" align="flex-start">
								<Badge
									variant="outline"
									color="brand"
									styles={{ label: { textTransform: "uppercase" } }}
								>
									{selectedItem.category}
								</Badge>
								<Text size="xs" c="dimmed" ff="monospace">
									#{selectedItem.itemKey}
								</Text>
							</Group>
							<Group gap="md" mt="lg" wrap="nowrap">
								<Picture
									kind="item"
									pictureKey={selectedItem.itemKey}
									size={80}
								/>
								<Text component="h2" size="xl" fw={600}>
									{selectedItem.name}
								</Text>
							</Group>
							<Text mt="sm" size="xs" c="dimmed" lineClamp={5}>
								{selectedItem.description}
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
										{selectedItem.quantity.toLocaleString()}
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
										{selectedItem.records}
									</Text>
								</Paper>
							</SimpleGrid>
							<Stack gap={4}>
								<Group
									justify="space-between"
									py={8}
									style={{
										borderBottom: "1px solid var(--mantine-color-dark-4)",
									}}
								>
									<Group gap="xs">
										<Archive size={14} />
										<Text size="xs" c="dimmed">
											Location
										</Text>
									</Group>
									<Text size="xs">
										{activeStorage === null ? "—" : storageName(activeStorage)}
									</Text>
								</Group>
								{selectedItem.staged ? (
									<Group
										justify="space-between"
										py={8}
										style={{
											borderBottom: "1px solid var(--mantine-color-dark-4)",
										}}
									>
										<Text size="xs" c="dimmed">
											Status
										</Text>
										<Text size="xs" fw={500} c="brand">
											Staged addition
										</Text>
									</Group>
								) : (
									<Group
										justify="space-between"
										py={8}
										style={{
											borderBottom: "1px solid var(--mantine-color-dark-4)",
										}}
									>
										<Group gap="xs">
											<Hash size={14} />
											<Text size="xs" c="dimmed">
												First slot
											</Text>
										</Group>
										<Text size="xs" ff="monospace">
											{selectedItem.firstSlot}
										</Text>
									</Group>
								)}
								{selectedSockets && (
									<Group
										justify="space-between"
										py={8}
										style={{
											borderBottom: "1px solid var(--mantine-color-dark-4)",
										}}
									>
										<Text size="xs" c="dimmed">
											Sockets
										</Text>
										<Text size="xs" ff="monospace">
											{selectedSockets.filled}/{selectedSockets.unlocked} filled
										</Text>
									</Group>
								)}
							</Stack>
							{selectedItem.staged ? (
								<Alert variant="light" color="brand" p="sm">
									<Text size="xs">
										This item will be added to the downloaded save. Its final
										save slot is assigned automatically during validation.
									</Text>
								</Alert>
							) : selectedRecord?.noGearToEdit ? (
								<Text size="sm" c="dimmed">
									This item has no refinement or sockets to edit.
								</Text>
							) : selectedRecord?.equipment ? (
								<Alert variant="light" color="brand">
									<Text size="sm" fw={500}>
										Refinement {selectedRecord.equipment.refinement}
									</Text>
									{selectedSockets && (
										<Text size="sm" c="dimmed">
											{selectedSockets.unlocked} unlocked sockets
											{` · maximum ${selectedRecord.equipment.socketCap}`}
										</Text>
									)}
									<Button
										fullWidth
										mt="sm"
										disabled={busy}
										onClick={() => setEditorOpen(true)}
									>
										Edit equipment
									</Button>
								</Alert>
							) : (
								<Alert variant="light" color="brand">
									<Text
										size="10px"
										fw={500}
										tt="uppercase"
										style={{ letterSpacing: "0.13em" }}
									>
										Quantity editor
									</Text>
									{selectedItem.recordList.length > 1 && (
										<Select
											mt="sm"
											label="Save record"
											value={
												selectedRecord ? String(selectedRecord.slotNo) : null
											}
											allowDeselect={false}
											data={selectedItem.recordList.map((record) => ({
												value: String(record.slotNo),
												label: `Slot ${record.slotNo} · quantity ${record.quantity}`,
											}))}
											onChange={(value) => {
												const record = selectedItem.recordList.find(
													(entry) => entry.slotNo === Number(value),
												);
												if (record) chooseRecord(record);
											}}
										/>
									)}
									<Group mt="sm" gap="xs" align="flex-end">
										<TextInput
											aria-label="New quantity"
											inputMode="numeric"
											value={displayedQuantity}
											onChange={(event) =>
												setQuantityDraft(event.currentTarget.value)
											}
											ff="monospace"
											style={{ flex: 1 }}
										/>
										<Button onClick={stageQuantity}>Stage</Button>
									</Group>
									<Text mt="xs" size="xs" c="dimmed">
										Changes are staged only. Your original file is never
										overwritten.
									</Text>
								</Alert>
							)}
						</Stack>
					</>
				) : (
					<Center p="xl">
						<Text size="sm" c="dimmed" ta="center">
							Select an item to inspect its record.
						</Text>
					</Center>
				)}
			</Box>

			<EquipmentEditorDrawer
				open={editorOpen}
				onClose={() => setEditorOpen(false)}
				item={selectedItem}
				record={selectedRecord}
				activeStorage={activeStorage}
				catalog={catalog}
				busy={busy}
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
