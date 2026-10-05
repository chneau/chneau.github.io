/**
 * The inventory item records and their names.
 *
 * Items are not tokens. Each is a **30-byte** record in the player-entity (and
 * other container) blobs:
 *
 *     [u16 nameIdx] [11 bytes: per-item id/flags] 72 00 74 00
 *     [u16 quantity] f32(-1.0) [u16 slot] [5 bytes]
 *
 * The `u16` **13 bytes before** the `72 00 74 00` anchor is a 1-based `MANU`
 * index: `names[nameIdx - 1]` is the item's template name. On the reference save
 * that yields `Crowns`, `Orens`, `Florens`, `Deer hide`, `Timber`, `Wolf Armor
 * schematic`, `Venom extract`, … — real item names, resolved from the save's own
 * name table, no game files needed.
 *
 * The record exposes **name, quantity and slot only**. Its 11-byte id/flags
 * block is almost constant across items (a `u16` that varies, then `02 10 01` or
 * `0f 00 01`), and the trailing field is zero; there is no self-describing
 * durability/upgrade field. Any per-instance detail (durability, upgrade level,
 * affixes) lives in the native item entity or the `SItemUniqueId` of the
 * equipped slots, which is not decoded here. The `itemFields` section of
 * `generated/names.json` (see `./catalog`) is what the engine *calls* those
 * fields, for when that layer is written.
 *
 * A save holds **many** such lists — the player's inventory, and the item slots
 * of actors, containers and merchants. `readInventory` decodes records wherever
 * it finds them and `playerInventory` isolates the player's; the naming of every
 * *other* container, and the measurement behind that, is recorded below.
 */

import { readNameTable } from "./names";
import { type ObjectNode, readObjectTree } from "./objects";
import { parseTokens } from "./tokens";

export type InventoryItem = {
	/** template name, from the save's `MANU` table */
	readonly name: string;
	readonly quantity: number;
	/** the `u16` slot index at the end of the record */
	readonly slot: number;
	/** absolute offset of the `72 00 74 00` anchor in the decompressed stream */
	readonly offset: number;
};

const u16 = (data: Uint8Array, at: number): number =>
	(data[at] ?? 0) | ((data[at + 1] ?? 0) << 8);

/** Does an item record anchor start at `at`? `72 00 74 00` then `f32 -1.0`. */
const isAnchor = (data: Uint8Array, at: number): boolean =>
	data[at] === 0x72 &&
	data[at + 1] === 0x00 &&
	data[at + 2] === 0x74 &&
	data[at + 3] === 0x00 &&
	data[at + 6] === 0x00 &&
	data[at + 7] === 0x00 &&
	data[at + 8] === 0x80 &&
	data[at + 9] === 0xbf;

/**
 * Every inventory record in `[from, to)` whose name resolves, in offset order.
 * `names` defaults to the save's own `MANU` table.
 */
const readInventory = (
	data: Uint8Array,
	names: readonly string[] = readNameTable(data).names,
	from = 16,
	to = data.length,
): readonly InventoryItem[] => {
	const items: InventoryItem[] = [];
	const start = Math.max(from, 13);
	const end = Math.min(to, data.length - 14);
	for (let at = start; at <= end; at += 1) {
		if (!isAnchor(data, at)) continue;
		const name = names[u16(data, at - 13) - 1];
		if (name === undefined || name === "") continue;
		items.push({
			name,
			quantity: u16(data, at + 4),
			slot: data[at + 11] ?? 0,
			offset: at,
		});
	}
	return items;
};

/*
 * Looking an item up in a list is case-insensitive on the template name and
 * takes the *most recent* matching record. Stated here because it is the rule a
 * lookup has to follow, not because a caller currently does.
 */

/*
 * `readContainers` used to stand here — every `BS entityData` frame with its
 * items and an owner label — and is gone. What it established is a property of
 * the format, so it is kept:
 *
 * Each `BS entityData` frame is one container, and its owner label is `"player"`
 * for the frame holding `levelManager`, otherwise the **community basename** the
 * entity was spawned from (`keira_metz`,
 * `novigrad_rich_district_passiflora_girl_01`, …) — the registry entry sharing
 * the frame's `idTag` carries a `community : String`, and
 * `quests\…\keira_metz.w2comm` reduces to `keira_metz` — or `idTag <hex>` when
 * the entity has no community. The save stores **no display template** inside the
 * frame, so the community join is the only way to name one, and the join is what
 * `playerInventory` avoids needing by keying on `levelManager` instead.
 *
 * A save holds ~300 such frames, and only the player's is bounded by a unique
 * token; that asymmetry is why every other container's item list has to be found
 * by walking the object tree for an `entityData` span rather than by looking
 * something up.
 */

