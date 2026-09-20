/**
 * TypeScript port of `public/python/editor/item_discovery.py`.
 */

import { type ItemKnowledgeMapFile, itemKnowledgeTable } from "./data";
import { insertKnowledge } from "./knowledge-inserter";
import { sha256Hex } from "./transaction";

let discoveryPromise: Promise<ItemKnowledgeMapFile> | undefined;

const discoveryMap = (): Promise<ItemKnowledgeMapFile> => {
	discoveryPromise ??= itemKnowledgeTable();
	return discoveryPromise;
};

export const discoveryKeys = async (
	itemKey: number,
	requestedKey?: number,
): Promise<number[]> => {
	const map = await discoveryMap();
	const keys = map.items[String(itemKey)]?.knowledge_keys ?? [];
	if (
		requestedKey !== undefined &&
		(!Number.isInteger(requestedKey) || !keys.includes(requestedKey))
	) {
		throw new Error("The requested discovery entry does not match this item.");
	}
	return keys;
};

type DiscoveryAudit = {
	status: string;
	item_key: number;
	knowledge_keys: number[];
	entries: Array<Record<string, unknown>>;
	output_sha256: string;
};

export const applyItemDiscovery = async (
	source: Uint8Array,
	itemKey: number,
	requestedKey?: number,
): Promise<[Uint8Array, DiscoveryAudit]> => {
	const keys = await discoveryKeys(itemKey, requestedKey);
	const audits: Array<Record<string, unknown>> = [];
	let output = source;
	for (const key of keys) {
		const [next, audit] = await insertKnowledge(output, { knowledgeKey: key });
		output = next;
		audits.push(audit);
	}
	const map = await discoveryMap();
	const status = keys.length
		? "mapped"
		: map.no_discovery_item_keys.includes(itemKey)
			? "not_required"
			: "unknown";
	return [
		output,
		{
			status,
			item_key: itemKey,
			knowledge_keys: keys,
			entries: audits,
			output_sha256: await sha256Hex(output),
		},
	];
};
