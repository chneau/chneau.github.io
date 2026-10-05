import {
	Alert,
	Badge,
	Box,
	Button,
	Group,
	Paper,
	ScrollArea,
	Select,
	Stack,
	Table,
	Text,
} from "@mantine/core";
import { Paintbrush, TriangleAlert, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { type DyeChannels, EMPTY_CHANNELS } from "@/components/dye-channels";
import { DyePartRow } from "@/components/dye-part-row";
import type { DyeDescription, DyedItem, DyeSlot } from "@/lib/save-engine/dyes";
import type { DyeEdit } from "@/lib/staged-edits";

type PanelProps = {
	description?: DyeDescription;
	edits: DyeEdit[];
	busy: boolean;
	error: string;
	onStage: (edits: DyeEdit[]) => void;
};

/**
 * The fallback for a save that has no dyed equipment.
 *
 * Module-level because the memo below depends on this list, and an inline
 * `?? []` is a fresh array on every render — which would make the memo
 * recompute on every keystroke for exactly the case where there is nothing to
 * pick. Nothing mutates it; the panel only finds in it and reads its first
 * entry.
 */
const NO_ITEMS: readonly DyedItem[] = [];

/** The value the save holds for one channel of one part. */
const storedChannel = (
	slot: DyeSlot | undefined,
	name: keyof DyeChannels,
): number | null => {
	const channel = slot
		? {
				red: slot.red,
				green: slot.green,
				blue: slot.blue,
				alpha: slot.alpha,
				grime: slot.grime,
				colorGroup: slot.colorGroup,
				material: slot.material,
			}[name]
		: null;
	return channel?.value ?? null;
};

const sameItem = (edit: DyeEdit, item: DyedItem): boolean =>
	edit.itemNo === item.itemNo && edit.slotNo === item.slotNo;

/**
 * The staged whole-item change for `item`, if one is queued.
 *
 * A change with `slotIndices: null` applies to every part, which is what makes
 * the "All parts" button and the warning under the table the same fact seen
 * twice.
 */
const bulkEditFor = (edits: DyeEdit[], item: DyedItem): DyeEdit | undefined =>
	edits.find(
		(candidate) => sameItem(candidate, item) && candidate.slotIndices === null,
	);

/** The staged change for exactly one part of `item`. */
const partEditFor = (
	edits: DyeEdit[],
	item: DyedItem,
	index: number,
): DyeEdit | undefined =>
	edits.find(
		(candidate) =>
			sameItem(candidate, item) &&
			candidate.slotIndices?.length === 1 &&
			candidate.slotIndices[0] === index,
	);

/** Every staged channel for one part, as the row reads them. */
const channelsOf = (
	edits: DyeEdit[],
	item: DyedItem,
	index: number,
): DyeChannels => {
	const edit = partEditFor(edits, item, index);
	return edit
		? {
				red: edit.red,
				green: edit.green,
				blue: edit.blue,
				alpha: edit.alpha,
				grime: edit.grime,
				colorGroup: edit.colorGroup,
				material: edit.material,
			}
		: EMPTY_CHANNELS;
};

/**
 * Equipment dyeing, part by part.
 *
 * Only gear that has been dyed in-game carries dye rows, and each row stores
 * only the channels that part actually uses — a part that tints without a
 * material has no material to change. Channels the save does not store show as
 * "not stored" and cannot be set: writing one means restructuring a record
 * nested inside the equipment block, which this editor will not do to a save it
 * cannot test in-game. Dye the item once in-game and it becomes editable here.
 */
export const DyesPanel = ({
	description,
	edits,
	busy,
	error,
	onStage,
}: PanelProps) => {
	const [picked, setPicked] = useState<string | null>(null);
	const items = description?.items ?? NO_ITEMS;
	/**
	 * The chosen item falls back to the first one, so the panel opens on real
	 * dye rows rather than an empty table that fills in after a render.
	 */
	const item = useMemo(
		() =>
			items.find((candidate) => `${candidate.itemNo}` === picked) ??
			items[0] ??
			null,
		[items, picked],
	);
	const selected = item ? `${item.itemNo}` : null;

	const stagePart = (index: number, patch: Partial<DyeChannels>) => {
		if (!item) return;
		const slot = item.slots[index];
		// A channel set back to the value the save already holds is dropped: the
		// applier refuses an edit that changes nothing, and one redundant
		// keystroke should not fail the whole download.
		const normalized: Partial<DyeChannels> = {};
		for (const [key, value] of Object.entries(patch)) {
			const name = key as keyof DyeChannels;
			normalized[name] = value === storedChannel(slot, name) ? null : value;
		}
		const current = {
			...EMPTY_CHANNELS,
			...channelsOf(edits, item, index),
			...normalized,
		};
		// The whole-item change goes first, then every part change that is not
		// this one, so a part edited afterwards wins over its own item's bulk edit.
		const others = edits.filter(
			(candidate) =>
				!sameItem(candidate, item) ||
				(candidate.slotIndices !== null && candidate.slotIndices[0] !== index),
		);
		const bulk = others.filter((candidate) => candidate.slotIndices === null);
		const singles = others.filter(
			(candidate) => candidate.slotIndices !== null,
		);
		onStage([
			...bulk,
			...singles,
			{
				type: "dye",
				itemNo: item.itemNo,
				itemKey: item.itemKey,
				slotNo: item.slotNo,
				slotIndices: [index],
				label: `${item.name} · part ${index + 1}`,
				...current,
			},
		]);
	};

	const stageAllParts = (slot: DyeSlot) => {
		if (!item) return;
		onStage([
			...edits.filter((candidate) => !sameItem(candidate, item)),
			{
				type: "dye",
				itemNo: item.itemNo,
				itemKey: item.itemKey,
				slotNo: item.slotNo,
				slotIndices: null,
				label: `${item.name} · every part like part ${slot.index + 1}`,
				red: slot.red?.value ?? null,
				green: slot.green?.value ?? null,
				blue: slot.blue?.value ?? null,
				alpha: slot.alpha?.value ?? null,
				grime: slot.grime?.value ?? null,
				colorGroup: slot.colorGroup?.value ?? null,
				material: slot.material?.value ?? null,
			},
		]);
	};

	if (description?.error) {
		return (
			<Stack component="section" gap="lg" p="md" style={{ flex: 1 }}>
				<Alert color="yellow" title="Dye editing unavailable">
					{description.error}
				</Alert>
			</Stack>
		);
	}

	const bulkEdit = item ? bulkEditFor(edits, item) : undefined;

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
					title="Could not apply dye changes"
				>
					{error}
				</Alert>
			)}

			<Group justify="space-between" gap="md" align="flex-start">
				<Box>
					<Group gap="xs">
						<Paintbrush size={18} color="var(--mantine-primary-color-filled)" />
						<Text component="h2" size="xl" fw={600}>
							Dye colours
						</Text>
					</Group>
					<Text mt={4} size="sm" c="dimmed">
						Recolour any part of the gear you have already dyed. Parts keep
						whichever channels the game stored for them.
					</Text>
				</Box>
				{description && (
					<Text size="sm" c="dimmed" ta="right">
						{items.length} dyed item{items.length === 1 ? "" : "s"}
					</Text>
				)}
			</Group>

			{items.length === 0 ? (
				<Alert color="yellow" title="Nothing is dyed yet">
					An item appears here once it has been dyed in-game. Dye anything —
					even a single part — then save and reopen it.
				</Alert>
			) : (
				<Group align="flex-end" gap="md">
					<Select
						w="100%"
						style={{ flex: 1, maxWidth: "26rem" }}
						label="Equipped item"
						value={selected}
						allowDeselect={false}
						data={items.map((entry) => ({
							value: `${entry.itemNo}`,
							label: `${entry.name} · ${entry.slots.length} part${
								entry.slots.length === 1 ? "" : "s"
							}`,
						}))}
						onChange={setPicked}
						searchable
					/>
					{edits.length > 0 && (
						<Button
							size="xs"
							variant="subtle"
							leftSection={<Undo2 size={14} />}
							disabled={busy}
							onClick={() => onStage([])}
						>
							Discard all {edits.length} staged change
							{edits.length === 1 ? "" : "s"}
						</Button>
					)}
				</Group>
			)}

			{item && (
				<ScrollArea.Autosize
					mah={430}
					type="auto"
					style={{ border: "1px solid var(--app-border)" }}
				>
					<Table stickyHeader highlightOnHover verticalSpacing="xs" fz="xs">
						<Table.Thead>
							<Table.Tr>
								<Table.Th>Part</Table.Th>
								<Table.Th>Colour</Table.Th>
								<Table.Th>R</Table.Th>
								<Table.Th>G</Table.Th>
								<Table.Th>B</Table.Th>
								<Table.Th>A</Table.Th>
								<Table.Th>Grime</Table.Th>
								<Table.Th>Palette</Table.Th>
								<Table.Th>Material</Table.Th>
								<Table.Th />
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{item.slots.map((slot) => (
								<DyePartRow
									key={`${item.itemNo}:${item.slotNo}:${slot.index}`}
									slot={slot}
									staged={channelsOf(edits, item, slot.index)}
									colorGroups={description?.colorGroups ?? []}
									materials={description?.materials ?? []}
									busy={busy}
									onStagePart={(patch) => stagePart(slot.index, patch)}
									onStageAllParts={() => stageAllParts(slot)}
								/>
							))}
						</Table.Tbody>
					</Table>
				</ScrollArea.Autosize>
			)}

			{bulkEdit && (
				<Paper
					withBorder
					p="sm"
					style={{ borderColor: "var(--mantine-primary-color-light)" }}
				>
					<Group gap="xs">
						<Badge size="xs" color="brand" variant="light">
							Every part
						</Badge>
						<Text size="xs" c="dimmed">
							{bulkEdit.label} is staged, and applies before any part you change
							after it.
						</Text>
					</Group>
				</Paper>
			)}
		</Stack>
	);
};
