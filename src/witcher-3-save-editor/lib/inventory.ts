import { readNameTable } from "./names";
import { type ObjectNode, readObjectTree } from "./objects";
import { parseTokens, type Token } from "./tokens";

export type InventoryItem = {
	readonly name: string;
	readonly quantity: number;
	readonly slot: number;
	readonly durability: number | null;
	readonly offset: number;
};

type TagPair = readonly [number, number, number, number];

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

const MIN_RECORDS_FOR_PAIR = 8;

export const discoverTagPair = (
	data: Uint8Array,
	names: readonly string[] = readNameTable(data).names,
): TagPair | undefined => {
	const counts = new Map<string, { pair: TagPair; count: number }>();
	for (let at = 16; at + 23 < data.length; at += 1) {
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

const isAnchor = (data: Uint8Array, at: number, pair: TagPair): boolean =>
	samePair(pairAt(data, at), pair);

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

type InventoryContainer = {
	readonly offset: number;
	readonly size: number;
	readonly label: string;
	readonly items: readonly InventoryItem[];
};

const communityLabel = (path: string): string => {
	const base = path.split(/[\\/]/).pop() ?? path;
	return base.replace(/\.w2comm$/i, "") || path;
};

const hexOf = (bytes: Uint8Array): string =>
	[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

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

	const tagPair = discoverTagPair(data, names);

	const tagHexBySpan: string[] = spans.map(() => "");
	let cursor = 0;
	for (const token of tokens) {
		while (cursor < spans.length && (spans[cursor]?.end ?? 0) <= token.offset) {
			cursor += 1;
		}
		const span = spans[cursor];
		if (span === undefined || token.offset < span.offset) continue;
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
