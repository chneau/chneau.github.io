/**
 * The save's two dialogue-adjacent structures: pending external-scene dialog
 * references, and the global NPC **attitude-group** matrix.
 *
 * ## There is no dialogue in a save. Read this before naming anything
 *
 * This module reads **references**, not conversation. It is not a transcript
 * viewer, and nothing here may be presented as one. The reference decoder
 * searched the whole decompressed stream of seven saves for every name a
 * dialogue-graph cursor would leave — `currentNode`, `nodeId`, `lastTopic`,
 * `conversationHistory`, `dialogHistory`, `lastConversation`, `currentLine`,
 * `CStorySceneDialogset`, `CDialogLineSelector`, `DialogEnter`, `DialogExit`,
 * `DialogAction_`, `m_desiredDialogsetInstance`, and the asset extensions
 * `.w2phase` / `.w2dialog` / `.w3speech` / `w3strings` / `enpc` — and found
 * **zero occurrences of every one**. A save records that a dialogue resource
 * exists and that a quest block plays it. It records no node position, no lines,
 * no options chosen, no "last topic per NPC", and no "has met" flag (those are
 * facts, not entity fields).
 *
 * Two things are therefore deliberately **not** built, and a later change
 * proposing either has to explain how it would read a byte the file does not
 * hold: a conversation history, and a per-NPC "current dialogue" view.
 *
 * A second trap sits next to it. The larger saves' `MANU` tables carry the
 * dialogue *asset* names themselves — `AbnerOneliner`, `q105_dialogs`,
 * `sq204_sven_after_dialog`, `ep2_noble_woman_dialog`, `mq3035_witch_hunter_line1`
 * — and **zero tokens use any of them**. A name in `MANU` is a name the engine
 * knows; it is not state this save carries. `dialogOrCutscene`, `Dialogue` and
 * `TutorialDialog` are likewise present as names and used by nothing. Counting
 * `MANU` as "dialogues in this save" would report 31 on one fixture and 15 on
 * the other and mean nothing by either number.
 *
 * ## What `ExternalDialog` actually is
 *
 * `questSystem > questExternalScenePlayers > CQuestExternalScenePlayer` holds
 * one `BS ExternalDialog` block per pending scene dialog:
 *
 * ```
 *   BS ExternalDialog | VL tag : CName    | VL dialogsCount : Uint32 | VL guid : CGUID
 * ```
 *
 * `tag` is a 1-based `MANU` index naming the speaker or scene; `guid` is the
 * 16-byte id of the dialogue resource. The same guid reappears as the `GUID` of
 * a `questBlock`, which is what makes it a bridge from an opaque scene id to a
 * name — and that cross-reference is **total** on every save measured here
 * (155/155 distinct guids on 52586, 21/21 on 8559a).
 *
 * ## The multi-guid block, which the reference reader misses
 *
 * `dialogsCount` is not always 1. A block that declares two dialogs writes two
 * `guid` values, and the block's span grows from 44 B to 66 B (88 B for three,
 * on the larger reference saves). The reference `readDialogs` fixed the window
 * at `offset + 44` and read one `guid`, so it dropped the second — on 52586
 * that is 4 blocks and 4 of 155 guids, 2.6% of the table, gone silently.
 * Here the window comes from the engine's own span index (the `SC` table read
 * by `./objects`), which is the only thing in the format that states a `BS`
 * frame's extent; `BS` carries no size of its own. A window derived from the
 * data alone cannot work: the block length is what tells you how many guids
 * follow.
 *
 * ## `attitudes` is a group×group table, not a per-NPC attitude
 *
 * Three top-level roots sit next to each other in the stream:
 *
 * ```
 *   BS attitudes      | "1" : array:2,0,CName | "2" : array:2,0,CName | "a" : array:2,0,EAIAttitude
 *   BS parentGroups   | "1" : array:2,0,CName | "2" : array:2,0,CName
 *   BS actorAttitudes | count : Uint32
 * ```
 *
 * The three columns are zipped positionally into `(group, group, attitude)`
 * triples keyed by tag-group **names**. This is a global hierarchy the game
 * loads from `attitude_groups.csv` (`witcher3.exe` carries the path in a help
 * string; the CSV is a single-column list of 866 identifiers). It says what
 * attitude `mq1006_harassing_monster` holds towards `borys_the_troll` — it does
 * **not** say how any particular NPC feels about the player, and nothing in
 * this module may be labelled that way. `actorAttitudes`, the mechanism that
 * would carry a per-actor override, is a 14-byte block declaring a count of 0 on
 * both fixtures: **empty**, and reported as such rather than omitted.
 *
 * The `attitude_value` column is declared `array:2,0,EAIAttitude` but its
 * elements are two-byte `CName`s, not packed integers. Reading it as declared
 * yields three meaningless integers; re-reflecting it as `array:2,0,CName`
 * resolves exactly three names — `AIA_Friendly`, `AIA_Hostile`, `AIA_Neutral`.
 * That re-reflect is what makes the column a table rather than noise, so it is
 * done here and the names are resolved through **that save's own** `MANU`
 * table: as everywhere else in this decoder, an enum name is a 1-based index
 * into the save's own symbol pool, not an ordinal.
 *
 * ## The input is the **decompressed** stream
 *
 * `readDialogues` takes `decompressContainer(file).data`, as `readFactDB` does.
 * The trap is worth naming: handed the compressed container instead,
 * `readNameTable` does **not** throw — LZ4 stores long runs literally and the
 * `MANU` magic survives in the payload, so it returns a *wrong* name table and
 * every name resolved through it is a plausible lie.
 */

