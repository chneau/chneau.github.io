import { readNameTable } from "./names";
import type { ObjectNode } from "./objects";
import { readObjectTree } from "./objects";
import { reflectValue } from "./reflect";
import { parseTokens, type Token } from "./tokens";

export const DIALOG_SAMPLE_LIMIT = 32;

export const ATTITUDE_SAMPLE_LIMIT = 48;

const NEUTRAL_ATTITUDE = "AIA_Neutral";

const ATTITUDES_BLOCK = "attitudes";

const PARENT_GROUPS_BLOCK = "parentGroups";

const ACTOR_ATTITUDES_BLOCK = "actorAttitudes";

const SINGLE_GUID_BLOCK_BYTES = 44;

const ATTITUDE_COLUMN_TYPE = "array:2,0,EAIAttitude";

const CNAME_ARRAY_TYPE = "array:2,0,CName";

type ExternalDialogBlock = {
	readonly speaker: string | null;
	readonly guids: readonly string[];
	readonly dialogsCount: number | null;
};

type PendingDialog = {
	readonly speaker: string | null;
	readonly guid: string;
	readonly hasQuestBlockReference: boolean;
	readonly dialogsCount: number | null;
};

type PendingDialogs = {
	readonly blockCount: number;
	readonly guidCount: number;
	readonly blocksWithMultipleGuids: number;
	readonly blocksReferencedByQuestBlock: number;
	readonly orphanGuidCount: number;
	readonly sample: readonly PendingDialog[];
};

type AttitudePair = {
	readonly group: string | null;
	readonly against: string | null;
	readonly attitude: string | null;
};

type AttitudeValueCount = {
	readonly attitude: string;
	readonly count: number;
};

type AttitudeMatrix = {
	readonly groupCount: number | null;
	readonly parentGroupCount: number | null;
	readonly distinctParentCount: number | null;
	readonly unresolvedRowCount: number;
	readonly nonNeutralCount: number;
	readonly valueCounts: readonly AttitudeValueCount[];
	readonly actorAttitudeCount: number | null;
	readonly sample: readonly AttitudePair[];
};

type DialogueRead = {
	readonly dialogs: PendingDialogs;
	readonly attitudes: AttitudeMatrix;
};

export const resolveCName = (
	names: readonly string[],
	bytes: Uint8Array,
): string | null => {
	if (bytes.length < 2) return null;
	const index = (bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8);
	if (index < 1) return null;
	return names[index - 1] ?? null;
};

const cnameText = (names: readonly string[], text: string): string | null => {
	const match = text.match(/CName\((\d+)\)/);
	if (match === null) return null;
	const index = Number(match[1]);
	return index >= 1 ? (names[index - 1] ?? null) : null;
};

type IndexedTree = {
	readonly roots: readonly ObjectNode[];
	readonly nodes: readonly ObjectNode[];
	readonly spanEnds: ReadonlyMap<number, number>;
};

const indexTree = (roots: readonly ObjectNode[]): IndexedTree => {
	const nodes: ObjectNode[] = [];
	const spanEnds = new Map<number, number>();
	const walk = (list: readonly ObjectNode[]): void => {
		for (const node of list) {
			nodes.push(node);
			spanEnds.set(node.span.offset, node.span.end);
			walk(node.children);
		}
	};
	walk(roots);
	return { roots, nodes, spanEnds };
};

const offsetsFrom = (tokens: readonly Token[]): readonly number[] =>
	tokens.map((token) => token.offset);

const lowerBound = (offsets: readonly number[], at: number): number => {
	let low = 0;
	let high = offsets.length;
	while (low < high) {
		const mid = (low + high) >> 1;
		if ((offsets[mid] ?? 0) < at) low = mid + 1;
		else high = mid;
	}
	return low;
};

const questBlockGuids = (
	tokens: readonly Token[],
	offsets: readonly number[],
	nodes: readonly ObjectNode[],
): ReadonlySet<string> => {
	const guids = new Set<string>();
	for (const node of nodes) {
		if (node.span.token.name !== "questBlock") continue;
		let index = lowerBound(offsets, node.span.offset + 1);
		while (index < tokens.length) {
			const token = tokens[index];
			if (token === undefined || token.offset >= node.span.end) break;
			if (token.name === "GUID" && token.value !== undefined) {
				guids.add(token.value.text);
			}
			index += 1;
		}
	}
	return guids;
};

