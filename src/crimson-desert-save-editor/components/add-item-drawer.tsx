import {
	Alert,
	Box,
	Button,
	Drawer,
	Group,
	Paper,
	Select,
	Stack,
	Text,
	TextInput,
} from "@mantine/core";
import { Plus, TriangleAlert } from "lucide-react";
import {
	type Dispatch,
	type SetStateAction,
	useEffect,
	useMemo,
	useState,
} from "react";
import { planAddition, storageKeys } from "../lib/add-plan";
import { cheatGearEdits, cheatGearSet } from "../lib/cheat-gear";
import {
	type Catalog,
	type CatalogItem,
	type GroupedItem,
	groupRecords,
	type InventoryRecord,
	itemType,
	stackDonor,
	storageName,
} from "../lib/inventory";
import { isAddableItem } from "../lib/item-catalog";
import type { ItemKnowledgeMapFile } from "../lib/save-engine/data";
import type {
	InsertCatalogItemEdit,
	InsertItemEdit,
	QuantityEdit,
	SaveEdit,
} from "../lib/staged-edits";
import { CatalogBrowser, type CatalogEntry } from "./catalog-browser";
import { Picture } from "./picture";

const ROW_HEIGHT = 56;
const LIST_HEIGHT = 256;

const applyPlanned = (
	current: SaveEdit[],
	planned: Array<QuantityEdit | InsertItemEdit | InsertCatalogItemEdit>,
): SaveEdit[] => {
	let next = current;
	for (const edit of planned) {
		if (edit.type === "quantity") {
			const { inventoryKey, slotNo } = edit;
			next = next.filter(
				(entry) =>
					!(
						entry.type === "quantity" &&
						entry.inventoryKey === inventoryKey &&
						entry.slotNo === slotNo
					),
			);
		}
		next = [...next, edit];
	}
	return next;
};

const stagedQuantityError = (
	target: CatalogItem,
	quantity: string,
): string | null => {
	if (target.addsAsSingleRecord) return null;
	const parsed = Number(quantity);
	return Number.isInteger(parsed) && parsed >= 1 && parsed <= 999_999_999
		? null
		: "Quantity must be a whole number from 1 to 999,999,999.";
};

