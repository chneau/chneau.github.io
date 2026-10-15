import type { Fact } from "./facts";

type QuestState =
	| "failed"
	| "completed"
	| "active"
	| "in-progress"
	| "not-started";

type QuestProgress = {
	readonly id: string;
	readonly kind: string;
	readonly total: number;
	readonly done: number;
	readonly events: number;
	readonly state: QuestState;
};

const QUEST_ID = /^(mq|sq|q)(\d{3,4})(?=[^0-9a-z]|$)/i;
const FAILED = /_fail(?:ed|ure)?$/i;
const COMPLETED = /_(?:completed?|done|closed|success|finished)$/i;
const ACCEPTED = /_accepted$/i;

export const questIdOf = (name: string): string | undefined => {
	const match = QUEST_ID.exec(name);
	if (match === null) return undefined;
	return (match[1] ?? "q").toLowerCase() + (match[2] ?? "");
};

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
