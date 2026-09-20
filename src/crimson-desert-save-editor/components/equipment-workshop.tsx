import {
	Button,
	Checkbox,
	type ComboboxItem,
	Group,
	Select,
	Stack,
	Text,
	TextInput,
} from "@mantine/core";
import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
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
import type {
	AbyssGearRulesFile,
	EquipmentCatalogFile,
} from "@/lib/save-engine/data";
/** The workshop reads the generated equipment catalog as the engine types it. */
export type EquipmentCatalog = EquipmentCatalogFile;
type Catalog = { items: Record<string, AbyssGearCatalogItem> } | null;

/** Gear options carry the effect text so the dropdown can render a rich row. */
type GearOption = ComboboxItem & { effect: string; compatibility: string };

const EMPTY_SOCKET = "empty";
const socketList = (values: (number | null)[]) =>
	Array.from({ length: 5 }, (_, i) => values[i] ?? null);

export const freshEquipmentDetails = (
	item: EquipmentCatalog["items"][string],
): EquipmentDetails => {
	return {
		refinement: 0,
		canRefine: item.canRefine,
		refinementLevels: item.refinementLevels,
		unlockedSockets: item.initialUnlockedSockets,
		socketCap: item.socketCap,
		socketItems: socketList([]),
	};
};

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
	const [sockets, setSockets] = useState(
		socketList(staged?.socketItems ?? original.socketItems),
	);
	const [search, setSearch] = useState("");
	const [showIncompatible, setShowIncompatible] = useState(false);
	const socketDescriptionId = useId();
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
	const gear = allGear.filter(
		([key, item]) =>
			(showIncompatible || fits(key)) &&
			`${item.name} ${item.effect} ${key}`
				.toLowerCase()
				.includes(search.toLowerCase()),
	);
	const cap = original.socketCap;
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
		<Stack gap="lg">
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
						disabled={!original.canRefine || busy}
						onChange={(value) => value !== null && setRefinement(Number(value))}
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
						onChange={(value) => {
							if (value === null) return;
							const count = Number(value);
							setUnlocked(count);
							setSockets((current) =>
								current.map((key, i) =>
									i < count ? key : (originalSockets[i] ?? null),
								),
							);
						}}
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

			{unlocked > 0 && (
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
						onChange={(event) =>
							setShowIncompatible(event.currentTarget.checked)
						}
					/>
					<TextInput
						aria-label="Search Abyss Gear"
						placeholder="Search Abyss Gear or effects"
						value={search}
						leftSection={<Search size={16} />}
						onChange={(event) => setSearch(event.currentTarget.value)}
					/>
					<Text size="sm" c="dimmed">
						{gear.length} matching Abyss Gear
					</Text>
					{!gear.length && (
						<Text size="sm" c="dimmed">
							No matching Abyss Gear. Try another search or show incompatible
							gear to check its restrictions.
						</Text>
					)}
					{Array.from({ length: Math.min(unlocked, 5) }, (_, i) => {
						const selected = sockets[i];
						const selectedGear = allGear.find(
							([key]) => Number(key) === selected,
						)?.[1];
						const descriptionId = `${socketDescriptionId}-${i}`;
						const options = gear.filter(
							([key]) =>
								!sockets.some(
									(value, index) => index !== i && value === Number(key),
								),
						);
						if (
							selected &&
							!options.some(([key]) => Number(key) === selected)
						) {
							options.unshift([
								String(selected),
								selectedGear ?? {
									name:
										catalog?.items[String(selected)]?.name ??
										`Item ${selected}`,
									effect: "Effect description unavailable.",
								},
							]);
						}
						const data: GearOption[] = options.map(([key, item]) => ({
							value: key,
							label: item.name,
							disabled: !fits(key),
							effect: item.effect,
							compatibility: gearCompatibilityLabel(compatibility, key),
						}));
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: socket slots are positional; the index is the socket number.
							<div key={i}>
								<Text size="sm" fw={500}>
									Socket {i + 1}
								</Text>
								<Select
									mt={4}
									value={selected ? String(selected) : EMPTY_SOCKET}
									data={
										originalSockets[i]
											? data
											: [{ value: EMPTY_SOCKET, label: "Empty" }, ...data]
									}
									allowDeselect={false}
									disabled={cap === null || i >= cap || busy}
									leftSection={
										selected ? (
											<Picture kind="item" pictureKey={selected} size={22} />
										) : null
									}
									onChange={(value) =>
										value !== null &&
										setSockets((current) =>
											current.map((key, index) =>
												index === i
													? value === EMPTY_SOCKET
														? null
														: Number(value)
													: key,
											),
										)
									}
									aria-label={`Socket ${i + 1} Abyss Gear`}
									aria-describedby={selected ? descriptionId : undefined}
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
													<Text
														size="xs"
														c="dimmed"
														style={{ whiteSpace: "normal" }}
													>
														{item.effect}
													</Text>
													<Text
														size="xs"
														c="dimmed"
														style={{ whiteSpace: "normal" }}
													>
														{item.compatibility}
														{!fits(item.value)
															? ` · Cannot use on ${name}`
															: ""}
													</Text>
												</div>
											</Group>
										);
									}}
								/>
								{selected && (
									<Text
										id={descriptionId}
										mt="xs"
										size="sm"
										c="dimmed"
										aria-live="polite"
									>
										{selectedGear?.effect ?? "Effect description unavailable."}
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
					})}
				</Stack>
			)}

			<Button
				fullWidth
				disabled={(!changed && !adding) || invalidSockets || busy}
				onClick={() =>
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
			>
				{submitLabel ?? "Stage equipment changes"}
			</Button>
			{maxed && (
				<Button
					variant="default"
					fullWidth
					disabled={busy}
					title="Take this item to the refinement and sockets it allows, and give each socket the strongest Abyss Gear that fits."
					onClick={() => onStage(maxed)}
				>
					Max this item
				</Button>
			)}
			{staged && onRemove && (
				<Button
					variant="default"
					fullWidth
					disabled={busy}
					onClick={() => {
						setRefinement(original.refinement);
						setUnlocked(original.unlockedSockets);
						setSockets(originalSockets);
						onRemove();
					}}
				>
					{adding ? "Discard equipment addition" : "Discard equipment changes"}
				</Button>
			)}
			<Text size="sm" c="dimmed">
				{adding
					? "Download edited adds this item with your chosen refinement, sockets, and Abyss Gear."
					: "Download edited creates the new save. Dyes are preserved."}
			</Text>
		</Stack>
	);
};
