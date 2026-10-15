import { questTitle } from "./catalog";
import { readNameTable } from "./names";
import { type ObjectNode, readObjectTree } from "./objects";
import { readTokenAt } from "./tokens";

export const JOURNAL_SAMPLE_LIMIT = 40;

const ENTRY_TOKEN = "SJournalEntryStatus";

const QUEST_ID = /^(mq|sq|q)\d{3,4}/i;

const ROLLUP_PRECEDENCE: readonly string[] = [
	"JS_Failed",
	"JS_Success",
	"JS_Active",
	"JS_Inactive",
] as const;

const UNRESOLVED_STATUS = "JS_Unresolved";

type JournalStatusCount = {
	readonly status: string;
	readonly entries: number;
};

type JournalRollup =
	| "failed"
	| "succeeded"
	| "active"
	| "inactive"
	| "unresolved";

type JournalQuest = {
	readonly id: string;
	readonly title: string | undefined;
	readonly entries: number;
	readonly statuses: readonly JournalStatusCount[];
	readonly rollup: JournalRollup;
	readonly contested: boolean;
};

type JournalUnattributed = {
	readonly emptyResource: number;
	readonly nonQuestResource: number;
};

type JournalCollection = {
	readonly name: string;
	readonly nodes: number;
	readonly members: readonly JournalMemberCount[];
};

type JournalMemberCount = {
	readonly name: string;
	readonly count: number;
};

type JournalSampleEntry = {
	readonly questId: string | undefined;
	readonly status: string;
};

export type SaveJournal = {
	readonly entries: number;
	readonly statuses: readonly JournalStatusCount[];
	readonly unattributed: JournalUnattributed;
	readonly quests: readonly JournalQuest[];
	readonly collections: readonly JournalCollection[];
	readonly sample: readonly JournalSampleEntry[];
	readonly sampleTruncated: boolean;
};

type JournalSource = {
	readonly names?: readonly string[];
	readonly roots?: readonly ObjectNode[];
};

const u16 = (data: Uint8Array, offset: number): number =>
	(data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8);

const questIdOfResource = (resource: string): string | undefined => {
	const filename = resource.split("\\").pop() ?? "";
	const match = QUEST_ID.exec(filename);
	if (match === null) return undefined;
	return match[0].toLowerCase();
};

const flatten = (nodes: readonly ObjectNode[], into: ObjectNode[]): void => {
	for (const node of nodes) {
		into.push(node);
		flatten(node.children, into);
	}
};

type EntryReading = {
	readonly resource: string;
	readonly statusIndex: number;
};

const readEntry = (
	data: Uint8Array,
	names: readonly string[],
	entry: ObjectNode,
): EntryReading => {
	let at = entry.span.offset + 4;
	let resource = "";
	let statusIndex = 0;
	let linkOpen = false;
	while (at < entry.span.end) {
		const token = readTokenAt(data, names, at);
		if (token === undefined) break;
		if (token.name === "guid") {
			resource = "";
			linkOpen = true;
		} else if (token.name === "resource" && linkOpen) {
			resource = token.value?.text ?? "";
		} else if (token.name === "status") {
			statusIndex = u16(data, at + 6);
		}
		at += token.size;
	}
	return { resource, statusIndex };
};

const statusName = (names: readonly string[], statusIndex: number): string =>
	names[statusIndex - 1] ?? UNRESOLVED_STATUS;

const precedenceRank = (status: string): number => {
	const index = ROLLUP_PRECEDENCE.indexOf(status);
	return index < 0 ? ROLLUP_PRECEDENCE.length : index;
};

const ROLLUP_OF_STATUS: ReadonlyMap<string, JournalRollup> = new Map([
	["JS_Failed", "failed"],
	["JS_Success", "succeeded"],
	["JS_Active", "active"],
	["JS_Inactive", "inactive"],
]);

const rollupOf = (statuses: readonly string[]): JournalRollup => {
	for (const known of ROLLUP_PRECEDENCE) {
		const rollup = ROLLUP_OF_STATUS.get(known);
		if (rollup !== undefined && statuses.includes(known)) return rollup;
	}
	return "unresolved";
};