import { readNameTable } from "./names";
import type { ObjectNode } from "./objects";
import { readObjectTree } from "./objects";
import { reflectValue } from "./reflect";
import { parseTokens, type Token } from "./tokens";

/**
 * How many dialogue rows a summary carries.
 *
 * The full table is 152 rows on 52586 and 21 on 8559a, so the cap costs
 * nothing there; it exists so a longer table cannot flood a document. What is
 * dropped is the tail of the sample only — `guidCount` and `blockCount` are the
 * save's own totals and are never truncated, so a reader still knows how much it
 * is not being shown.
 */
export const DIALOG_SAMPLE_LIMIT = 32;

/**
 * How many attitude triples a summary carries.
 *
 * The non-neutral rows number 675 on 52586 and 647 on 8559a, so the cap is the
 * binding limit here rather than on the dialogue table. Dropped: the tail of the
 * non-neutral sample. `nonNeutralCount` and `valueCounts` are totals over the
 * whole table and are unaffected.
 */
export const ATTITUDE_SAMPLE_LIMIT = 48;

/** The attitude name that carries no information, excluded from the sample. */
export const NEUTRAL_ATTITUDE = "AIA_Neutral";

/** The `MANU` name of the block whose columns are the attitude triples. */
const ATTITUDES_BLOCK = "attitudes";

/** The `MANU` name of the block holding the group→parent forest. */
const PARENT_GROUPS_BLOCK = "parentGroups";

/** The `MANU` name of the (empty on every save measured) per-actor override. */
const ACTOR_ATTITUDES_BLOCK = "actorAttitudes";

/**
 * The byte width of the common `ExternalDialog` span: the 4-byte `BS` header,
 * `tag` (6 + 2), `dialogsCount` (6 + 4) and one `guid` (6 + 16).
 *
 * Used **only** when the span index has no entry for a block, i.e. as the
 * fallback the single-guid shape implies. It is wrong for a block carrying more
 * than one guid, which is the defect this module exists to fix, so it is
 * applied last and never preferred.
 */
const SINGLE_GUID_BLOCK_BYTES = 44;

/** The declared element type of the attitude column, whose elements are CNames. */
const ATTITUDE_COLUMN_TYPE = "array:2,0,EAIAttitude";

/** The element type the attitude column is really written as. */
const CNAME_ARRAY_TYPE = "array:2,0,CName";

/** One `ExternalDialog` block: its speaker and every guid it carries. */
type ExternalDialogBlock = {
	/** the resolved speaker/scene tag name, or `null` when the index resolves to nothing */
	readonly speaker: string | null;
	/** every `guid` in the block, as 32 lowercase hex digits, in stream order */
	readonly guids: readonly string[];
	/** the block's own `dialogsCount`, or `null` when it is absent */
	readonly dialogsCount: number | null;
};

/** One dialogue reference, flattened to a single guid. */
export type PendingDialog = {
	/** the speaker/scene tag name, or `null` when the `MANU` index resolves to nothing */
	readonly speaker: string | null;
	/** the 16-byte dialogue id, as 32 lowercase hex digits */
	readonly guid: string;
	/**
	 * whether some `questBlock` elsewhere in the save carries this guid as its
	 * `GUID` — i.e. whether the scene id resolves to the block that plays it
	 */
	readonly hasQuestBlockReference: boolean;
	/** the enclosing block's `dialogsCount`, which is 2 for a multi-guid block */
	readonly dialogsCount: number | null;
};

