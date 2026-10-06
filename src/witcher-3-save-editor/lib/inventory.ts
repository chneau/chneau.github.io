/**
 * The inventory item records and their names.
 *
 * Items are not tokens. Each is a record in the player-entity (and other
 * container) blobs, laid out as:
 *
 *     [u16 nameIdx] [11 bytes: per-item id/flags] <tag pair, 4 bytes>
 *     [u16 quantity] f32 durability [u16 slot] [variable tail]
 *
 * The `u16` **13 bytes before** the tag pair is a 1-based `MANU` index:
 * `names[nameIdx - 1]` is the item's template name. On the reference save that
 * yields `Crowns`, `Orens`, `Florens`, `Deer hide`, `Timber`, `Wolf Armor
 * schematic`, `Venom extract`, … — real item names, resolved from the save's own
 * name table, no game files needed.
 *
 * ## The tag pair is discovered, not hardcoded
 *
 * The four tag bytes are **per build**, not per save version. Measured across
 * seven reference saves in the source decoder, with every other byte of the
 * record shape unchanged:
 *
 * | build   | save version | tag pair   | records |
 * | ------- | ------------ | ---------- | ------: |
 * | `52586` | 66/29/164    | `72 00 74 00` | 1,845 |
 * | `8559a` | 66/29/164    | `76 00 77 00` |   621 |
 * | `11c607`| 66/29/164    | `54 00 55 00` | 11,781 |
 * | `f949c` | 64/27/163    | `86 00 88 00` | 12,795 |
 *
 * Note that `8559a` and `52586` share a save version and differ in tag pair, so
 * the pair tracks the build. A scanner that hardcodes `72 00 74 00` reads **zero**
 * items on four of those seven saves — which is exactly what this reader did
 * until `discoverTagPair` was written, and the reason the second fixture in
 * `./tests` reported an empty inventory rather than an empty *player*.
 *
 * The pair is recovered from the save's own bytes by {@link discoverTagPair}, so
 * a build nobody has seen still reads. When it cannot be recovered the reader
 * finds nothing and the page says so, rather than matching on a pair borrowed
 * from a different build and reporting unrelated records as items.
 *
 * ## Durability is at `+6` past the pair, and `-1.0` means "none"
 *
 * `GetItemDurability` returns a float and `GetItemDurabilityRatio` returns `-1`
 * when the item has none, so the field is the item's current durability with the
 * engine's own "no durability" sentinel. This reader used to *require* `f32
 * -1.0` as part of its anchor test, which dropped every item that had a real
 * durability — measured at 11 of the player's 626 records and 543 of the save's
 * 2,009 container records (27.0%), the player's own sword and armour among them.
 * The requirement is gone and the value is reported instead; the record counts
 * now match the lists' own declared counts.
 *
 * ## What the record still does not expose
 *
 * The 11-byte id/flags block is almost constant across items (a `u16` that
 * varies, then `02 10 01` or `0f 00 01`) and the tail's lead byte is not a
 * constant either, so neither is interpreted here. Upgrade levels and rolled
 * affixes live in the tail's ability array, which the source decoder's grammar
 * parses for 97.1% of records; that is not ported, so `itemFields` in
 * `generated/names.json` (see `./catalog`) is still only what the engine *calls*
 * those fields.
 *
 * A save holds **many** such lists — the player's inventory, and the item slots
 * of actors, containers and merchants. `readInventory` decodes records wherever
 * it finds them and `playerInventory` isolates the player's; the naming of every
 * *other* container, and the measurement behind that, is recorded below.
 */

import { readNameTable } from "./names";
import { type ObjectNode, readObjectTree } from "./objects";
import { parseTokens, type Token } from "./tokens";

export type InventoryItem = {
	/** template name, from the save's `MANU` table */
	readonly name: string;
	readonly quantity: number;
	/** the `u16` slot index at the end of the record */
	readonly slot: number;
	/**
	 * Current durability, or `null` when the item has none.
	 *
	 * `null` is the engine's own `-1.0` sentinel meaning "no durability" — the
	 * quantity of a potion, a diagram, a book — and not a missing field. A
	 * damaged sword reads a number; requiring `-1.0` to recognise the record used
	 * to hide exactly those.
	 */
	readonly durability: number | null;
	/** absolute offset of the record's tag pair in the decompressed stream */
	readonly offset: number;
};

/** The four per-build tag bytes that mark an item record. */
type TagPair = readonly [number, number, number, number];

/** `f32 -1.0`, the engine's "this item has no durability" sentinel. */
const MINUS_ONE_BYTES = [0x00, 0x00, 0x80, 0xbf] as const;

const u16 = (data: Uint8Array, at: number): number =>
	(data[at] ?? 0) | ((data[at + 1] ?? 0) << 8);

const f32 = (data: Uint8Array, at: number): number =>
	new DataView(data.buffer, data.byteOffset + at, 4).getFloat32(0, true);

const isMinusOne = (data: Uint8Array, at: number): boolean =>
	MINUS_ONE_BYTES.every((byte, i) => data[at + i] === byte);

const pairAt = (data: Uint8Array, at: number): TagPair => [
	data[at] ?? 0,
	data[at + 1] ?? 0,
	data[at + 2] ?? 0,
	data[at + 3] ?? 0,
];

const samePair = (a: TagPair, b: TagPair): boolean =>
	a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

/**
 * How many records must agree before a candidate tag pair is believed.
 *
 * The hunt counts pairs over the whole stream, and a pair that resolved once
 * could be a coincidence in a 5 MB buffer. 8 is well under the smallest real
 * figure measured (621 on the `8559a` build, which is the smallest of the seven
 * reference saves) and well over anything a coincidence reaches.
 */
const MIN_RECORDS_FOR_PAIR = 8;