const readBlock = (
	tokens: readonly Token[],
	names: readonly string[],
	spanEnds: ReadonlyMap<number, number>,
	index: number,
): ExternalDialogBlock => {
	const frame = tokens[index];
	const start = frame?.offset ?? 0;
	const end = spanEnds.get(start) ?? start + SINGLE_GUID_BLOCK_BYTES;
	const guids: string[] = [];
	let speaker: string | null = null;
	let dialogsCount: number | null = null;
	for (let child = index + 1; child < tokens.length; child += 1) {
		const token = tokens[child];
		if (token === undefined || token.offset >= end) break;
		if (token.value === undefined) continue;
		if (token.name === "guid" || token.name === "GUID") {
			guids.push(token.value.text);
		} else if (token.name === "tag") {
			speaker = resolveCName(names, token.value.bytes);
		} else if (token.name === "dialogsCount") {
			const parsed = Number(token.value.text);
			dialogsCount = Number.isFinite(parsed) ? parsed : null;
		}
	}
	return { speaker, guids, dialogsCount };
};

const readBlocks = (
	tokens: readonly Token[],
	names: readonly string[],
	spanEnds: ReadonlyMap<number, number>,
): readonly ExternalDialogBlock[] => {
	const blocks: ExternalDialogBlock[] = [];
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (
			token === undefined ||
			token.tag !== "BS" ||
			token.name !== "ExternalDialog"
		) {
			continue;
		}
		blocks.push(readBlock(tokens, names, spanEnds, index));
	}
	return blocks;
};

const readPendingDialogs = (
	names: readonly string[],
	tokens: readonly Token[],
	tree: IndexedTree,
): PendingDialogs => {
	const blocks = readBlocks(tokens, names, tree.spanEnds);
	const offsets = offsetsFrom(tokens);
	const blockGuids = questBlockGuids(tokens, offsets, tree.nodes);

	const rows: PendingDialog[] = [];
	const distinct = new Set<string>();
	const referencedGuids = new Set<string>();
	let multi = 0;
	let blocksReferenced = 0;
	for (const block of blocks) {
		if (block.guids.length > 1) multi += 1;
		let everyReferenced = block.guids.length > 0;
		for (const guid of block.guids) {
			distinct.add(guid);
			const hasReference = blockGuids.has(guid);
			if (hasReference) referencedGuids.add(guid);
			else everyReferenced = false;
			if (rows.length < DIALOG_SAMPLE_LIMIT) {
				rows.push({
					speaker: block.speaker,
					guid,
					hasQuestBlockReference: hasReference,
					dialogsCount: block.dialogsCount,
				});
			}
		}
		if (everyReferenced) blocksReferenced += 1;
	}

	return {
		blockCount: blocks.length,
		guidCount: distinct.size,
		blocksWithMultipleGuids: multi,
		blocksReferencedByQuestBlock: blocksReferenced,
		orphanGuidCount: distinct.size - referencedGuids.size,
		sample: rows,
	};
};

const rootNamed = (
	roots: readonly ObjectNode[],
	name: string,
): ObjectNode | undefined =>
	roots.find((node) => node.span.token.name === name);

const readColumn = (
	data: Uint8Array,
	names: readonly string[],
	tokens: readonly Token[],
	block: ObjectNode | undefined,
	column: string,
): readonly (string | null)[] | undefined => {
	if (block === undefined) return undefined;
	const found = tokens.find(
		(token) =>
			token.tag !== "BS" &&
			token.name === column &&
			token.value !== undefined &&
			token.offset > block.span.offset &&
			token.offset < block.span.end,
	);
	if (found === undefined || found.value === undefined) return undefined;
	const asDeclared =
		found.value.type === ATTITUDE_COLUMN_TYPE
			? CNAME_ARRAY_TYPE
			: found.value.type;
	const value = reflectValue(
		data,
		names,
		asDeclared,
		found.offset + 6,
		found.value.bytes.byteLength,
	);
	if (value === undefined) return undefined;
	return value.items?.map((item) => cnameText(names, item.text)) ?? [];
};