/** The pending external-scene dialog references of one save. */
export type PendingDialogs = {
	/** `ExternalDialog` blocks found */
	readonly blockCount: number;
	/** distinct guids across all blocks — greater than `blockCount` when a block carries several */
	readonly guidCount: number;
	/** blocks carrying more than one guid; 4 on 52586, 0 on 8559a */
	readonly blocksWithMultipleGuids: number;
	/** blocks every one of whose guids a `questBlock` references */
	readonly blocksReferencedByQuestBlock: number;
	/** distinct guids no `questBlock` carries — measured 0 on both fixtures */
	readonly orphanGuidCount: number;
	/** at most `DIALOG_SAMPLE_LIMIT` rows, in the save's own order */
	readonly sample: readonly PendingDialog[];
};

/** One `(group, group, attitude)` row of the global attitude table. */
export type AttitudePair = {
	/** the row's first group name, or `null` when it does not resolve */
	readonly group: string | null;
	/** the row's second group name, or `null` when it does not resolve */
	readonly against: string | null;
	/** the `AIA_*` name, or `null` when it does not resolve */
	readonly attitude: string | null;
};

/** One distinct attitude name and how many rows carry it. */
export type AttitudeValueCount = {
	/** the resolved `AIA_*` name */
	readonly attitude: string;
	readonly count: number;
};

/** The global attitude-group matrix of one save. */
export type AttitudeMatrix = {
	/** rows in `attitudes`, i.e. the number of group×group pairs; `null` when the block is absent */
	readonly groupCount: number | null;
	/** keys in `parentGroups`, i.e. the groups this playthrough used; `null` when absent */
	readonly parentGroupCount: number | null;
	/** distinct parent names in `parentGroups` */
	readonly distinctParentCount: number | null;
	/** rows whose group names or attitude name did not resolve */
	readonly unresolvedRowCount: number;
	/** rows carrying a name other than `AIA_Neutral` */
	readonly nonNeutralCount: number;
	/** one entry per distinct attitude name, ascending by name; empty when the block is absent */
	readonly valueCounts: readonly AttitudeValueCount[];
	/** `actorAttitudes`' declared row count; 0 on both fixtures, `null` when the block is absent */
	readonly actorAttitudeCount: number | null;
	/** at most `ATTITUDE_SAMPLE_LIMIT` non-neutral rows, in the save's own order */
	readonly sample: readonly AttitudePair[];
};

/** Both readings of one save, from one token walk. */
export type DialogueRead = {
	readonly dialogs: PendingDialogs;
	readonly attitudes: AttitudeMatrix;
};

/**
 * The symbolic name a two-byte `CName` refers to, or `null`.
 *
 * `null` covers both ways a CName can fail to name something: index 0, which is
 * the save's "no name" slot, and an index past the end of this save's own
 * `MANU` table. Both are reported as absent rather than as a neighbour's name —
 * a save's table is its own symbol pool, and a name from a different build's
 * table would be a plausible lie.
 *
 * Exported because it is the rule the whole decoder rests on: a CName is a
 * 1-based index into the *save's* table, so the same tag is a different number
 * on every build (`priscilla` is index 3275 on 52586).
 */
export const resolveCName = (
	names: readonly string[],
	bytes: Uint8Array,
): string | null => {
	if (bytes.length < 2) return null;
	const index = (bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8);
	if (index < 1) return null;
	return names[index - 1] ?? null;
};

/**
 * The same rule for a `ReflectedValue`, which renders a `CName` as the text
 * `CName(index)` rather than carrying its bytes.
 */
const cnameText = (
	names: readonly string[],
	text: string,
): string | null => {
	const match = text.match(/CName\((\d+)\)/);
	if (match === null) return null;
	const index = Number(match[1]);
	return index >= 1 ? names[index - 1] ?? null : null;
};

/** Every node of the forest, flattened, with each node's span end indexed. */
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

/**
 * The offsets of every token at or after `from`, by binary search.
 *
 * The token walk is ordered and non-overlapping, so this is a search over a
 * sorted array rather than a filter. It exists because "which tokens fall
 * inside this span" is asked once per `questBlock` — 2,927 times on 52586 — and
 * answering it by scanning the whole 250,640-token list each time would be
 * 700 million comparisons.
 */
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