/**
 * Recover this build's item-record tag pair from the save's own bytes.
 *
 * The search shape is the strict one — a `MANU` name that resolves at `-13`, six
 * zero bytes, then `f32 -1.0` at `+6` — because the durability sentinel is the
 * one four-byte value in the record that is known to be a constant, and a shape
 * built from known constants cannot drift. The most frequent pair wins.
 *
 * Returns `undefined` when the save holds no records of this shape, which is the
 * honest answer for a save whose build has a different record layout: the
 * reader then reports no items instead of matching another build's pair.
 */
export const discoverTagPair = (
	data: Uint8Array,
	names: readonly string[] = readNameTable(data).names,
): TagPair | undefined => {
	const counts = new Map<string, { pair: TagPair; count: number }>();
	for (let at = 16; at + 23 < data.length; at += 1) {
		// The id/flags block's padding is six zero bytes before the tag pair, and
		// they hold on every record measured.
		let zeros = true;
		for (let i = at - 6; i < at; i += 1) {
			if (data[i] !== 0) {
				zeros = false;
				break;
			}
		}
		if (!zeros || !isMinusOne(data, at + 6)) continue;
		if (names[u16(data, at - 13) - 1] === undefined) continue;
		const pair = pairAt(data, at);
		const key = pair.join(",");
		const seen = counts.get(key);
		if (seen === undefined) counts.set(key, { pair, count: 1 });
		else seen.count += 1;
	}
	let best: { pair: TagPair; count: number } | undefined;
	for (const candidate of counts.values()) {
		if (candidate.count < MIN_RECORDS_FOR_PAIR) continue;
		if (best === undefined || candidate.count > best.count) best = candidate;
	}
	return best?.pair;
};

/** Does an item record start its tag pair at `at`? */
const isAnchor = (data: Uint8Array, at: number, pair: TagPair): boolean =>
	samePair(pairAt(data, at), pair);

/**
 * Every inventory record in `[from, to)` whose name resolves, in offset order.
 * `names` defaults to the save's own `MANU` table.
 *
 * `tagPair` defaults to the pair {@link discoverTagPair} recovers from this save.
 * It is a parameter so the 290 calls `readContainers` makes do not repeat the
 * whole-stream hunt, and so a caller that has already discovered the pair pays
 * for it once.
 */
const readInventory = (
	data: Uint8Array,
	names: readonly string[] = readNameTable(data).names,
	from = 16,
	to = data.length,
	tagPair: TagPair | undefined = discoverTagPair(data, names),
): readonly InventoryItem[] => {
	if (tagPair === undefined) return [];
	const items: InventoryItem[] = [];
	const start = Math.max(from, 13);
	const end = Math.min(to, data.length - 14);
	for (let at = start; at <= end; at += 1) {
		if (!isAnchor(data, at, tagPair)) continue;
		const name = names[u16(data, at - 13) - 1];
		if (name === undefined || name === "") continue;
		const durability = f32(data, at + 6);
		items.push({
			name,
			quantity: u16(data, at + 4),
			slot: data[at + 11] ?? 0,
			durability: durability === -1 ? null : durability,
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
	tagPair: TagPair | undefined = discoverTagPair(data, names),
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
	return readInventory(data, names, span.offset, span.end, tagPair);
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
	scan?: readonly Token[],
	roots?: readonly ObjectNode[],
): readonly InventoryContainer[] => {
	const tokens = scan ?? parseTokens(data, names).tokens;
	const tree = roots ?? readObjectTree(data).roots;

	const spans: { offset: number; end: number }[] = [];
	const collect = (nodes: readonly ObjectNode[]): void => {
		for (const node of nodes) {
			if (node.span.token.name === "entityData") {
				spans.push({ offset: node.span.offset, end: node.span.end });
			}
			collect(node.children);
		}
	};
	collect(tree);
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

	// One whole-stream hunt for the build's tag pair, shared by all ~290 frames
	// rather than repeated per frame.
	const tagPair = discoverTagPair(data, names);

	// Which span holds each `idTag`, in **one** pass over the token list.
	//
	// This used to be `tokens.filter(...)` inside the loop below — a scan of every
	// token per span, so O(spans × tokens). Measured on the 5 MB fixture that was
	// 290 × 250,640; on a 15 MB reference save it is ~6,500 spans against ~700,000
	// tokens and the whole decode took **52 seconds**. It is a single merge now,
	// because `spans` and `tokens` are both in offset order: one cursor advances
	// through the spans as the tokens pass, so each token is looked at once.
	// `spans.map` rather than `new Array(n).fill("")`: the latter infers `any[]`
	// and silently loses the element type, so the `community.get(hex)` below stops
	// typechecking for a reason that looks unrelated to this line.
	const tagHexBySpan: string[] = spans.map(() => "");
	let cursor = 0;
	for (const token of tokens) {
		while (cursor < spans.length && (spans[cursor]?.end ?? 0) <= token.offset) {
			cursor += 1;
		}
		const span = spans[cursor];
		if (span === undefined || token.offset < span.offset) continue;
		// The first `idTag` inside a frame labels it; later ones belong to nested
		// entities and must not overwrite it.
		if (
			token.name === "idTag" &&
			token.value !== undefined &&
			tagHexBySpan[cursor] === ""
		) {
			tagHexBySpan[cursor] = hexOf(token.value.bytes);
		}
	}
	const playerSpan =
		player === undefined
			? -1
			: spans.findIndex(
					(span) => player.offset >= span.offset && player.offset < span.end,
				);

	return spans.map((span, spanIndex) => {
		const hex = tagHexBySpan[spanIndex] ?? "";
		const isPlayer = spanIndex === playerSpan;
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
			items: readInventory(data, names, span.offset, span.end, tagPair),
		};
	});
};
