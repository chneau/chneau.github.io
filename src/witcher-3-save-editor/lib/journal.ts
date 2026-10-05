/**
 * The journal read — the game's own record of quest state.
 *
 * ## Why this exists at all
 *
 * `quests.ts` derives quest progress from the **fact** database by matching a
 * name suffix (`_done`, `_failed`, `_accepted`). That is a heuristic over
 * script-authored names, and it disagrees with the game's own journal on a
 * large enough fraction of quests to be worth correcting. Measured on the two
 * tracked fixtures, against the definition "the quest is finished iff the
 * journal holds a `JS_Success` entry and no `JS_Active` one": 4 of 7 comparable
 * quests on `8559a` and 7 of 26 on `52586` disagree — in every case the fact
 * side reporting a quest in progress that the journal records as succeeded.
 *
 * This module is the authoritative read, and it is **read-only**: it changes
 * nothing in the save and holds no state between calls.
 *
 * ## How the entries are found
 *
 * Every quest entry is an `SJournalEntryStatus` object nested somewhere under
 * `CJournalManager`, and the object tree already carries its byte span. The walk
 * is over that **span**, not over a declared element count. That is measured,
 * not stylistic: on the `66/29` and `66/29`-adjacent builds the declared count
 * desynchronises from the token stream and reads every status as `JS_Active`,
 * which is indistinguishable from a real answer. `objects.ts` already resolves
 * the spans, so this module reuses them rather than re-deriving a count.
 *
 * ## How an entry is attributed to a quest
 *
 * An entry's span holds a *chain* of `CJournalPath` links, one per level of
 * resource nesting, each contributing `guid`, `flags` and `resource` tokens. Only
 * the innermost link — the one whose `flags` have bit 0 set — is the entry's own
 * resource; the rest are the `.journal` files it lives under. Measured: every
 * entry has exactly one such link, and it is always the last, so 0 violations
 * over the 1,268 entries of the two fixtures.
 *
 * The quest id is that resource's **filename**, prefix-matched: the game stores
 * `gameplay\journal\main\mq0001.journal`, and `mq0001` is a textual prefix of
 * the basename. No game install is involved, so ids are available from the save
 * alone. Titles are a different matter and are not available here — see
 * `JournalQuest.title`.
 *
 * ## What this read deliberately does not claim
 *
 * - **The journal is a partial view.** On `52586`, 17 of the 43 quests the fact
 *   database mentions have no journal entry at all — they were touched only
 *   through facts. Absence here is not "not started"; it means the journal says
 *   nothing. Nothing in the return type can be read as a complete quest list.
 * - **Most entries cannot be attributed.** On `8559a` 202 of 296 entries have an
 *   empty head resource and on `52586` 650 of 972 do; these are unattributable
 *   sub-entries. They are counted in `unattributed` and never spread across
 *   quests.
 * - **`JHuntingClues`, `JMonsterKnown` and `JEntryAdvancedInfo` are unnamed.**
 *   Only their guid sets are in the save; nothing maps a guid to a quest, so
 *   only their node counts are reported.
 * - **A quest can hold several entries with different statuses.** `mq0003` is
 *   `JS_Success` *and* `JS_Active` on both fixtures. The raw per-status counts
 *   are the primary output; `rollup` is a documented precedence over them and
 *   `contested` records that a precedence was applied at all.
 */

import { questTitle } from "./catalog";
import { readNameTable } from "./names";
import { type ObjectNode, readObjectTree } from "./objects";
import { readTokenAt } from "./tokens";

/** How many entries `sample` carries. */
export const JOURNAL_SAMPLE_LIMIT = 40;

/**
 * The token that opens a quest entry in the object tree.
 *
 * A literal because it is what the engine names the structure; there is no
 * enum in the save to read it from. It matches 296 nodes on `8559a` and 972 on
 * `52586`, all of them inside that save's single `CJournalManager`.
 */
const ENTRY_TOKEN = "SJournalEntryStatus";

/**
 * Quest ids in a resource filename, by textual prefix.
 *
 * A prefix rather than an equality because the filenames carry suffixes the
 * script author chose (`mq0003_brothers.journal`); the id is the leading
 * `q`/`mq`/`sq` plus digits. Three or four digits, because both `q001`-style
 * and `mq1005`-style ids occur and the four-digit form must not be read as a
 * three-digit id followed by a stray digit.
 */
