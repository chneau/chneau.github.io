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
import { Plus } from "lucide-react";
import {
	type Dispatch,
	type SetStateAction,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	CatalogBrowser,
	type CatalogEntry,
} from "@/components/catalog-browser";
import { Picture } from "@/components/picture";
import { planAddition, storageKeys } from "@/lib/add-plan";
import { cheatGearEdits, cheatGearSet } from "@/lib/cheat-gear";
import {
	type Catalog,
	groupRecords,
	type InventoryRecord,
	itemType,
	stackDonor,
	storageName,
} from "@/lib/inventory";
import { isAddableItem } from "@/lib/item-catalog";
import type { ItemKnowledgeMapFile } from "@/lib/save-engine/data";
import type {
	InsertCatalogItemEdit,
	InsertItemEdit,
	QuantityEdit,
	SaveEdit,
} from "@/lib/staged-edits";

/**
 * The add-item browser lists every addable item (about four thousand), so its
 * rows are windowed: a fixed row height is what the window arithmetic needs.
 */
const ROW_HEIGHT = 56;
const LIST_HEIGHT = 256;

/** Where the inventory view should scroll once the drawer closes. */
type RevealTarget = {
	inventoryKey: number;
	itemKey: number;
	slotNo: number | null;
};

/**
 * Where the inventory view should scroll to show a just-staged edit: the record
 * the edit names, which for an insertion is the item the save has not placed
 * yet.
 */
const revealFor = (
	edit: QuantityEdit | InsertItemEdit | InsertCatalogItemEdit,
): RevealTarget => ({
	inventoryKey: edit.inventoryKey,
	itemKey: edit.itemKey,
	slotNo: "slotNo" in edit ? edit.slotNo : null,
});