/**
 * The player's own inventory: every item record inside the `BS entityData`
 * frame that contains the player's `levelManager` handle.
 *
 * A save holds ~300 `entityData` frames — the player, every actor, and every
 * merchant/container — each with its own item list. The player's is the one that
 * also carries `levelManager` (a unique token), so that frame bounds it exactly.
 * Returns `undefined` when there is no player entity.
 */
export const playerInventory = (
	data: Uint8Array,
	names: readonly string[] = readNameTable(data).names,
): readonly InventoryItem[] | undefined => {
	const token = parseTokens(data, names).tokens.find(
		(t) =>
			t.name === "levelManager" && t.value?.type === "handle:W3LevelManager",
	);
	if (token === undefined) return undefined;

	const tree = readObjectTree(data);
	let span: { offset: number; end: number } | undefined;
	const walk = (nodes: readonly ObjectNode[]): void => {
		for (const node of nodes) {
			if (
				node.span.token.name === "entityData" &&
				token.offset >= node.span.offset &&
				token.offset < node.span.end
			) {
				span = { offset: node.span.offset, end: node.span.end };
				return;
			}
			walk(node.children);
			if (span !== undefined) return;
		}
	};
	walk(tree.roots);
	if (span === undefined) return undefined;
	return readInventory(data, names, span.offset, span.end);
};

/**
 * One container: an `entityData` frame, its owner label, and its items.
 */
type InventoryContainer = {
	readonly offset: number;
	readonly size: number;
	/** `"player"`, a community basename, or `idTag <hex>` when unnamed */
	readonly label: string;
	readonly items: readonly InventoryItem[];
};

/** `quests\\…\\keira_metz.w2comm` -> `keira_metz`. */
const communityLabel = (path: string): string => {
	const base = path.split(/[\\/]/).pop() ?? path;
	return base.replace(/\.w2comm$/i, "") || path;
};

const hexOf = (bytes: Uint8Array): string =>
	[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Every container in the save: each `BS entityData` frame with its items, and an
 * owner label.
 *
 * The label is `"player"` for the frame holding `levelManager`, otherwise the
 * **community basename** the entity was spawned from (`keira_metz`,
 * `novigrad_rich_district_passiflora_girl_01`, …) — the registry entry sharing
 * the frame's `idTag` carries a `community : String` — or `idTag <hex>` when the
 * entity has no community. The save stores no display template inside the frame.
 */
export const readContainers = (
	data: Uint8Array,
	names: readonly string[] = readNameTable(data).names,
): readonly InventoryContainer[] => {
	const tokens = parseTokens(data, names).tokens;
	const tree = readObjectTree(data);

	const spans: { offset: number; end: number }[] = [];
	const collect = (nodes: readonly ObjectNode[]): void => {
		for (const node of nodes) {
			if (node.span.token.name === "entityData") {
				spans.push({ offset: node.span.offset, end: node.span.end });
			}
			collect(node.children);
		}
	};
	collect(tree.roots);
	spans.sort((a, b) => a.offset - b.offset);

	// idTag -> community, from the registry entry that shares the idTag.
	const community = new Map<string, string>();
	for (let i = 0; i < tokens.length; i += 1) {
		const tag = tokens[i];
		if (tag === undefined || tag.name !== "idTag" || tag.value === undefined) {
			continue;
		}
		for (
			let j = i + 1;
			j < tokens.length && (tokens[j]?.offset ?? 0) < tag.offset + 3000;
			j += 1
		) {
			const next = tokens[j];
			if (next === undefined) break;
			if (next.name === "community" && next.value?.type === "String") {
				community.set(hexOf(tag.value.bytes), next.value.text);
				break;
			}
			if (next.name === "idTag") break;
		}
	}

	const player = tokens.find(
		(t) =>
			t.name === "levelManager" && t.value?.type === "handle:W3LevelManager",
	);

	return spans.map((span) => {
		const inside = tokens.filter(
			(t) => t.offset >= span.offset && t.offset < span.end,
		);
		const tag = inside.find((t) => t.name === "idTag" && t.value !== undefined);
		const hex = tag?.value === undefined ? "" : hexOf(tag.value.bytes);
		const isPlayer =
			player !== undefined &&
			player.offset >= span.offset &&
			player.offset < span.end;
		const comm = community.get(hex);
		const label = isPlayer
			? "player"
			: comm !== undefined
				? communityLabel(comm)
				: hex !== ""
					? `idTag ${hex}`
					: "container";
		return {
			offset: span.offset,
			size: span.end - span.offset,
			label,
			items: readInventory(data, names, span.offset, span.end),
		};
	});
};
