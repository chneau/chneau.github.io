/**
 * Per-quest step detail, read from the fact database.
 *
 * ## What this is, and what it is not
 *
 * Everything here is a **fact-DB reading**, and a fact DB is not the journal.
 * The reference decoder's `docs/re-engineering/11-quests.md` establishes that a
 * save keeps quest state in three unrelated places, and that the journal
 * (`JActiveEntries` and friends) is the authoritative one:
 *
 * > Comparing the journal status against "some fact matching
 * > `_done$|_completed?$` is non-zero" agrees on only 3/7 quests in the
 * > reference save and 13/26 in the `52586` save. The journal is
 * > authoritative; the fact heuristic is a guess.
 *
 * So this module deliberately says nothing about completion. It reports **what
 * a fact recorded and when** — which is measured — and it names no field
 * `completed`, `finished` or `state`, because no byte in the fact DB
 * establishes those. The coarse ladder in `questProgress` (`./quests`) is the
 * site's existing guess; it is not repeated or re-derived here.
 *
 * ## The two conventions this depends on, neither stored by the game
 *
 *  1. **A quest id is a name prefix.** `/^(mq|sq|q)\d{3,4}(?:_|$)/` on a fact
 *     name. There is no stored link from a fact to a quest: the same
 *     re-engineering doc proves the quest id appears nowhere else in a save
 *     (68 raw occurrences on the reference save, 24 in the fact DB and 44 in
 *     journal resource strings, zero elsewhere), and the two sides join by
 *     textual convention only.
 *  2. **`kind` is that prefix's spelling, not the game's classification.**
 *     `mq`/`sq`/`q` are a scripting convention; nothing in a save records which
 *     of the three a quest is.
 *
 * A prefix also cannot distinguish two journal entries of one quest — the
 * reference save carries both `mq0003freshwater.journal` (`JS_Success`) and
 * `mq0003noonwraith.journal` (`JS_Active`) behind a single `mq0003` fact prefix
 * — so even a correct journal read folded onto these ids would be lossy.
 *
 * ## Fact names are script-chosen strings
 *
 * A name is whatever the script passed, and the reference decoder records a
 * real one carrying a control byte (`q203\x1f_what_happend`). Names are
 * therefore carried verbatim and are never sanitised, escaped or re-encoded: a
 * module that cleaned them up would be hiding a fact about the save, and one
 * that threw would let a single odd name lose the whole quest. (Measured: no
 * committed fixture holds one — 0 of 1,452 and 0 of 3,997 fact names contain a
 * byte outside printable ASCII.)
 *
 * ## Redundancy, measured away
 *
 * A fact's `value` is its event count and `entries.length` is the number of
 * events behind it. On both fixtures they are equal on **100 %** of records (0
 * mismatches in 1,452 and in 3,997), so one number is carried and the other is
 * not stored beside it.
 */

import { questTitle } from "./catalog";
import type { Fact } from "./facts";
import { questIdOf } from "./quests";

/**
 * Steps listed per quest. The largest measured quest is `q104` on the `52586`
 * save with 361 step records; this bounds a quest's panel, and what it drops is
 * named in `stepsDropped` rather than left as a silent truncation.
 */
export const MAX_QUEST_STEPS = 64;

/** Step names sampled across *all* a quest's steps, not only the kept ones. */
export const MAX_SAMPLED_STEP_NAMES = 24;

/** Event timestamps sampled per quest. The busiest measured quest has 74. */
export const MAX_SAMPLED_EVENT_TIMES = 16;

/** One quest step fact, as the save recorded it. */
type QuestStep = {
	/** the fact name verbatim, including any byte that is not printable */
	readonly name: string;
	/**
	 * Events the save recorded for this step. **0 means it never fired.**
	 *
	 * There is deliberately no separate `fired` boolean. It was here, and it was
	 * removed: the field is `events !== 0` and nothing else, so storing both gives
	 * the document two fields over one fact, and the workbench's round-trip check
	 * — which re-decodes a rebuild and compares the whole serialised document —
	 * is precisely what a field that can disagree with a sibling of itself breaks.
	 * The same reasoning removed `difficulty.name` from this projection. A caller
	 * wanting a boolean tests `events !== 0`, which is one expression and cannot
	 * drift from the number it is derived from.
	 *
	 * Measured: `value` equals `entries.length` for every record on both fixtures,
	 * so the event count is not itself a duplicate of anything else either.
	 */
	readonly events: number;
};

/**
 * A step plus the one derived ordering key, held apart from `QuestStep` so the
 * engine time that only the sort needs never reaches the projection.
 */
type OrderedStep = QuestStep & { readonly firstTime: number };

/**
 * One quest's steps and counts, from its facts alone.
 *
 * No offset appears anywhere: every field is a pure function of the fact list,
 * so the document is a projection rather than a view onto the bytes.
 */