const QUEST_ID = /^(mq|sq|q)\d{3,4}/i;

/**
 * The journal status names this module knows how to roll up, in precedence
 * order — most significant first.
 *
 * Deliberately a **list of known names**, not an open enumeration of whatever
 * the save's `MANU` happens to contain: a build that adds a fifth status must
 * still have its entries counted (they are, in `statuses`) while the roll-up
 * declines to invent an ordering for a name it has never seen and says
 * `unresolved` instead. `JS_Failed` is measured, present on `52586` (7 entries,
 * none of them attributable to a quest) and absent from `8559a`'s table
 * entirely.
 */
const ROLLUP_PRECEDENCE: readonly string[] = [
	"JS_Failed",
	"JS_Success",
	"JS_Active",
	"JS_Inactive",
] as const;

/** Status name used when the entry's status index does not resolve. */
const UNRESOLVED_STATUS = "JS_Unresolved";

/** One status name and how many entries carry it. */
type JournalStatusCount = {
	/**
	 * The status name as resolved through **this save's own** `MANU` table.
	 *
	 * A name, not an enum member: the table is per-build and the indices differ
	 * between builds, so a fixed list would silently mis-label one of them. An
	 * index that does not resolve reads as `JS_Unresolved` rather than being
	 * dropped.
	 */
	readonly status: string;
	readonly entries: number;
};

/** The coarse state `rollup` reports. */
type JournalRollup =
	| "failed"
	| "succeeded"
	| "active"
	| "inactive"
	| "unresolved";

/** One quest the journal has at least one entry for. */
type JournalQuest = {
	/** Normalised quest id, e.g. `mq0003`, `q002`, `sq305`. */
	readonly id: string;
	/**
	 * The quest's title, or `undefined` when the catalogue does not resolve it.
	 *
	 * `questTitle` is the only title source available without a game install —
	 * the `.journal` assets that carry the display names are game files — and it
	 * resolves 236 of the 253 ids it ships. Ten of the 43 quest ids on `52586`
	 * resolve to nothing, so `undefined` here is normal and the id is left for
	 * the caller to render; the raw id is never echoed back *as* a title.
	 */
	readonly title: string | undefined;
	/** entries attributed to this quest, in total */
	readonly entries: number;
	/**
	 * Every status this quest has an entry with, and how many entries each.
	 *
	 * The primary output. It is a list rather than three fields because a
	 * quest genuinely holds several statuses at once and a fixed shape would
	 * have to drop one of them.
	 */
	readonly statuses: readonly JournalStatusCount[];
	/**
	 * `ROLLUP_PRECEDENCE`'s first status present in `statuses`, or
	 * `"unresolved"` when none is.
	 *
	 * A precedence over the entries, not a second opinion: `q001` on `52586`
	 * holds three `JS_Success` entries and rolls up to `succeeded`, which is
	 * what those three say. Where a quest holds *conflicting* statuses the
	 * precedence picks one and `contested` says so — `mq0003` is `JS_Success`
	 * and `JS_Active`, and reading that as `succeeded` without the flag would
	 * claim the game considers the quest closed.
	 */
	readonly rollup: JournalRollup;
	/** `statuses.length > 1`: the roll-up resolved a disagreement. */
	readonly contested: boolean;
};

/** Entries the journal holds that no quest id could be read from. */
type JournalUnattributed = {
	/**
	 * Entries whose innermost `CJournalPath` has an empty resource. Measured
	 * 202 of 296 on `8559a` and 650 of 972 on `52586`.
	 *
	 * The majority of entries are unattributable, which is the single most
	 * important thing for a caller to know before rendering them as quests.
	 */
	readonly emptyResource: number;
	/**
	 * Entries with a resource whose filename is not a quest id — the
	 * `.journal` container files such as `jedlc01.journal`. Measured 83 and
	 * 285. These are named, but naming a container is not naming a quest.
	 */
	readonly nonQuestResource: number;
};

/**
 * A named collection the journal keeps, with no established meaning.
 *
 * Only node and guid counts are reported. Nothing in the save maps a
 * `JHuntingCluesGuid` to a quest, and guessing at the semantics — "hunting clue
 * known", "advanced info seen" — would be inventing a reading, so the module
 * does not offer one.
 */
