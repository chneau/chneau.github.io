/**
 * Quest progress, grouped from the fact names.
 *
 * The object tree's quest nodes are GUID-keyed scene blocks, so the readable
 * progress is in the fact DB. Fact names encode the quest and the step, e.g.
 * `mq0001_talked_to_brother` (main quest), `q101_spoke_with_survivor`,
 * `sq104_fbd_done` (side quest), `tut_mq0001_focus` (tutorial copy). A quest's
 * value count is how many of its steps are non-zero (events that happened).
 */

import type { Fact } from "./facts";

/** The coarse state a quest is reported in, best first. */
type QuestState =
	| "failed"
	| "completed"
	| "active"
	| "in-progress"
	| "not-started";

type QuestProgress = {
	/** normalised quest id, e.g. `mq0001`, `q101`, `sq104` */
	readonly id: string;
	/** `main` for `mq…`, `side` for `sq…`, `quest` for `q…` */
	readonly kind: string;
	/** facts whose name belongs to this quest */
	readonly total: number;
	/** facts with a non-zero value (steps that happened) */
	readonly done: number;
	/** sum of all the quest's fact values */
	readonly events: number;
	readonly state: QuestState;
};

const QUEST_ID = /^(mq|sq|q)(\d{3,4})(?:_|$)/i;
const FAILED = /_fail(?:ed|ure)?$/i;
const COMPLETED = /_(?:completed?|done|closed|success|finished)$/i;
const ACCEPTED = /_accepted$/i;

/** Normalised quest id of a fact name, or `undefined` if it is not a quest step. */
const questIdOf = (name: string): string | undefined => {
	const match = QUEST_ID.exec(name);
	if (match === null) return undefined;
	return (match[1] ?? "q").toLowerCase() + (match[2] ?? "");
};

/*
 * Listing one quest's steps in isolation (filtered by id, then sorted by fact
 * name) is a fold over the same list `questProgress` below already performs, and
 * it is deliberately not offered separately: `total` and `done` are counts over
 * *records*, so a caller that filtered to a per-quest list first and then
 * counted would be counting the same facts by a second, subtly different path.
 * `questProgress` carries the per-quest facts through in one pass instead.
 */

/** Group a fact list into per-quest progress and a coarse state, busiest first. */
export const questProgress = (facts: readonly Fact[]): QuestProgress[] => {
	const byId = new Map<string, QuestProgress>();
	const flags = new Map<
		string,
		{ failed: boolean; completed: boolean; accepted: boolean }
	>();
	for (const fact of facts) {
		const id = questIdOf(fact.name);
		if (id === undefined) continue;
		const prefix = id.slice(
			0,
			id.startsWith("mq") || id.startsWith("sq") ? 2 : 1,
		);
		const prev = byId.get(id) ?? {
			id,
			kind: prefix === "mq" ? "main" : prefix === "sq" ? "side" : "quest",
			total: 0,
			done: 0,
			events: 0,
			state: "not-started",
		};
		const flag = flags.get(id) ?? {
			failed: false,
			completed: false,
			accepted: false,
		};
		if (fact.value !== 0) {
			if (FAILED.test(fact.name)) flag.failed = true;
			if (COMPLETED.test(fact.name)) flag.completed = true;
			if (ACCEPTED.test(fact.name)) flag.accepted = true;
		}
		flags.set(id, flag);
		byId.set(id, {
			...prev,
			total: prev.total + 1,
			done: prev.done + (fact.value !== 0 ? 1 : 0),
			events: prev.events + fact.value,
		});
	}
	for (const [id, progress] of byId) {
		const flag = flags.get(id);
		// `state` is a closed union, so the ladder is typed rather than left to
		// widen to `string`: adding a state means adding it here, in the order
		// it is meant to win.
		const state: QuestState = flag?.failed
			? "failed"
			: flag?.completed
				? "completed"
				: flag?.accepted
					? "active"
					: progress.done > 0
						? "in-progress"
						: "not-started";
		byId.set(id, { ...progress, state });
	}
	return [...byId.values()].sort(
		(a, b) => b.events - a.events || a.id.localeCompare(b.id),
	);
};
