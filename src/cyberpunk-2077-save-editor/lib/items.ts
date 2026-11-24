import type { Bytes } from "../../shared";
import { findNode, type SaveNode } from "./container";

const QUANTITY_AT = 21;
const QUANTITY_WIDTH = 4;
const SENTINEL_MONEY = 10_000;
const MAX_QUANTITY = 2_147_483_647;

const CRC_TABLE: readonly number[] = (() => {
	const table: number[] = [];
	for (let index = 0; index < 256; index += 1) {
		let value = index;
		for (let bit = 0; bit < 8; bit += 1) {
			value = (value & 1) === 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
		}
		table.push(value >>> 0);
	}
	return table;
})();

const crc32 = (text: string): number => {
	let crc = 0xffffffff;
	for (const byte of new TextEncoder().encode(text)) {
		crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0);
	}
	return (crc ^ 0xffffffff) >>> 0;
};

export const itemId = (name: string): bigint =>
	(BigInt(name.length) << 32n) | BigInt(crc32(name));

const MONEY_ITEM = itemId("Items.money");

export type ComponentTier = {
	readonly tier: number;
	readonly item: string;
	readonly upgrade: string;
};

export const COMPONENT_TIERS: readonly ComponentTier[] = [
	{ tier: 1, item: "Items.CommonMaterial1", upgrade: "Items.CommonMaterial2" },
	{
		tier: 2,
		item: "Items.UncommonMaterial1",
		upgrade: "Items.UncommonMaterial2",
	},
	{ tier: 3, item: "Items.RareMaterial1", upgrade: "Items.RareMaterial2" },
	{ tier: 4, item: "Items.EpicMaterial1", upgrade: "Items.EpicMaterial2" },
	{
		tier: 5,
		item: "Items.LegendaryMaterial1",
		upgrade: "Items.LegendaryMaterial2",
	},
];

export type ComponentKind = "item" | "upgrade";

export const componentLabel = (kind: ComponentKind, tier: number): string =>
	`Tier ${tier} ${kind === "item" ? "Item Components" : "Upgrade Components"}`;

export type ComponentFamily = "item" | "upgrade" | "quickhack";

export type ComponentStack = {
	readonly label: string;
	readonly item: string;
	readonly family: ComponentFamily;
	readonly tier: number;
};

export const COMPONENT_STACKS: readonly ComponentStack[] = [
	...COMPONENT_TIERS.flatMap((entry) => [
		{
			label: componentLabel("item", entry.tier),
			item: entry.item,
			family: "item" as const,
			tier: entry.tier,
		},
		{
			label: componentLabel("upgrade", entry.tier),
			item: entry.upgrade,
			family: "upgrade" as const,
			tier: entry.tier,
		},
	]),
	{
		label: "Tier 2 Quickhack Components",
		item: "Items.QuickHackUncommonMaterial1",
		family: "quickhack" as const,
		tier: 2,
	},
	{
		label: "Tier 3 Quickhack Components",
		item: "Items.QuickHackRareMaterial1",
		family: "quickhack" as const,
		tier: 3,
	},
	{
		label: "Tier 4 Quickhack Components",
		item: "Items.QuickHackEpicMaterial1",
		family: "quickhack" as const,
		tier: 4,
	},
	{
		label: "Tier 5 Quickhack Components",
		item: "Items.QuickHackLegendaryMaterial1",
		family: "quickhack" as const,
		tier: 5,
	},
];

const viewOf = (bytes: Bytes): DataView =>
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const quantityOf = (node: SaveNode): number | undefined =>
	node.data.length >= QUANTITY_AT + QUANTITY_WIDTH
		? viewOf(node.data).getInt32(QUANTITY_AT, true)
		: undefined;

const recordsOf = (root: SaveNode, id: bigint): readonly SaveNode[] =>
	findNode(root, "inventory")?.children.filter(
		(child) =>
			child.data.length >= QUANTITY_AT + QUANTITY_WIDTH &&
			viewOf(child.data).getBigUint64(0, true) === id,
	) ?? [];

const writeQuantity = (node: SaveNode, quantity: number): void => {
	if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
		throw new Error(
			`Item quantities are signed 32-bit integers, so ${quantity} cannot be written to this save.`,
		);
	}
	viewOf(node.data).setInt32(QUANTITY_AT, quantity, true);
};

const walletOf = (root: SaveNode): SaveNode | undefined => {
	const records = recordsOf(root, MONEY_ITEM);
	const wallets = records.filter((node) => quantityOf(node) !== SENTINEL_MONEY);
	if (wallets.length > 1) return undefined;
	const [wallet] = wallets;
	return wallet ?? records[0];
};

export const readMoney = (root: SaveNode): number | null => {
	const wallet = walletOf(root);
	return wallet === undefined ? null : (quantityOf(wallet) ?? null);
};

export const writeMoney = (root: SaveNode, money: number): void => {
	const wallet = walletOf(root);
	if (wallet === undefined) {
		throw new Error(
			"This save's wallet record is ambiguous, so the money was left as it is.",
		);
	}
	writeQuantity(wallet, money);
};

export const readComponents = (root: SaveNode): ReadonlyMap<string, number> => {
	const found = new Map<string, number>();
	for (const { label, item } of COMPONENT_STACKS) {
		const [record] = recordsOf(root, itemId(item));
		const quantity = record === undefined ? undefined : quantityOf(record);
		if (quantity !== undefined) found.set(label, quantity);
	}
	return found;
};

export const writeComponents = (
	root: SaveNode,
	values: ReadonlyMap<string, number>,
): void => {
	for (const { label, item } of COMPONENT_STACKS) {
		const wanted = values.get(label);
		if (wanted === undefined) continue;
		const [existing] = recordsOf(root, itemId(item));
		if (existing === undefined) continue;
		if (quantityOf(existing) !== wanted) writeQuantity(existing, wanted);
	}
};
