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
import {
	CatalogBrowser,
	type CatalogEntry,
} from "@/components/catalog-browser";
import { Picture } from "@/components/picture";
import { planAddition, storageKeys } from "@/lib/add-plan";
import { cheatGearEdits, cheatGearSet } from "@/lib/cheat-gear";
import {
	type Catalog,
	type CatalogItem,
	type GroupedItem,
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

/**
 * Fold a planned batch into the staged edits.
 *
 * A quantity change replaces any earlier one for the same record, so staging
 * twice adds to one stack rather than queueing two additions. Only quantity
 * edits are keyed this way: an insertion names an item and a location, and the
 * planner already refuses a second one of those.
 */
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

/**
 * Why this quantity cannot be staged for this item, or `null` when it can.
 *
 * An item the game adds as a single record has no quantity of its own — the
 * field is disabled and shows one — so the range check does not apply to it,
 * and applying it there would refuse an addition the engine accepts.
 */
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

/**
 * The staged quantity edit for one record, if the user has already touched it.
 *
 * The "currently N" line below the quantity field has to start from the user's
 * own earlier change rather than the save's stored figure, or staging twice
 * would report a result that ignores the first one.
 */
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
 * The mod's cheat set: one press that stages the ring, the Abyss Gears and the
 * accessory and armour slots its author named.
 *
 * Its own component because it is the drawer's only asynchronous action and it
 * owns its own failure reporting — a preset that could add nothing says so
 * here, where the reader is looking, rather than pushing an error to the page
 * behind the open drawer.
 */
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

/**
 * The quantity to add, the quick-increment buttons beside it, and what the
 * stack will hold afterwards.
 *
 * One component because the three only make sense together — "+100" is a
 * shortcut for the field next to it, and the "after this addition" line is
 * about that field's value — and because the whole block disappears for an item
 * the game adds as a single record, which has no quantity of its own.
 */
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
	/** A quantity edit is already staged for this record, if one is. */
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

/**
 * What the drawer can tell you about an item this storage does not hold yet:
 * that nothing existing is touched, whether this location can take the item at
 * all, and what will happen to its discovery entry.
 *
 * The three alerts are one block because they are one decision — can this be
 * added, and what will change — and the discovery alert has three cases of its
 * own, which is the part worth naming.
 */
const AdditionNotices = ({
	hasTemplate,
	singleRecord,
	discoveryKnowledgeKey,
	noDiscoveryRequired,
}: {
	/** A donor record exists, so the engine can clone a new stack. */
	hasTemplate: boolean;
	singleRecord: boolean;
	/** The item has a discovery entry in the game data. */
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

/**
 * The drawer's own title: what kind of edit this is, and what it can do.
 *
 * Its own component so the drawer's body is the form rather than the form plus
 * the heading above it.
 */
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

/**
 * What the drawer knows about the chosen item: what it is, whether this storage
 * already holds it, and — when it holds more than one copy — which copy the
 * addition should go to.
 *
 * One block because the three are the same question asked in three parts: is
 * this a new item or an existing stack? The stack chooser is here rather than
 * beside the quantity field because it decides *which* stack the quantity field
 * is talking about, so a reader needs them together.
 */
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

/**
 * Whether the drawer can stage what it currently shows.
 *
 * Three different failures are folded into one flag because the button has a
 * single disabled state, and the rule is worth naming on its own: an item the
 * game adds as a single record may not be added twice to the same storage, a
 * stack needs a record to grow, and a new item needs a donor to clone.
 */
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

/**
 * The record an addition would grow: the chosen copy of an existing stack, or
 * the first copy when the storage holds only one.
 */
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

/**
 * What the chosen item means for the chosen storage.
 *
 * These six answers are one question asked six ways — is this a brand-new item,
 * an existing stack, and if a stack, which copy and how many — and the rest of
 * the drawer reads them together: the button's disabled state, the summary, the
 * quantity line and the notices all branch on the same picture. Deriving them in
 * one place is what keeps those branches from each re-deriving the item and
 * disagreeing with the next.
 */
type Selection = {
	target: CatalogItem | undefined;
	existingItem: GroupedItem | null;
	existingRecord: InventoryRecord | null;
	/** A quantity edit already staged for `existingRecord`. */
	stagedEdit: QuantityEdit | undefined;
	/** The stack's quantity, counting the user's own staged change. */
	baseQuantity: number;
	/** What the stack will hold after this addition, or `null` if unknowable. */
	resultQuantity: number | null;
	/** The item's discovery key in the game data, if it has one. */
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

/**
 * The item picker: every addable item in the game, searchable by name or id.
 *
 * Its own component because building the four-thousand-row list is the drawer's
 * most expensive derivation and nothing outside the picker reads the result: the
 * drawer's own work starts from the chosen `itemKey`. Keeping the memos here is
 * also what keeps a keystroke in the picker's search box from re-deriving them.
 */
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
	/** What the chosen storage already holds, grouped by item key. */
	storageItems: GroupedItem[];
	/** Item keys already staged into this storage. */
	stagedKeys: Set<number>;
	itemKey: string;
	/** An item was chosen; `slotNo` is the stack a later add should grow. */
	onSelect: (itemKey: string, slotNo: number | null) => void;
	onFilterChange: () => void;
}) => {
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
	// Lazy, so the first render already lands on a usable storage: the prop is
	// read once here and the fallback below is the same one the open transition
	// would apply a frame later.
	const [storageKey, setStorageKey] = useState<number | null>(
		() => defaultStorage ?? storages[0]?.key ?? null,
	);
	const [itemKey, setItemKey] = useState("");
	const [existingSlot, setExistingSlot] = useState<number | null>(null);
	const [quantity, setQuantity] = useState("1");
	/**
	 * Errors the drawer itself produced. They are shown inline rather than
	 * pushed to the page, where the open drawer would hide them.
	 */
	const [localError, setLocalError] = useState("");

	// Each opening starts over at the suggested storage. Guarded on the open
	// transition, so staging a change (which reshapes `storages`) does not reset
	// what the user is in the middle of choosing. Done while rendering rather
	// than in an effect, because an effect runs after the browser has already
	// painted the drawer with the previous session's item and quantity.
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

	// The page's error banner sits behind the open drawer, so opening clears it.
	// That state belongs to the page, and a render must not write to another
	// component, so this one write stays in an effect.
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

	// An item already staged into this storage is what the engine would refuse a
	// second record of, so the picker does not offer it.
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