const tally = (into: Map<string, number>, name: string): void => {
	into.set(name, (into.get(name) ?? 0) + 1);
};

const readCollections = (nodes: readonly ObjectNode[]): JournalCollection[] => {
	const wanted = ["JHuntingClues", "JMonsterKnown", "JEntryAdvancedInfo"];
	const nodeCounts = new Map<string, number>();
	const memberCounts = new Map<string, Map<string, number>>();
	for (const node of nodes) {
		const name = node.span.token.name;
		if (wanted.includes(name)) {
			tally(nodeCounts, name);
			if (!memberCounts.has(name)) memberCounts.set(name, new Map());
		}
	}
	const open: { readonly name: string; readonly end: number }[] = [];
	for (const node of nodes) {
		while (
			open.length > 0 &&
			node.span.offset >= (open[open.length - 1]?.end ?? 0)
		) {
			open.pop();
		}
		const owner = open[open.length - 1];
		if (owner !== undefined && node.span.token.name !== owner.name) {
			tally(memberCounts.get(owner.name) ?? new Map(), node.span.token.name);
		}
		if (wanted.includes(node.span.token.name)) {
			open.push({ name: node.span.token.name, end: node.span.end });
		}
	}
	return wanted.flatMap((name) => {
		const count = nodeCounts.get(name) ?? 0;
		if (count === 0) return [];
		return [
			{
				name,
				nodes: count,
				members: [...(memberCounts.get(name) ?? new Map())]
					.map(([member, total]) => ({ name: member, count: total }))
					.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
			},
		];
	});
};

export const readJournal = (
	data: Uint8Array,
	source: JournalSource = {},
): SaveJournal => {
	const names = source.names ?? readNameTable(data).names;
	const roots = source.roots ?? readObjectTree(data).roots;
	const nodes: ObjectNode[] = [];
	flatten(roots, nodes);

	const entries = nodes.filter((node) => node.span.token.name === ENTRY_TOKEN);
	const perStatus = new Map<string, number>();
	const unattributed = { emptyResource: 0, nonQuestResource: 0 };
	const perQuest = new Map<string, string[]>();
	const sample: JournalSampleEntry[] = [];
	let attributed = 0;

	for (const entry of entries) {
		const reading = readEntry(data, names, entry);
		const status = statusName(names, reading.statusIndex);
		tally(perStatus, status);
		if (reading.resource === "") {
			unattributed.emptyResource += 1;
			continue;
		}
		const id = questIdOfResource(reading.resource);
		if (id === undefined) {
			unattributed.nonQuestResource += 1;
			continue;
		}
		attributed += 1;
		if (sample.length < JOURNAL_SAMPLE_LIMIT)
			sample.push({ questId: id, status });
		const previous = perQuest.get(id);
		perQuest.set(id, previous === undefined ? [status] : [...previous, status]);
	}

	const quests: JournalQuest[] = [...perQuest].map(([id, statuses]) => {
		const counts = new Map<string, number>();
		for (const status of statuses) tally(counts, status);
		const distinct = [...counts.keys()];
		return {
			id,
			title: questTitle(id),
			entries: statuses.length,
			statuses: distinct
				.map((status) => ({ status, entries: counts.get(status) ?? 0 }))
				.sort(
					(a, b) =>
						b.entries - a.entries ||
						precedenceRank(a.status) - precedenceRank(b.status) ||
						a.status.localeCompare(b.status),
				),
			rollup: rollupOf(distinct),
			contested: distinct.length > 1,
		};
	});
	quests.sort((a, b) => b.entries - a.entries || a.id.localeCompare(b.id));

	return {
		entries: entries.length,
		statuses: [...perStatus]
			.map(([status, count]) => ({ status, entries: count }))
			.sort(
				(a, b) => b.entries - a.entries || a.status.localeCompare(b.status),
			),
		unattributed,
		quests,
		collections: readCollections(nodes),
		sample,
		sampleTruncated: attributed > JOURNAL_SAMPLE_LIMIT,
	};
};
