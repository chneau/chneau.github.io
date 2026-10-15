import { questTitle } from "./catalog";
import type { Fact } from "./facts";
import { questIdOf } from "./quests";

export const MAX_QUEST_STEPS = 64;

export const MAX_SAMPLED_STEP_NAMES = 24;

export const MAX_SAMPLED_EVENT_TIMES = 16;

type QuestStep = {
	readonly name: string;
	readonly events: number;
};

type OrderedStep = QuestStep & { readonly firstTime: number };

type QuestStepDetail = {
	readonly id: string;
	readonly title: string | undefined;
	readonly stepsTotal: number;
	readonly stepsFired: number;
	readonly events: number;
	readonly steps: readonly QuestStep[];
	readonly stepsDropped: number;
	readonly stepNameSample: readonly string[];
	readonly stepNamesSampledOut: number;
	readonly eventTimeSample: readonly number[];
	readonly eventTimesSampledOut: number;
};

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

const orderSteps = (steps: readonly OrderedStep[]): readonly OrderedStep[] => {
	const fired = steps.filter((step) => step.events !== 0);
	const dormant = steps.filter((step) => step.events === 0);
	fired.sort(
		(a, b) => a.firstTime - b.firstTime || a.name.localeCompare(b.name),
	);
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