/**
 * Every guid a `questBlock` carries as its `GUID`.
 *
 * `questBlock` is the node the cross-reference runs *through*: a pending scene
 * guid and a quest-block guid are the same 16 bytes, which is what turns an
 * opaque id into something a quest thread plays.
 */
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

/**
 * One `ExternalDialog` block, with its window taken from the span index.
 *
 * The window is what makes the multi-guid case readable: a block's extent is
 * stated by the engine's `SC` index and nowhere else, so a fixed 44-byte window
 * truncates the second guid off 4 of 152 blocks on 52586. The fixed width is
 * kept only as the fallback for a block the index does not list.
 */
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
		// `GUID` is accepted alongside the measured `guid` because a block's
		// window can overlap a following block's header; `guid` is the only
		// name measured inside `ExternalDialog` on either fixture.
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

/** Every `ExternalDialog` block in the stream, in order. */
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

/**
 * The pending external-scene dialog references, named and cross-referenced.
 *
 * Split out from `readDialogues` so both readings can share the one token walk
 * and the one span index they are given. Not exported: `readDialogues` is the
 * entry point, and an exported reader that takes the walk's own intermediates
 * would only invite a second walk.
 */
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
	// Counted as a set, not as a tally: 155 distinct guids occupy 156 slots on
	// 52586 (one dialog is referenced from two blocks), and a tally compared
	// against the distinct count reports **-1** orphans. Counting occurrences was
	// a real bug here, caught by the orphan assertion being asked for zero.
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

/** The top-level root named `name`, or `undefined` when the save has none. */
const rootNamed = (
	roots: readonly ObjectNode[],
	name: string,
): ObjectNode | undefined => roots.find((node) => node.span.token.name === name);

/**
 * One array column of a top-level block, resolved to names.
 *
 * Columns are looked up by their `MANU` **name** (`"1"`, `"2"`, `"a"`) rather
 * than by position: the names are what the engine's field-registration run in
 * `witcher3.exe` gives, and reading by position would make a build that adds a
 * column silently shift the other two.
 */
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
	// The attitude column is declared as an enum array but written as CNames;
	// reflecting it as declared yields three meaningless integers.
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

/** `actorAttitudes`' declared row count, or `null` when the block is absent. */
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

/**
 * The global attitude-group matrix: the triples, their value histogram, the
 * parent forest's size, and a capped sample of the non-neutral rows.
 *
 * Zipped positionally because the three columns are parallel arrays of equal
 * length and the file says nothing else about which row belongs to which pair.
 * A row short of either name column is not invented and not dropped from the
 * counts — it is counted in `unresolvedRowCount` and `valueCounts`.
 */
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

	const rows = Math.min(
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
		if (attitude === NEUTRAL_ATTITUDE) continue;
		nonNeutral += 1;
		if (sample.length < ATTITUDE_SAMPLE_LIMIT) {
			sample.push({ group, against, attitude });
		}
	}

	return {
		groupCount: first === undefined ? null : rows,
		parentGroupCount: parentKeys?.length ?? null,
		distinctParentCount:
			parentNames === undefined
				? null
				: new Set(parentNames).size,
		unresolvedRowCount: unresolved,
		nonNeutralCount: nonNeutral,
		valueCounts: [...histogram]
			.map(([attitude, count]) => ({ attitude, count }))
			.sort((a, b) => (a.attitude < b.attitude ? -1 : 1)),
		actorAttitudeCount: readActorAttitudeCount(
			tokens,
			rootNamed(roots, ACTOR_ATTITUDES_BLOCK),
		),
		sample,
	};
};

/**
 * Both readings of one save, from **one** token walk.
 *
 * The walk is the expensive half — 39,309 tokens on the 8559a fixture and
 * 250,640 on 52586 — and both readings need it, so they are read together
 * rather than by two calls that each walk the stream. The span index is built
 * once for the same reason.
 */
export const readDialogues = (data: Uint8Array): DialogueRead => {
	const names = readNameTable(data).names;
	const tokens = parseTokens(data, names).tokens;
	const tree = indexTree(readObjectTree(data).roots);
	return {
		dialogs: readPendingDialogs(names, tokens, tree),
		attitudes: readAttitudeMatrix(data, names, tokens, tree.roots),
	};
};