type QuestStepDetail = {
	/** normalised quest id, e.g. `mq0001`, `q101`, `sq104` */
	readonly id: string;
	/** the quest's title, or `undefined` when the catalogue does not resolve it */
	readonly title: string | undefined;
	/** step records recorded for this quest, over the whole fact list */
	readonly stepsTotal: number;
	/** how many of them fired */
	readonly stepsFired: number;
	/** sum of every step's event count */
	readonly events: number;
	/** at most `MAX_QUEST_STEPS` steps; see `orderSteps` for which survive */
	readonly steps: readonly QuestStep[];
	/** `stepsTotal - steps.length`: records the cap dropped */
	readonly stepsDropped: number;
	/** an evenly spaced sample of the *names* of all `stepsTotal` steps */
	readonly stepNameSample: readonly string[];
	/** how many names `stepNameSample` omits */
	readonly stepNamesSampledOut: number;
	/** ascending, evenly spaced sample of the fired steps' event timestamps */
	readonly eventTimeSample: readonly number[];
	/** how many timestamps `eventTimeSample` omits */
	readonly eventTimesSampledOut: number;
};

/*
 * `questIdOf` used to be defined here as well, duplicating `./quests`'s copy of
 * the same regex. It is now imported from there: one regex, one owner. Two copies
 * would be two places for a fact name to match in one reader and not the other,
 * which would give the same record two different quest ids.
 */

/**
 * `n` items taken at even strides from `items`, including the first and, when
 * `n >= 2`, the last.
 *
 * A prefix would be a biased sample: fact records are stored in the order the
 * script set them, so the head of a quest's list is its earliest steps and its
 * tail its latest, and a prefix reports only the beginning of a playthrough.
 * The stride keeps both ends and the span between.
 *
 * This is for *samples*, never for the step list itself. A stride over the step
 * list is not a truncation: it would drop fired steps from the middle of the run
 * and keep dormant ones, which is the opposite of what `orderSteps` orders for.
 */
const strideSample = <T>(items: readonly T[], n: number): readonly T[] => {
	if (items.length <= n) return items;
	if (n < 2) return items.slice(0, Math.max(n, 0));
	const out: T[] = [];
	const last = items.length - 1;
	for (let i = 0; i < n; i += 1) {
		const item = items[Math.round((i * last) / (n - 1))];
		if (item !== undefined) out.push(item);
	}
	return out;
};

/**
 * Fired steps first (earliest contributing event, then by name), then unfired
 * steps by name.
 *
 * The cap has to bite somewhere, and the two halves of a step list are worth
 * different amounts: a fired step is an event that happened at a known engine
 * time, an unfired step is the absence of one. Dropping the tail of the unfired
 * run keeps every measurement the save made and loses only names a reader could
 * not have acted on. The ordering is total, so the kept list is a function of
 * the facts rather than of the order the walk happened to visit them.
 */
const orderSteps = (steps: readonly OrderedStep[]): readonly OrderedStep[] => {
	const fired = steps.filter((step) => step.events !== 0);
	const dormant = steps.filter((step) => step.events === 0);
	fired.sort((a, b) => a.firstTime - b.firstTime || a.name.localeCompare(b.name));
	dormant.sort((a, b) => a.name.localeCompare(b.name));
	return [...fired, ...dormant];
};

type Mutable = {
	readonly id: string;
	readonly steps: OrderedStep[];
	fired: number;
	events: number;
	times: number[];
};

/**
 * Group a fact list into per-quest step detail.
 *
 * Ordered by event count then id — the order `questProgress` uses, so the two
 * views of one save line up without a join key.
 */
export const questStepDetail = (
	facts: readonly Fact[],
): readonly QuestStepDetail[] => {
	const byId = new Map<string, Mutable>();
	for (const fact of facts) {
		const id = questIdOf(fact.name);
		if (id === undefined) continue;
		const events = fact.entries.length;
		const entry = byId.get(id) ?? {
			id,
			steps: [],
			fired: 0,
			events: 0,
			times: [],
		};
		entry.steps.push({
			name: fact.name,
			events,
			// A step with no events has no first time. `0` is a harmless filler
			// rather than a sentinel a caller could read as midnight, because
			// `orderSteps` sorts the fired run on this key and the dormant run on
			// name alone — so it is never compared against a real event.
			firstTime: fact.entries[0]?.time ?? 0,
		});
		if (events !== 0) {
			entry.fired += 1;
			for (const event of fact.entries) entry.times.push(event.time);
		}
		entry.events += events;
		byId.set(id, entry);
	}

	return [...byId.values()]
		.map((entry): QuestStepDetail => {
			const names = entry.steps.map((step) => step.name);
			const kept = orderSteps(entry.steps).slice(0, MAX_QUEST_STEPS);
			const times = strideSample(
				[...entry.times].sort((a, b) => a - b),
				MAX_SAMPLED_EVENT_TIMES,
			);
			const namesKept = Math.min(names.length, MAX_SAMPLED_STEP_NAMES);
			return {
				id: entry.id,
				title: questTitle(entry.id),
				stepsTotal: entry.steps.length,
				stepsFired: entry.fired,
				events: entry.events,
				steps: kept.map((step) => ({
					name: step.name,
					events: step.events,
				})),
				stepsDropped: entry.steps.length - kept.length,
				stepNameSample: strideSample(names, MAX_SAMPLED_STEP_NAMES),
				stepNamesSampledOut: names.length - namesKept,
				eventTimeSample: times,
				eventTimesSampledOut: entry.times.length - times.length,
			};
		})
		.sort((a, b) => b.events - a.events || a.id.localeCompare(b.id));
};