const stagedQuantityFor = (
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

type RevealTarget = {
	inventoryKey: number;
	itemKey: number;
	slotNo: number | null;
};

const revealFor = (
	edit: QuantityEdit | InsertItemEdit | InsertCatalogItemEdit,
): RevealTarget => ({
	inventoryKey: edit.inventoryKey,
	itemKey: edit.itemKey,
	slotNo: "slotNo" in edit ? edit.slotNo : null,
});

const CheatGearPanel = ({
	storageKey,
	records,
	catalog,
	edits,
	busy,
	setEdits,
	onError,
	onReveal,
	onClose,
}: {
	storageKey: number | null;
	records: InventoryRecord[];
	catalog: Catalog | null;
	edits: SaveEdit[];
	busy: boolean;
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
	onError: (message: string) => void;
	onReveal: (target: RevealTarget) => void;
	onClose: () => void;
}) => {
	const stageCheatSet = async () => {
		if (busy || storageKey === null) return;
		const { edits: planned, skipped } = await cheatGearEdits({
			inventoryKey: storageKey,
			records,
			catalog,
			staged: edits,
		});
		if (planned.length === 0) {
			onError(
				skipped.length > 0
					? `Nothing to add: ${skipped
							.map((skip) => `${skip.label} (${skip.reason})`)
							.join("; ")}.`
					: "Nothing to add.",
			);
			return;
		}
		onError("");
		setEdits((current) => [...current, ...planned]);
		const last = planned.at(-1);
		if (last && "itemKey" in last) {
			onReveal({
				inventoryKey: storageKey,
				itemKey: last.itemKey,
				slotNo: null,
			});
		}
		onClose();
	};
	return (
		<Paper withBorder p="sm">
			<Text size="sm" fw={500}>
				THE ONE TRUE RING (mod)
			</Text>
			<Text mt={4} size="xs" c="dimmed">
				Stages the mod's cheat set: the ring and Abyss Gears it names, the
				bracelet its author's Ultimate Axiom mod buffs, and one item for every
				other equipment slot — helm, chest, gloves, boots, cloak, necklace, two
				rings and two earrings — each taken to its own refinement and socket
				ceilings. The buffs live in the game's own item data, so they only apply
				once the mod is installed.
			</Text>
			<Button
				mt="sm"
				variant="default"
				fullWidth
				disabled={storageKey === null || busy || !catalog}
				title={cheatGearSet.map((gear) => gear.note).join(" ")}
				onClick={stageCheatSet}
			>
				Add cheat set ({cheatGearSet.length} items)
			</Button>
			<Text mt="xs" size="xs" c="dimmed" lineClamp={4}>
				{cheatGearSet.map((gear) => gear.label).join(" · ")}
			</Text>
		</Paper>
	);
};

const QuantityField = ({
	target,
	existingItem,
	existingRecord,
	baseQuantity,
	resultQuantity,
	stagedExisting,
	quantity,
	onQuantityChange,
}: {
	target: CatalogItem | undefined;
	existingItem: GroupedItem | null;
	existingRecord: InventoryRecord | null;
	baseQuantity: number;
	resultQuantity: number | null;
	stagedExisting: QuantityEdit | undefined;
	quantity: string;
	onQuantityChange: (value: string) => void;
}) => (
	<>
		<TextInput
			label={existingItem ? "Quantity to add" : "Starting quantity"}
			inputMode="numeric"
			value={target?.addsAsSingleRecord ? "1" : quantity}
			disabled={target?.addsAsSingleRecord}
			onChange={(event) => onQuantityChange(event.currentTarget.value)}
			description={
				target?.addsAsSingleRecord
					? existingItem
						? "Already in this storage."
						: "Added as one item. This does not make a prop or vehicle part character-equippable."
					: undefined
			}
			ff="monospace"
		/>
		{!target?.addsAsSingleRecord && (
			<Group gap={6}>
				{[1, 10, 100, 1000].map((inc) => (
					<Button
						key={inc}
						size="xs"
						variant="default"
						onClick={() => {
							const current = Number.parseInt(quantity, 10);
							const base = Number.isNaN(current) ? 0 : current;
							onQuantityChange(String(Math.min(999_999_999, base + inc)));
						}}
					>
						+{inc}
					</Button>
				))}
				<Button
					size="xs"
					variant="default"
					onClick={() => onQuantityChange("999")}
				>
					Set 999
				</Button>
			</Group>
		)}
		{!target?.addsAsSingleRecord && existingItem && existingRecord && (
			<Text size="xs" c="dimmed">
				{baseQuantity.toLocaleString()} currently
				{stagedExisting ? " after staged changes" : ""} →{" "}
				<Text span fw={500} c="var(--mantine-color-text)">
					{resultQuantity?.toLocaleString() ?? "—"} after this addition
				</Text>
			</Text>
		)}
	</>
);

const AdditionNotices = ({
	hasTemplate,
	singleRecord,
	discoveryKnowledgeKey,
	noDiscoveryRequired,
}: {
	hasTemplate: boolean;
	singleRecord: boolean;
	discoveryKnowledgeKey: number | undefined;
	noDiscoveryRequired: boolean;
}) => (
	<Stack gap="xs">
		<Alert variant="light" color="teal" p="sm">
			<Text size="xs" c="dimmed">
				This item will be added without replacing or changing anything already
				in this storage.
			</Text>
		</Alert>

		{!hasTemplate && !singleRecord && (
			<Alert variant="light" color="yellow" p="sm">
				<Text size="xs" c="dimmed">
					New items cannot currently be added to this storage location.
				</Text>
			</Alert>
		)}

		{discoveryKnowledgeKey ? (
			<Alert variant="light" color="brand" p="sm">
				<Text size="xs">
					This item’s discovery will be added automatically if you haven’t
					learned it yet.
				</Text>
			</Alert>
		) : noDiscoveryRequired ? (
			<Alert variant="light" color="brand" p="sm">
				<Text size="xs">
					This item has no separate pickup-discovery requirement in the game
					data.
				</Text>
			</Alert>
		) : (
			<Alert variant="light" color="yellow" p="sm">
				<Text size="xs" c="dimmed">
					We do not yet have a verified discovery mapping for this item. It may
					appear as “Unknown” until the game grants its knowledge entry.
				</Text>
			</Alert>
		)}
	</Stack>
);

const DrawerTitle = () => (
	<Stack gap="xs">
		<Group gap="xs" c="brand">
			<Plus size={16} />
			<Text
				size="10px"
				fw={500}
				tt="uppercase"
				style={{ letterSpacing: "0.14em" }}
			>
				Inventory addition
			</Text>
		</Group>
		<Text component="span" size="xl" fw={600}>
			Add an item
		</Text>
		<Text size="xs" c="dimmed">
			Add items, tools, props, and non-character gear to the chosen storage.
			Stackable items can also be increased here.
		</Text>
	</Stack>
);

const SelectedItemSummary = ({
	itemKey,
	target,
	storageKey,
	existingItem,
	existingRecord,
	onChooseSlot,
}: {
	itemKey: string;
	target: CatalogItem | undefined;
	storageKey: number | null;
	existingItem: GroupedItem | null;
	existingRecord: InventoryRecord | null;
	onChooseSlot: (slot: number | null) => void;
}) => (
	<>
		{target && (
			<Paper withBorder p="sm" bg="var(--app-surface-2)">
				<Group gap="md" wrap="nowrap">
					<Picture kind="item" pictureKey={itemKey} size={64} />
					<Text size="sm" fw={500}>
						{target.name}
					</Text>
				</Group>
				<Text mt={4} size="xs" c="dimmed" lineClamp={3}>
					{target.description || "No current-game description is available."}
				</Text>
			</Paper>
		)}

		{existingItem && storageKey !== null && (
			<Alert variant="light" color="brand" p="sm">
				<Text size="xs" fw={500}>
					Already in {storageName(storageKey)}
				</Text>
				<Text mt={4} size="xs" c="dimmed">
					The editor will add to the existing stack instead of creating a
					duplicate record.
				</Text>
			</Alert>
		)}

		{existingItem && existingItem.recordList.length > 1 && (
			<Select
				label="Existing stack"
				description="This storage contains multiple stacks. Choose which one should receive the added quantity."
				value={existingRecord ? String(existingRecord.slotNo) : null}
				allowDeselect={false}
				data={existingItem.recordList.map((record) => ({
					value: String(record.slotNo),
					label: `Slot ${record.slotNo} · quantity ${record.quantity}`,
				}))}
				onChange={(value) =>
					onChooseSlot(value === null ? null : Number(value))
				}
			/>
		)}
	</>
);

const stageDisabled = ({
	target,
	existingItem,
	existingRecord,
	hasTemplate,
	busy,
}: {
	target: CatalogItem | undefined;
	existingItem: GroupedItem | null;
	existingRecord: InventoryRecord | null;
	hasTemplate: boolean;
	busy: boolean;
}): boolean => {
	if (!target || busy) return true;
	if (target.addsAsSingleRecord) return existingItem !== null;
	return existingItem ? existingRecord === null : !hasTemplate;
};

const existingStackFor = (
	storageItems: GroupedItem[],
	itemKey: string,
	existingSlot: number | null,
): InventoryRecord | null => {
	if (!itemKey) return null;
	const item =
		storageItems.find((entry) => entry.itemKey === Number(itemKey)) ?? null;
	if (!item) return null;
	return (
		item.recordList.find((record) => record.slotNo === existingSlot) ??
		item.recordList[0] ??
		null
	);
};

type Selection = {
	target: CatalogItem | undefined;
	existingItem: GroupedItem | null;
	existingRecord: InventoryRecord | null;
	stagedEdit: QuantityEdit | undefined;
	baseQuantity: number;
	resultQuantity: number | null;
	discoveryKnowledgeKey: number | undefined;
	noDiscoveryRequired: boolean;
};

const selectionFor = ({
	catalog,
	knowledgeMap,
	storageItems,
	edits,
	itemKey,
	quantity,
	existingSlot,
}: {
	catalog: Catalog | null;
	knowledgeMap: ItemKnowledgeMapFile | null;
	storageItems: GroupedItem[];
	edits: SaveEdit[];
	itemKey: string;
	quantity: string;
	existingSlot: number | null;
}): Selection => {
	const target = itemKey && catalog ? catalog.items[itemKey] : undefined;
	const existingItem = itemKey
		? (storageItems.find((item) => item.itemKey === Number(itemKey)) ?? null)
		: null;
	const existingRecord = existingStackFor(storageItems, itemKey, existingSlot);
	const stagedEdit = stagedQuantityFor(edits, existingRecord);
	const baseQuantity = stagedEdit?.newQuantity ?? existingRecord?.quantity ?? 0;
	const parsed = Number(quantity);
	return {
		target,
		existingItem,
		existingRecord,
		stagedEdit,
		baseQuantity,
		resultQuantity:
			Number.isInteger(parsed) && parsed > 0 ? baseQuantity + parsed : null,
		discoveryKnowledgeKey: itemKey
			? knowledgeMap?.items[itemKey]?.knowledge_keys[0]
			: undefined,
		noDiscoveryRequired:
			knowledgeMap?.no_discovery_item_keys?.includes(Number(itemKey)) ?? false,
	};
};

const AddableItemBrowser = ({
	catalog,
	storageKey,
	storageItems,
	stagedKeys,
	itemKey,
	onSelect,
	onFilterChange,
}: {
	catalog: Catalog | null;
	storageKey: number | null;
	storageItems: GroupedItem[];
	stagedKeys: Set<number>;
	itemKey: string;
	onSelect: (itemKey: string, slotNo: number | null) => void;
	onFilterChange: () => void;
}) => {
	const storageItemByKey = useMemo(
		() => new Map(storageItems.map((item) => [item.itemKey, item])),
		[storageItems],
	);

	const allAddableKeys = useMemo(() => {
		if (!catalog) return [];
		return Object.entries(catalog.items)
			.filter(([, item]) => isAddableItem(item))
			.sort(([, left], [, right]) => left.name.localeCompare(right.name))
			.map(([key]) => key);
	}, [catalog]);

	const addableCatalogKeys = useMemo(
		() =>
			stagedKeys.size === 0
				? allAddableKeys
				: allAddableKeys.filter((key) => !stagedKeys.has(Number(key))),
		[allAddableKeys, stagedKeys],
	);

	const entries = useMemo<CatalogEntry[]>(() => {
		if (!catalog) return [];
		return addableCatalogKeys.flatMap((key) => {
			const item = catalog.items[key];
			if (!item) return [];
			const category = itemType(item);
			return [
				{
					key,
					name: item.name,
					category,
					description: `${category} · #${key}`,
				},
			];
		});
	}, [addableCatalogKeys, catalog]);

	return (
		<Box>
			<Text size="xs" fw={500}>
				Choose an item
			</Text>
			<Text mt={4} size="xs" c="dimmed">
				Browse by item type or search by the in-game name or numeric item ID.
			</Text>
			<Box mt="sm">
				<CatalogBrowser
					key={String(storageKey)}
					entries={entries}
					labels={{
						all: "All items",
						category: "Item type",
						search: "Search items",
						list: "Matching items",
						empty: "No items match this type and search.",
					}}
					rowHeight={ROW_HEIGHT}
					maxHeight={LIST_HEIGHT}
					getStatus={(entry) => {
						const held = storageItemByKey.get(Number(entry.key));
						if (held) return `In storage · ${held.quantity}`;
						return itemKey === entry.key ? "Selected" : "";
					}}
					getActive={(entry) => itemKey === entry.key}
					onSelect={(entry) =>
						onSelect(
							entry.key,
							storageItemByKey.get(Number(entry.key))?.recordList[0]?.slotNo ??
								null,
						)
					}
					onFilterChange={onFilterChange}
				/>
			</Box>
		</Box>
	);
};

export const AddItemDrawer = ({
	opened,
	defaultStorage,
	storages,
	records,
	catalog,
	knowledgeMap,
	edits,
	setEdits,
	setError,
	busy,
	onClose,
	onReveal,
}: {
	opened: boolean;
	defaultStorage: number | null;
	storages: { key: number }[];
	records: InventoryRecord[];
	catalog: Catalog | null;
	knowledgeMap: ItemKnowledgeMapFile | null;
	edits: SaveEdit[];
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
	setError: Dispatch<SetStateAction<string>>;
	busy: boolean;
	onClose: () => void;
	onReveal: (target: {
		inventoryKey: number;
		itemKey: number;
		slotNo: number | null;
	}) => void;
}) => {
	const [storageKey, setStorageKey] = useState<number | null>(
		() => defaultStorage ?? storages[0]?.key ?? null,
	);
	const [itemKey, setItemKey] = useState("");
	const [existingSlot, setExistingSlot] = useState<number | null>(null);
	const [quantity, setQuantity] = useState("1");
	const [localError, setLocalError] = useState("");

	const [openedFor, setOpenedFor] = useState(opened);
	if (openedFor !== opened) {
		setOpenedFor(opened);
		if (opened) {
			setStorageKey(defaultStorage ?? storages[0]?.key ?? null);
			setItemKey("");
			setExistingSlot(null);
			setQuantity("1");
			setLocalError("");
		}
	}

	useEffect(() => {
		if (opened) setError("");
	}, [opened, setError]);

	const storageItems = useMemo(() => {
		if (storageKey === null) return [];
		return groupRecords(
			records.filter((record) => record.inventoryKey === storageKey),
			catalog,
		);
	}, [storageKey, catalog, records]);

	const stagedKeys = useMemo(
		() => storageKeys({ records, edits, inventoryKey: storageKey }).staged,
		[records, edits, storageKey],
	);

	const {
		target,
		existingItem,
		existingRecord,
		stagedEdit: stagedExistingEdit,
		baseQuantity: existingBaseQuantity,
		resultQuantity: existingResultQuantity,
		discoveryKnowledgeKey,
		noDiscoveryRequired,
	} = selectionFor({
		catalog,
		knowledgeMap,
		storageItems,
		edits,
		itemKey,
		quantity,
		existingSlot,
	});

	const automaticTemplate = useMemo(
		() =>
			stackDonor({
				records,
				catalog,
				inventoryKey: storageKey,
				category: target ? itemType(target) : null,
			}),
		[records, catalog, storageKey, target],
	);

	const stagePlanned = (
		planned: Array<QuantityEdit | InsertItemEdit | InsertCatalogItemEdit>,
	) => {
		setEdits((current) => applyPlanned(current, planned));
	};

	const stage = () => {
		if (busy) return;
		if (!target || !itemKey) {
			setLocalError("Choose an item to add.");
			return;
		}
		const quantityError = stagedQuantityError(target, quantity);
		if (quantityError) {
			setLocalError(quantityError);
			return;
		}
		const plan = planAddition({
			records,
			catalog,
			edits,
			inventoryKey: storageKey,
			itemKey: Number(itemKey),
			quantity: Number(quantity),
			preferredSlot: existingSlot,
		});
		if ("error" in plan) {
			setLocalError(plan.error);
			return;
		}
		setLocalError("");
		stagePlanned([plan.edit]);
		onReveal(revealFor(plan.edit));
		onClose();
	};

	const disabled = stageDisabled({
		target,
		existingItem,
		existingRecord,
		hasTemplate: automaticTemplate !== null,
		busy,
	});

	return (
		<Drawer
			opened={opened}
			onClose={onClose}
			position="right"
			size="32rem"
			title={<DrawerTitle />}
		>
			<Stack gap="lg">
				{localError && (
					<Alert
						color="red"
						icon={<TriangleAlert size={16} />}
						title="Could not add item"
					>
						{localError}
					</Alert>
				)}
				<Select
					label="Storage location"
					placeholder="Choose storage"
					value={storageKey === null ? null : String(storageKey)}
					data={storages.map((storage) => ({
						value: String(storage.key),
						label: storageName(storage.key),
					}))}
					allowDeselect={false}
					onChange={(value) => {
						setStorageKey(value === null ? null : Number(value));
						setItemKey("");
						setExistingSlot(null);
					}}
				/>

				<CheatGearPanel
					storageKey={storageKey}
					records={records}
					catalog={catalog}
					edits={edits}
					busy={busy}
					setEdits={setEdits}
					onError={setLocalError}
					onReveal={onReveal}
					onClose={onClose}
				/>

				<AddableItemBrowser
					catalog={catalog}
					storageKey={storageKey}
					storageItems={storageItems}
					stagedKeys={stagedKeys}
					itemKey={itemKey}
					onSelect={(key, slotNo) => {
						setItemKey(key);
						setExistingSlot(slotNo);
					}}
					onFilterChange={() => {
						setItemKey("");
						setExistingSlot(null);
					}}
				/>

				<SelectedItemSummary
					itemKey={itemKey}
					target={target}
					storageKey={storageKey}
					existingItem={existingItem}
					existingRecord={existingRecord}
					onChooseSlot={setExistingSlot}
				/>

				<QuantityField
					target={target}
					existingItem={existingItem}
					existingRecord={existingRecord}
					baseQuantity={existingBaseQuantity}
					resultQuantity={existingResultQuantity}
					stagedExisting={stagedExistingEdit}
					quantity={quantity}
					onQuantityChange={setQuantity}
				/>

				{!existingItem && (
					<AdditionNotices
						hasTemplate={automaticTemplate !== null}
						singleRecord={target?.addsAsSingleRecord ?? false}
						discoveryKnowledgeKey={discoveryKnowledgeKey}
						noDiscoveryRequired={noDiscoveryRequired}
					/>
				)}

				<Button size="md" fullWidth disabled={disabled} onClick={stage}>
					{existingItem ? "Stage quantity addition" : "Stage new item"}
				</Button>
			</Stack>
		</Drawer>
	);
};
