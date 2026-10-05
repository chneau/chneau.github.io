import {
	ActionIcon,
	Button,
	Checkbox,
	type ComboboxItem,
	Group,
	Select,
	Stack,
	Text,
	TextInput,
} from "@mantine/core";
import { Search, Sparkles, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { EMPTY_SOCKET, socketList } from "@/components/equipment-details";
import { Picture } from "@/components/picture";
import {
	type AbyssGearCatalogItem,
	abyssGearOptions,
	canSocketGear,
	gearCompatibilityLabel,
} from "@/lib/abyss-gear";
import type { EquipmentDetails, EquipmentEdit } from "@/lib/equipment";
import compatibility from "@/lib/generated/abyss-gear-compatibility.json";
import type { InventoryRecord } from "@/lib/inventory";
import { maxEquipmentEdits } from "@/lib/max-equipment";
import type { AbyssGearRulesFile } from "@/lib/save-engine/data";

type Catalog = { items: Record<string, AbyssGearCatalogItem> } | null;

/** One entry of `abyssGearOptions`: a gear key and the gear it names. */
type GearEntry = ReturnType<typeof abyssGearOptions>[number];

/** Gear options carry the effect text so the dropdown can render a rich row. */
type GearOption = ComboboxItem & { effect: string; compatibility: string };

/**
 * The sockets this item has open, named by their position in the record's
 * socket array.
 *
 * The editor addresses a socket by that position throughout — `sockets[n]` is
 * what sits in it, `setSockets` writes back to the same `n`, and the capped
 * rows are `n >= cap` — so the position *is* the socket's identity, not an
 * accident of the order the rows happen to render in. Naming it before the
 * rows are built is what lets a row be keyed on which socket it edits; the
 * alternative, taking the `.map()` index, reads as incidental and is wrong for
 * the row below: a socket only ever opens from the front, and a row keyed on
 * render order would hand the open row the `Select` state of the closed one.
 */
const openSocketSlots = (unlocked: number): number[] =>
	Array.from({ length: Math.min(unlocked, 5) }, (_, slot) => slot);

/**
 * One socket's dropdown: the gear it holds, and what that gear does.
 *
 * A socket is the unit the editor repeats itself over — up to five, each the
 * same select-plus-description differing only in which socket it edits — and
 * naming it is also what lets its option list live beside it: what one socket
 * may offer depends on what the other four hold, so it cannot be one list the
 * parent computes once and hands down.
 */
const SocketSelect = ({
	slot,
	name,
	selected,
	options,
	heldGear,
	emptyFirst,
	cap,
	busy,
	fits,
	descriptionId,
	onChange,
}: {
	slot: number;
	name: string;
	/** The gear key that sits in this socket, or `null` for an empty one. */
	selected: number | null;
	/** The gear this socket may choose from, minus what the other sockets hold. */
	options: GearEntry[];
	/** The catalog entry for the held gear, even once the search hid it. */
	heldGear: GearEntry[1] | undefined;
	/** The save's own socket was empty, so "Empty" is offered first. */
	emptyFirst: boolean;
	cap: number | null;
	busy: boolean;
	fits: (key: number | string) => boolean;
	/** The id of this socket's effect text, so the Select can describe itself. */
	descriptionId: string;
	onChange: (value: string | null) => void;
}) => {
	const data: GearOption[] = options.map(([key, item]) => ({
		value: key,
		label: item.name,
		disabled: !fits(key),
		effect: item.effect,
		compatibility: gearCompatibilityLabel(compatibility, key),
	}));
	return (
		<div>
			<Text size="sm" fw={500}>
				Socket {slot + 1}
			</Text>
			<Select
				mt={4}
				value={selected === null ? EMPTY_SOCKET : String(selected)}
				data={
					emptyFirst ? [{ value: EMPTY_SOCKET, label: "Empty" }, ...data] : data
				}
				allowDeselect={false}
				disabled={cap === null || slot >= (cap ?? 0) || busy}
				leftSection={
					selected === null ? null : (
						<Picture kind="item" pictureKey={selected} size={22} />
					)
				}
				onChange={onChange}
				aria-label={`Socket ${slot + 1} Abyss Gear`}
				aria-describedby={selected === null ? undefined : descriptionId}
				nothingFoundMessage="No matching Abyss Gear"
				maxDropdownHeight={320}
				renderOption={({ option }) => {
					const item = option as GearOption;
					return (
						<Group gap="sm" wrap="nowrap" align="flex-start">
							<Picture kind="item" pictureKey={item.value} />
							<div style={{ minWidth: 0 }}>
								<Text size="sm" fw={500}>
									{item.label}
								</Text>
								<Text size="xs" c="dimmed" style={{ whiteSpace: "normal" }}>
									{item.effect}
								</Text>
								<Text size="xs" c="dimmed" style={{ whiteSpace: "normal" }}>
									{item.compatibility}
									{!fits(item.value) ? ` · Cannot use on ${name}` : ""}
								</Text>
							</div>
						</Group>
					);
				}}
			/>
			{selected !== null && (
				<Text
					id={descriptionId}
					mt="xs"
					size="sm"
					c="dimmed"
					aria-live="polite"
				>
					{heldGear?.effect ?? "Effect description unavailable."}
					<span style={{ display: "block", marginTop: 4 }}>
						{gearCompatibilityLabel(compatibility, selected)}
					</span>
					{!fits(selected) && (
						<span
							style={{
								display: "block",
								marginTop: 4,
								color: "var(--mantine-color-error)",
							}}
						>
							This gear cannot be used on {name}. Choose a compatible
							replacement.
						</span>
					)}
				</Text>
			)}
		</div>
	);
};

/**
 * The Abyss Gear section: the search, the compatibility filter, and one
 * dropdown per open socket.
 *
 * Its own component because it owns the only two inputs the editor has that
 * nothing outside it reads — the search text and the "show incompatible" toggle
 * — so holding them here is what lets a keystroke in the gear search re-render
 * the gear list rather than the refinement field and the action buttons beside
 * it.
 */
const AbyssGearSection = ({
	name,
	sockets,
	originalSockets,
	allGear,
	catalog,
	cap,
	busy,
	unlocked,
	fits,
	onSocketsChange,
}: {
	name: string;
	sockets: (number | null)[];
	/** The save's own sockets: an originally-empty one offers "Empty" first. */
	originalSockets: (number | null)[];
	allGear: GearEntry[];
	catalog: Catalog;
	cap: number | null;
	busy: boolean;
	unlocked: number;
	fits: (key: number | string) => boolean;
	onSocketsChange: (slot: number, value: number | null) => void;
}) => {
	const [search, setSearch] = useState("");
	const [showIncompatible, setShowIncompatible] = useState(false);
	const socketDescriptionId = useId();
	const gear = allGear.filter(
		([key, item]) =>
			(showIncompatible || fits(key)) &&
			`${item.name} ${item.effect} ${key}`
				.toLowerCase()
				.includes(search.toLowerCase()),
	);
	return (
		<Stack gap="md">
			<Text size="sm" c="dimmed">
				{showIncompatible
					? `Only gear compatible with ${name} can be selected.`
					: `Showing Abyss Gear compatible with ${name}.`}
			</Text>
			<Checkbox
				label="Show incompatible gear (unavailable)"
				checked={showIncompatible}
				disabled={busy}
				onChange={(event) => setShowIncompatible(event.currentTarget.checked)}
			/>
			<TextInput
				aria-label="Search Abyss Gear"
				placeholder="Search Abyss Gear or effects"
				value={search}
				leftSection={<Search size={16} />}
				rightSection={
					search ? (
						<ActionIcon
							size="xs"
							variant="subtle"
							color="gray"
							onClick={() => setSearch("")}
							title="Clear search"
							aria-label="Clear search"
						>
							<X size={14} />
						</ActionIcon>
					) : null
				}
				onChange={(event) => setSearch(event.currentTarget.value)}
			/>
			<Text size="sm" c="dimmed">
				{gear.length} matching Abyss Gear
			</Text>
			{!gear.length && (
				<Text size="sm" c="dimmed">
					No matching Abyss Gear. Try another search or show incompatible gear
					to check its restrictions.
				</Text>
			)}
			{openSocketSlots(unlocked).map((slot) => {
				const selected = sockets[slot] ?? null;
				const heldGear = allGear.find(([key]) => Number(key) === selected)?.[1];
				const options = gear.filter(
					([key]) =>
						!sockets.some(
							(value, index) => index !== slot && value === Number(key),
						),
				);
				if (
					selected !== null &&
					!options.some(([key]) => Number(key) === selected)
				) {
					// The search filtered out what is actually in this socket, but the
					// dropdown still has to offer it — otherwise a narrowed list makes
					// the socket read as empty when it is not, and emptying it from here
					// becomes impossible.
					options.unshift([
						String(selected),
						heldGear ?? {
							name:
								catalog?.items[String(selected)]?.name ?? `Item ${selected}`,
							effect: "Effect description unavailable.",
						},
					]);
				}
				return (
					<SocketSelect
						key={`socket-${slot}`}
						slot={slot}
						name={name}
						selected={selected}
						options={options}
						heldGear={heldGear}
						emptyFirst={!originalSockets[slot]}
						cap={cap}
						busy={busy}
						fits={fits}
						descriptionId={`${socketDescriptionId}-${slot}`}
						onChange={(value) =>
							onSocketsChange(
								slot,
								value === null || value === EMPTY_SOCKET ? null : Number(value),
							)
						}
					/>
				);
			})}
		</Stack>
	);
};

/**
 * The refinement level and the socket count: the two ceilings an equipment edit
 * is held to, and the two fields the editor opens with.
 *
 * They are one seam because the socket count's handler also rewrites the socket
 * array — closing a socket puts the save's own gear back into it rather than
 * discarding it, so re-opening one is not a loss — and that rule belongs with
 * the field that triggers it.
 */
const RefinementAndSockets = ({
	original,
	refinement,
	unlocked,
	cap,
	adding,
	busy,
	onRefinement,
	onUnlocked,
}: {
	/** The record's own equipment: the ceilings this item is held to. */
	original: EquipmentDetails;
	refinement: number;
	unlocked: number;
	cap: number | null;
	adding: boolean;
	busy: boolean;
	onRefinement: (level: number) => void;
	onUnlocked: (count: number) => void;
}) => {
	const refinementData = original.refinementLevels.map((level) => ({
		value: String(level),
		label: `Level ${level}`,
	}));
	const unlockedData = Array.from(
		{
			length:
				Math.max(original.unlockedSockets, cap ?? 0) -
				original.unlockedSockets +
				1,
		},
		(_, index) => index + original.unlockedSockets,
	).map((count) => ({
		value: String(count),
		label: `${count}${cap !== null ? ` of ${cap}` : ""}`,
	}));
	return (
		<>
			<div>
				<Text size="sm" fw={500}>
					Refinement
				</Text>
				{original.canRefine ? (
					<Select
						mt="xs"
						value={String(refinement)}
						data={refinementData}
						allowDeselect={false}
						disabled={busy}
						onChange={(value) => value !== null && onRefinement(Number(value))}
						aria-label="Refinement level"
					/>
				) : (
					<Text mt="xs" size="sm" c="dimmed">
						This item cannot be refined.
					</Text>
				)}
			</div>

			{cap !== 0 && (
				<div>
					<Text size="sm" fw={500}>
						Unlocked sockets
					</Text>
					<Select
						mt="xs"
						value={String(unlocked)}
						data={unlockedData}
						allowDeselect={false}
						disabled={cap === null || cap < original.unlockedSockets || busy}
						onChange={(value) => value !== null && onUnlocked(Number(value))}
						aria-label="Unlocked sockets"
					/>
					<Text mt="xs" size="sm" c="dimmed">
						{cap === null
							? "This equipment’s socket limit is not known, so socket edits are unavailable."
							: adding
								? "Choose the unlocked sockets and Abyss Gear for the new item."
								: "Sockets can be unlocked. Filled sockets can be replaced; removal is not yet supported."}
					</Text>
				</div>
			)}

			{cap === 0 && (
				<Text size="sm" c="dimmed">
					This item does not have Abyss Gear sockets.
				</Text>
			)}
		</>
	);
};

/**
 * What the editor ends with: stage the change, stage the maxed plan instead, or
 * undo a stage — and the line saying what a download will do.
 *
 * Its own component because each button carries a condition about what the save
 * already holds (is there a maxed plan? is anything staged that can be removed?)
 * and those three conditions are the editor's whole tail otherwise.
 */
const EditorFooter = ({
	changed,
	adding,
	invalidSockets,
	busy,
	removable,
	maxed,
	submitLabel,
	onStage,
	onStageMaxed,
	onRemove,
}: {
	changed: boolean;
	adding: boolean;
	/** A socket holds gear this item cannot wear, so staging it would be wrong. */
	invalidSockets: boolean;
	busy: boolean;
	removable: boolean;
	/** What "max" would make of this item, when maxing is possible at all. */
	maxed: EquipmentEdit | null;
	submitLabel: string | undefined;
	onStage: () => void;
	onStageMaxed: () => void;
	onRemove: () => void;
}) => (
	<>
		<Button
			fullWidth
			disabled={(!changed && !adding) || invalidSockets || busy}
			onClick={onStage}
		>
			{submitLabel ?? "Stage equipment changes"}
		</Button>
		{maxed && (
			<Button
				variant="default"
				fullWidth
				disabled={busy}
				title="Take this item to the refinement and sockets it allows, and give each socket the strongest Abyss Gear that fits."
				onClick={onStageMaxed}
			>
				Max this item
			</Button>
		)}
		{removable && (
			<Button variant="default" fullWidth disabled={busy} onClick={onRemove}>
				{adding ? "Remove equipment addition" : "Remove equipment changes"}
			</Button>
		)}
		<Text size="sm" c="dimmed">
			{adding
				? "Download save adds this item with your chosen refinement, sockets, and Abyss Gear."
				: "Download save creates the new save. Dyes are preserved."}
		</Text>
	</>
);

export const EquipmentEditor = ({
	record,
	name,
	catalog,
	staged,
	busy,
	onStage,
	onRemove,
	rules,
	savedRecord,
	adding = false,
	submitLabel,
}: {
	record: {
		inventoryKey: number;
		slotNo: number;
		itemKey: number;
		equipment: EquipmentDetails;
	};
	name: string;
	catalog: Catalog;
	staged?: EquipmentEdit;
	busy: boolean;
	onStage: (edit: EquipmentEdit) => void;
	onRemove?: () => void;
	/** Abyss Gear rules, so the item can be maxed from here. */
	rules?: AbyssGearRulesFile;
	/** The save's own record, for the maxable preview. Defaults to `record`. */
	savedRecord?: InventoryRecord;
	adding?: boolean;
	submitLabel?: string;
}) => {
	const original = record.equipment;
	const [refinement, setRefinement] = useState(
		staged?.refinement ?? original.refinement,
	);
	const [unlocked, setUnlocked] = useState(
		staged?.unlockedSockets ?? original.unlockedSockets,
	);
	// Lazy: `socketList` walks the whole socket array, and the value is only
	// ever read on the first render — recomputing it on every later one is work
	// thrown away.
	const [sockets, setSockets] = useState(() =>
		socketList(staged?.socketItems ?? original.socketItems),
	);
	const originalSockets = socketList(original.socketItems);
	/**
	 * What "max" would make of this one item, computed from the save's record so
	 * it matches what the storage-wide button stages — not from the drafts in
	 * the form, which the user may be halfway through changing.
	 */
	const maxed = useMemo(() => {
		if (!rules) return null;
		// `maxEquipmentEdits` reads whole records; the editor only holds the
		// fields this item needs, so the rest of the envelope is filled in with
		// values the planner never looks at.
		const source: InventoryRecord = savedRecord ?? {
			...record,
			itemNo: 0,
			quantity: 1,
			socketCount: original.unlockedSockets,
			filledSockets: original.socketItems.filter((key) => key !== null).length,
		};
		const { edits } = maxEquipmentEdits({
			records: [source],
			inventoryKey: record.inventoryKey,
			rules,
			itemNameFor: () => name,
		});
		return edits[0] ?? null;
	}, [rules, savedRecord, record, name, original]);
	const changed =
		refinement !== original.refinement ||
		unlocked !== original.unlockedSockets ||
		sockets.some((key, i) => key !== originalSockets[i]);
	const allGear = useMemo(
		() => abyssGearOptions(catalog?.items ?? {}),
		[catalog],
	);
	const fits = (key: number | string) =>
		canSocketGear(compatibility, record.itemKey, key);
	const invalidSockets = sockets.some((key) => key !== null && !fits(key));
	const cap = original.socketCap;

	return (
		<Stack gap="lg">
			{maxed && (
				<Button
					variant="light"
					color="brand"
					size="xs"
					leftSection={<Sparkles size={14} />}
					disabled={busy}
					onClick={() => {
						setRefinement(maxed.refinement);
						setUnlocked(maxed.unlockedSockets);
						setSockets(socketList(maxed.socketItems));
					}}
				>
					⚡ Max Out This Item (Refinement & Best Abyss Gear)
				</Button>
			)}

			<RefinementAndSockets
				original={original}
				refinement={refinement}
				unlocked={unlocked}
				cap={cap}
				adding={adding}
				busy={busy}
				onRefinement={setRefinement}
				onUnlocked={(count) => {
					setUnlocked(count);
					// Closing a socket hands the save's own gear back to it rather
					// than dropping it, so re-opening the socket is not a loss.
					setSockets((current) =>
						current.map((key, i) =>
							i < count ? key : (originalSockets[i] ?? null),
						),
					);
				}}
			/>

			{unlocked > 0 && (
				<AbyssGearSection
					name={name}
					sockets={sockets}
					originalSockets={originalSockets}
					allGear={allGear}
					catalog={catalog}
					cap={cap}
					busy={busy}
					unlocked={unlocked}
					fits={fits}
					onSocketsChange={(slot, value) =>
						setSockets((current) =>
							current.map((key, index) => (index === slot ? value : key)),
						)
					}
				/>
			)}

			<EditorFooter
				changed={changed}
				adding={adding}
				invalidSockets={invalidSockets}
				busy={busy}
				removable={Boolean(staged && onRemove)}
				maxed={maxed}
				submitLabel={submitLabel}
				onStage={() =>
					onStage({
						type: "equipment",
						inventoryKey: record.inventoryKey,
						slotNo: record.slotNo,
						itemKey: record.itemKey,
						itemName: name,
						refinement,
						unlockedSockets: unlocked,
						socketItems: sockets,
					})
				}
				onStageMaxed={() => {
					if (maxed) onStage(maxed);
				}}
				onRemove={() => {
					if (!onRemove) return;
					// Undoing a stage also puts the form back where the save is, so
					// the editor is not left holding values nothing will write.
					setRefinement(original.refinement);
					setUnlocked(original.unlockedSockets);
					setSockets(originalSockets);
					onRemove();
				}}
			/>
		</Stack>
	);
};