type JournalCollection = {
	/** The engine's own name for the collection, e.g. `JMonsterKnown`. */
	readonly name: string;
	/** objects with this name in the tree; 1 per collection on both fixtures */
	readonly nodes: number;
	/**
	 * Every descendant node's own name and how many there are, grouped.
	 *
	 * Reported per name rather than as one `guids` count because the three
	 * collections do **not** share a member shape: `JMonsterKnown` and
	 * `JEntryAdvancedInfo` hold `<name>Guid` nodes, while `JHuntingClues` holds
	 * `JHuntingClue` records each wrapping a `JHuntingQuestGuid`. A single
	 * `guids` field would have had to flatten that difference into whichever
	 * shape was assumed, which is the guessing this module does not do. `Size`
	 * appears once per member — it is the collection's element count, read as a
	 * node like any other and named as the save names it.
	 */
	readonly members: readonly JournalMemberCount[];
};

/** How many descendants of a collection carry a given name. */
type JournalMemberCount = {
	/** the node's own MANU name, verbatim */
	readonly name: string;
	readonly count: number;
};

/** One entry as listed in `sample`. */
type JournalSampleEntry = {
	/**
	 * The quest id read from the entry's innermost resource, or `undefined`
	 * when there was none. `undefined` means unattributable, not "unknown
	 * quest" — the count of those is `unattributed.emptyResource`.
	 */
	readonly questId: string | undefined;
	/** Status name resolved through this save's own `MANU`. */
	readonly status: string;
};

/** Everything one save's journal says, and what it cannot say. */
export type SaveJournal = {
	/** `SJournalEntryStatus` objects found; 296 on `8559a`, 972 on `52586` */
	readonly entries: number;
	/**
	 * Entry count per status name, across every entry including the
	 * unattributable ones.
	 *
	 * The sum equals `entries`. A build's fourth status (`JS_Failed` on
	 * `52586`) appears here as its own row rather than being folded into
	 * another.
	 */
	readonly statuses: readonly JournalStatusCount[];
	/** entries no quest id could be read from, by reason */
	readonly unattributed: JournalUnattributed;
	/** quests with at least one attributed entry; 8 on `8559a`, 29 on `52586` */
	readonly quests: readonly JournalQuest[];
	/** `quests.length`, for callers that only want the number */
	readonly questCount: number;
	/** the unnamed guid collections, with their counts */
	readonly collections: readonly JournalCollection[];
	/**
	 * Up to `JOURNAL_SAMPLE_LIMIT` **attributed** entries, in the order the
	 * walk found them.
	 *
	 * **Dropped:** the unattributable entries first, then attributed entries
	 * past the limit. The first exclusion is measured, not tidiness — 39 of the
	 * first 40 entries of the walk have an empty head resource on *both*
	 * fixtures, because the walk meets the tutorial `.journal` files before it
	 * reaches any quest resource. A sample that is 97% rows with no `questId` is
	 * a count wearing a sample's clothes, and those entries' number is already
	 * `unattributed.emptyResource`.
	 *
	 * So this is a sample of the *attributed* entries and is not a sample of the
	 * save's entries: `entries` is the count of those. On both fixtures the
	 * attributed count (11 and 37) is under the cap, so `sample` is the
	 * complete attributed list and `sampleTruncated` is `false` — the cap is a
	 * guard for a save holding more quests than these two do, not behaviour
	 * either of them exhibits.
	 */
	readonly sample: readonly JournalSampleEntry[];
	/**
	 * `true` when attributed entries were dropped to reach the limit.
	 *
	 * Against the attributed count, which is what the sample is drawn from — not
	 * `entries > JOURNAL_SAMPLE_LIMIT`, which is `true` on both fixtures even
	 * though `sample` holds every attributed entry there is.
	 */
	readonly sampleTruncated: boolean;
};

/** Inputs the caller may already have, to avoid re-reading them. */
type JournalSource = {
	/**
	 * This save's `MANU` names. Pass them when the caller has already read the
	 * name table; `readNameTable` costs 98 ms on the large fixture and its
	 * result is needed to resolve every status name.
	 */
	readonly names?: readonly string[];
	/**
	 * The object tree's roots, from `readObjectTree(data).roots`.
	 *
	 * The reason this option exists: building the tree costs 246 ms on the
	 * large fixture, and `readObjectTree` takes only `data`, so a caller that
	 * already has a tree cannot hand it over through any existing signature.
	 * Pass it and the 246 ms is not paid twice.
	 */
	readonly roots?: readonly ObjectNode[];
};