const readActorAttitudeCount = (
	tokens: readonly Token[],
	block: ObjectNode | undefined,
): number | null => {
	if (block === undefined) return null;
	const found = tokens.find(
		(token) =>
			token.tag !== "BS" &&
			token.name === "count" &&
			token.value !== undefined &&
			token.offset > block.span.offset &&
			token.offset < block.span.end,
	);
	if (found === undefined || found.value === undefined) return null;
	const parsed = Number(found.value.text);
	return Number.isFinite(parsed) ? parsed : null;
};

const readAttitudeMatrix = (
	data: Uint8Array,
	names: readonly string[],
	tokens: readonly Token[],
	roots: readonly ObjectNode[],
): AttitudeMatrix => {
	const attitudes = rootNamed(roots, ATTITUDES_BLOCK);
	const parents = rootNamed(roots, PARENT_GROUPS_BLOCK);
	const first = readColumn(data, names, tokens, attitudes, "1");
	const second = readColumn(data, names, tokens, attitudes, "2");
	const values = readColumn(data, names, tokens, attitudes, "a");
	const parentKeys = readColumn(data, names, tokens, parents, "1");
	const parentNames = readColumn(data, names, tokens, parents, "2");

	const tallied = attitudeRows(first, second, values);

	return {
		groupCount: first === undefined ? null : tallied.groupCount,
		parentGroupCount: parentKeys?.length ?? null,
		distinctParentCount:
			parentNames === undefined ? null : new Set(parentNames).size,
		unresolvedRowCount: tallied.unresolvedRowCount,
		nonNeutralCount: tallied.nonNeutralCount,
		valueCounts: tallied.valueCounts,
		actorAttitudeCount: readActorAttitudeCount(
			tokens,
			rootNamed(roots, ACTOR_ATTITUDES_BLOCK),
		),
		sample: tallied.sample,
	};
};

export const attitudeRows = (
	first: readonly (string | null)[] | undefined,
	second: readonly (string | null)[] | undefined,
	values: readonly (string | null)[] | undefined,
): {
	readonly groupCount: number;
	readonly unresolvedRowCount: number;
	readonly nonNeutralCount: number;
	readonly valueCounts: readonly { attitude: string; count: number }[];
	readonly sample: readonly AttitudePair[];
} => {
	const rows = Math.max(
		first?.length ?? 0,
		second?.length ?? 0,
		values?.length ?? 0,
	);
	const histogram = new Map<string, number>();
	const sample: AttitudePair[] = [];
	let unresolved = 0;
	let nonNeutral = 0;
	for (let index = 0; index < rows; index += 1) {
		const group = first?.[index] ?? null;
		const against = second?.[index] ?? null;
		const attitude = values?.[index] ?? null;
		if (group === null || against === null || attitude === null) {
			unresolved += 1;
		}
		const key = attitude ?? "<unresolved>";
		histogram.set(key, (histogram.get(key) ?? 0) + 1);
		if (attitude === null || attitude === NEUTRAL_ATTITUDE) continue;
		nonNeutral += 1;
		if (sample.length < ATTITUDE_SAMPLE_LIMIT) {
			sample.push({ group, against, attitude });
		}
	}
	return {
		groupCount: rows,
		unresolvedRowCount: unresolved,
		nonNeutralCount: nonNeutral,
		valueCounts: [...histogram]
			.map(([attitude, count]) => ({ attitude, count }))
			.sort((a, b) => (a.attitude < b.attitude ? -1 : 1)),
		sample,
	};
};

export const readDialogues = (
	data: Uint8Array,
	names: readonly string[] = readNameTable(data).names,
	scan?: readonly Token[],
	roots?: readonly ObjectNode[],
): DialogueRead => {
	const tokens = scan ?? parseTokens(data, names).tokens;
	const tree = indexTree(roots ?? readObjectTree(data).roots);
	return {
		dialogs: readPendingDialogs(names, tokens, tree),
		attitudes: readAttitudeMatrix(data, names, tokens, tree.roots),
	};
};