/**
 * Add an item, or grow an existing stack, in one storage location.
 *
 * The drawer owns its own destination, selection and quantity: the page opens
 * it with a suggested storage and gets told what to reveal once an edit is
 * staged. Three outcomes are possible for the chosen item — grow an existing
 * stack, add an item that adds as one on its own, or clone a donor record —
 * and which one applies is decided here, because it depends on what the
 * storage already holds.
 */
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
	/** Storage to preselect; the page passes what is on screen. */
	defaultStorage: number | null;
	storages: { key: number }[];
	/** The save's own records, without staged edits folded in. */
	records: InventoryRecord[];
	catalog: Catalog | null;
	knowledgeMap: ItemKnowledgeMapFile | null;
	edits: SaveEdit[];
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
	setError: Dispatch<SetStateAction<string>>;
	busy: boolean;
	onClose: () => void;
	/** A change was staged: show it in the inventory view. */
	onReveal: (target: {
		inventoryKey: number;
		itemKey: number;
		slotNo: number | null;
	}) => void;
}) => {
	const [storageKey, setStorageKey] = useState<number | null>(defaultStorage);
	const [itemKey, setItemKey] = useState("");
	const [existingSlot, setExistingSlot] = useState<number | null>(null);
	const [quantity, setQuantity] = useState("1");

	// Each opening starts over at the suggested storage. The guard is on the
	// open transition, so staging a change (which reshapes `storages`) does not
	// reset what the user is in the middle of choosing.
	const previousOpen = useRef(false);
	useEffect(() => {
		if (opened === previousOpen.current) return;
		previousOpen.current = opened;
		if (!opened) return;
		setStorageKey(defaultStorage ?? storages[0]?.key ?? null);
		setItemKey("");
		setExistingSlot(null);
		setQuantity("1");
		setError("");
	}, [opened, defaultStorage, storages, setError]);

	const storageItems = useMemo(() => {
		if (storageKey === null) return [];
		return groupRecords(
			records.filter((record) => record.inventoryKey === storageKey),
			catalog,
		);
	}, [storageKey, catalog, records]);

	/** O(1) lookup of what this storage already holds, for the 4,000-row list. */
	const storageItemByKey = useMemo(
		() => new Map(storageItems.map((item) => [item.itemKey, item])),
		[storageItems],
	);

	// The addable set and its name order only change when the catalogs load, so
	// the filter and the sort stay off the drawer-open path.
	const allAddableKeys = useMemo(() => {
		if (!catalog) return [];
		return Object.entries(catalog.items)
			.filter(([, item]) => isAddableItem(item))
			.sort(([, left], [, right]) => left.name.localeCompare(right.name))
			.map(([key]) => key);
	}, [catalog]);

	// An item already staged into this storage is what the engine would refuse a
	// second record of, so the picker does not offer it.
	const stagedKeys = useMemo(
		() => storageKeys({ records, edits, inventoryKey: storageKey }).staged,
		[records, edits, storageKey],
	);

	const addableCatalogKeys = useMemo(
		() =>
			stagedKeys.size === 0
				? allAddableKeys
				: allAddableKeys.filter((key) => !stagedKeys.has(Number(key))),
		[allAddableKeys, stagedKeys],
	);

	// The rows the browser lists. Built once per catalog load, so opening the
	// drawer never re-derives four thousand item types.
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

	const target = itemKey && catalog ? catalog.items[itemKey] : undefined;
	const existingItem = itemKey
		? (storageItems.find((item) => item.itemKey === Number(itemKey)) ?? null)
		: null;
	const existingRecord: InventoryRecord | null =
		existingItem?.recordList.find((record) => record.slotNo === existingSlot) ??
		existingItem?.recordList[0] ??
		null;
	const stagedExistingEdit = existingRecord
		? edits.find(
				(edit): edit is QuantityEdit =>
					edit.type === "quantity" &&
					edit.inventoryKey === existingRecord.inventoryKey &&
					edit.slotNo === existingRecord.slotNo,
			)
		: undefined;
	const existingBaseQuantity =
		stagedExistingEdit?.newQuantity ?? existingRecord?.quantity ?? 0;
	const parsedQuantity = Number(quantity);
	const existingResultQuantity =
		Number.isInteger(parsedQuantity) && parsedQuantity > 0
			? existingBaseQuantity + parsedQuantity
			: null;
	const discoveryKnowledgeKey = itemKey
		? knowledgeMap?.items[itemKey]?.knowledge_keys[0]
		: undefined;
	const noDiscoveryRequired =
		knowledgeMap?.no_discovery_item_keys?.includes(Number(itemKey)) ?? false;

	// A new stack is cloned from a donor record, so the donor has to be an item
	// the storage already holds exactly once, in a stackable form. This is the
	// same donor `planAddition` would clone from, asked here so the button and the
	// warning agree with the plan before it is pressed.
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

	/**
	 * Stages a planned edit or a batch of them. A quantity change replaces any
	 * earlier one for the same record, so staging twice adds to one stack rather
	 * than queueing two additions.
	 */
	const stagePlanned = (
		planned: Array<QuantityEdit | InsertItemEdit | InsertCatalogItemEdit>,
	) => {
		setEdits((current) => {
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
		});
	};

	const stage = () => {
		if (busy) return;
		if (!target || !itemKey) {
			setError("Choose an item to add.");
			return;
		}
		const parsed = Number(quantity);
		if (
			!target.addsAsSingleRecord &&
			(!Number.isInteger(parsed) || parsed < 1 || parsed > 999_999_999)
		) {
			setError("Quantity must be a whole number from 1 to 999,999,999.");
			return;
		}
		const plan = planAddition({
			records,
			catalog,
			edits,
			inventoryKey: storageKey,
			itemKey: Number(itemKey),
			quantity: parsed,
			preferredSlot: existingSlot,
		});
		if ("error" in plan) {
			setError(plan.error);
			return;
		}
		setError("");
		stagePlanned([plan.edit]);
		onReveal(revealFor(plan.edit));
		onClose();
	};

	/**
	 * Stages the mod's cheat set: the ring and Abyss Gears it names, the Axiom
	 * Bracelet its author's sibling mod buffs, and a full set of maxed accessory
	 * and armour slots. Character gear goes through the equipment inserter and
	 * everything else through the same add rule the picker uses, so a preset
	 * cannot stage something the picker would refuse. An item the storage already
	 * holds is left out rather than failing the batch, and only a batch where
	 * nothing at all could be staged reports an error.
	 */
	const stageCheatSet = async () => {
		if (busy || storageKey === null) return;
		const { edits: planned, skipped } = await cheatGearEdits({
			inventoryKey: storageKey,
			records,
			catalog,
			staged: edits,
		});
		if (planned.length === 0) {
			setError(
				skipped.length > 0
					? `Nothing to add: ${skipped
							.map((skip) => `${skip.label} (${skip.reason})`)
							.join("; ")}.`
					: "Nothing to add.",
			);
			return;
		}
		setError("");
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

	const disabled =
		!target ||
		busy ||
		(target.addsAsSingleRecord
			? Boolean(existingItem)
			: existingItem
				? !existingRecord
				: automaticTemplate === null);

	return (
		<Drawer
			opened={opened}
			onClose={onClose}
			position="right"
			size="32rem"
			title={
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
						Add items, tools, props, and non-character gear to the chosen
						storage. Stackable items can also be increased here.
					</Text>
				</Stack>
			}
		>
			<Stack gap="lg">
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

				<Paper withBorder p="sm">
					<Text size="sm" fw={500}>
						THE ONE TRUE RING (mod)
					</Text>
					<Text mt={4} size="xs" c="dimmed">
						Stages the mod's cheat set: the ring and Abyss Gears it names, the
						bracelet its author's Ultimate Axiom mod buffs, and one item for
						every other equipment slot — helm, chest, gloves, boots, cloak,
						necklace, two rings and two earrings — each taken to its own
						refinement and socket ceilings. The buffs live in the game's own
						item data, so they only apply once the mod is installed.
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

				<Box>
					<Text size="xs" fw={500}>
						Choose an item
					</Text>
					<Text mt={4} size="xs" c="dimmed">
						Browse by item type or search by the in-game name or numeric item
						ID.
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
							onSelect={(entry) => {
								setItemKey(entry.key);
								setExistingSlot(
									storageItemByKey.get(Number(entry.key))?.recordList[0]
										?.slotNo ?? null,
								);
							}}
							onFilterChange={() => {
								setItemKey("");
								setExistingSlot(null);
							}}
						/>
					</Box>
				</Box>

				{target && (
					<Paper withBorder p="sm" bg="rgba(0,0,0,0.15)">
						<Group gap="md" wrap="nowrap">
							<Picture kind="item" pictureKey={itemKey} size={64} />
							<Text size="sm" fw={500}>
								{target.name}
							</Text>
						</Group>
						<Text mt={4} size="xs" c="dimmed" lineClamp={3}>
							{target.description ||
								"No current-game description is available."}
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
							setExistingSlot(value === null ? null : Number(value))
						}
					/>
				)}

				<TextInput
					label={existingItem ? "Quantity to add" : "Starting quantity"}
					inputMode="numeric"
					value={target?.addsAsSingleRecord ? "1" : quantity}
					disabled={target?.addsAsSingleRecord}
					onChange={(event) => setQuantity(event.currentTarget.value)}
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
									setQuantity(String(Math.min(999_999_999, base + inc)));
								}}
							>
								+{inc}
							</Button>
						))}
						<Button
							size="xs"
							variant="default"
							onClick={() => setQuantity("999")}
						>
							Set 999
						</Button>
					</Group>
				)}
				{!target?.addsAsSingleRecord && existingItem && existingRecord && (
					<Text size="xs" c="dimmed">
						{existingBaseQuantity.toLocaleString()} currently
						{stagedExistingEdit ? " after staged changes" : ""} →{" "}
						<Text span fw={500} c="var(--mantine-color-text)">
							{existingResultQuantity?.toLocaleString() ?? "—"} after this
							addition
						</Text>
					</Text>
				)}

				{!existingItem && (
					<Stack gap="xs">
						<Alert variant="light" color="teal" p="sm">
							<Text size="xs" c="dimmed">
								This item will be added without replacing or changing anything
								already in this storage.
							</Text>
						</Alert>

						{!automaticTemplate && !target?.addsAsSingleRecord && (
							<Alert variant="light" color="yellow" p="sm">
								<Text size="xs" c="dimmed">
									New items cannot currently be added to this storage location.
								</Text>
							</Alert>
						)}

						{discoveryKnowledgeKey ? (
							<Alert variant="light" color="brand" p="sm">
								<Text size="xs">
									This item’s discovery will be added automatically if you
									haven’t learned it yet.
								</Text>
							</Alert>
						) : noDiscoveryRequired ? (
							<Alert variant="light" color="brand" p="sm">
								<Text size="xs">
									This item has no separate pickup-discovery requirement in the
									game data.
								</Text>
							</Alert>
						) : (
							<Alert variant="light" color="yellow" p="sm">
								<Text size="xs" c="dimmed">
									We do not yet have a verified discovery mapping for this item.
									It may appear as “Unknown” until the game grants its knowledge
									entry.
								</Text>
							</Alert>
						)}
					</Stack>
				)}

				<Button size="md" fullWidth disabled={disabled} onClick={stage}>
					{existingItem ? "Stage quantity addition" : "Stage new item"}
				</Button>
			</Stack>
		</Drawer>
	);
};