/** Read a `u16` at `offset`, treating a byte past the end as 0. */
const u16 = (data: Uint8Array, offset: number): number =>
	(data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8);

/** The quest id a resource filename carries, or `undefined`. */
const questIdOfResource = (resource: string): string | undefined => {
	const filename = resource.split("\\").pop() ?? "";
	const match = QUEST_ID.exec(filename);
	if (match === null) return undefined;
	return match[0].toLowerCase();
};

/** Flatten the tree, because the span search is over every node at any depth. */
const flatten = (nodes: readonly ObjectNode[], into: ObjectNode[]): void => {
	for (const node of nodes) {
		into.push(node);
		flatten(node.children, into);
	}
};

/** One entry's own reading: the innermost resource and the status index. */
type EntryReading = {
	/** the innermost `CJournalPath` resource, `""` when it carried none */
	readonly resource: string;
	/** the raw `MANU` index of `status`, 1-based as the grammar reads it */
	readonly statusIndex: number;
};

/**
 * Read one entry's span.
 *
 * The span is walked token by token because the chain's length is not recorded
 * anywhere: the links are siblings inside the entry's frame and only the span
 * says where they stop. The walk starts four bytes in, past the entry's own
 * `BS` header, which is where its fields begin.
 *
 * A link opens on its `guid` token and is closed by whatever follows, so
 * `flags` and `resource` are attributed to the link currently open. The head is
 * the last link seen rather than a search for `flags & 1`: both rules pick the
 * same link on all 1,268 fixture entries (exactly one link per entry has bit 0
 * set, and it is always last), and "last" is the one that cannot be wrong by
 * being wrong about what `flags` means.
 */
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
			// A new link opens: whatever the previous one held is settled, and an
			// empty resource is the measured shape of a non-head link's absence,
			// so `resource` is reset rather than carried forward.
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

/** The `MANU` name a status index points at, or the unresolved marker. */
const statusName = (names: readonly string[], statusIndex: number): string =>
	names[statusIndex - 1] ?? UNRESOLVED_STATUS;

/**
 * Where a status name sits in `ROLLUP_PRECEDENCE`, or after all of them.
 *
 * A name the module does not know ranks last, so an unrecognised status sorts
 * below a known one and never displaces one in the roll-up.
 */
const precedenceRank = (status: string): number => {
	const index = ROLLUP_PRECEDENCE.indexOf(status);
	return index < 0 ? ROLLUP_PRECEDENCE.length : index;
};

/**
 * `ROLLUP_PRECEDENCE`'s first name present in `statuses`, else unresolved.
 *
 * The names are mapped by a lookup rather than by string surgery on the prefix:
 * `JS_Success` → `succeeded` is a reading, and the mapping is written out once
 * here so there is one place that can be wrong.
 */
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

/** Count a name into a `Map`, as its own row rather than folded into another. */
const tally = (into: Map<string, number>, name: string): void => {
	into.set(name, (into.get(name) ?? 0) + 1);
};

/**
 * The three guid collections, with their members counted per node name.
 *
 * The names are literals for the same reason the entry token is: they are what
 * the engine calls the structures. What they *mean* is not read, because nothing
 * in the save maps a guid to a quest — so this counts and stops.
 */
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
	// A second pass, now that every collection is known: any node whose parent
	// chain reaches one of them is a member of it. The flattened list is in
	// span order, which is containment order, so a single running stack is
	// enough — a node belongs to the innermost open collection.
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

/**
 * Read the journal of one decompressed save.
 *
 * `source` exists for cost, not for behaviour: passing `names` or `roots`
 * changes only which reads are repeated, never the result.
 */
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
				// Count first, then `ROLLUP_PRECEDENCE`, then name: so a contested
				// quest lists the status its `rollup` names first and a reader
				// scanning the row sees the roll-up before the runner-up.
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
		questCount: quests.length,
		collections: readCollections(nodes),
		sample,
		sampleTruncated: attributed > JOURNAL_SAMPLE_LIMIT,
	};
};
