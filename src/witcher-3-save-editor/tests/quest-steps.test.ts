import { describe, expect, test } from "bun:test";
import { decompressContainer } from "../lib/container";
import { readFactDB } from "../lib/facts";
import {
	MAX_QUEST_STEPS,
	MAX_SAMPLED_EVENT_TIMES,
	MAX_SAMPLED_STEP_NAMES,
	questStepDetail,
} from "../lib/quest-steps";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

const FIXTURES = [
	{
		name: "8559a",
		load: smallSave,
		facts: 1452,
		quests: 10,
		titled: 8,
		untitled: ["mq1060", "sq107"],
		busiest: { id: "q002", stepsTotal: 72, stepsFired: 41, events: 46 },
		titledQuest: {
			id: "mq0001",
			title: "Missing in Action",
			stepsTotal: 16,
			stepsFired: 13,
			events: 24,
		},
		zeroFired: { id: "q504", stepsTotal: 1, stepsFired: 0, events: 0 },
	},
	{
		name: "52586",
		load: largeSave,
		facts: 3997,
		quests: 43,
		titled: 33,
		untitled: [
			"q102",
			"mq1033",
			"mq1036",
			"mq1038",
			"mq1058",
			"mq1060",
			"mq3007",
			"mq3041",
			"sq107",
			"sq1104",
		],
		busiest: { id: "q002", stepsTotal: 130, stepsFired: 49, events: 74 },
		titledQuest: {
			id: "mq0001",
			title: "Missing in Action",
			stepsTotal: 26,
			stepsFired: 20,
			events: 31,
		},
		zeroFired: { id: "q504", stepsTotal: 1, stepsFired: 0, events: 0 },
	},
] as const;

const questOf = (
	detail: ReturnType<typeof questStepDetail>,
	id: string,
): (typeof detail)[number] => {
	const found = detail.find((quest) => quest.id === id);
	if (found === undefined) {
		throw new Error(`no quest ${id} in ${detail.map((q) => q.id).join(", ")}`);
	}
	return found;
};

const ALLOWED_KEYS = [
	"id",
	"title",
	"stepsTotal",
	"stepsFired",
	"events",
	"steps",
	"stepsDropped",
	"stepNameSample",
	"stepNamesSampledOut",
	"eventTimeSample",
	"eventTimesSampledOut",
	"name",
] as const;

describe("per-quest step detail", () => {
	test(
		"reports the fact DB's own quest counts on both builds",
		() => {
			for (const { name, load, facts, quests, titled, untitled } of FIXTURES) {
				const db = readFactDB(decompressContainer(load()).data);
				if (db === undefined) throw new Error(`${name}: no fact DB`);
				expect({
					name,
					facts: db.facts.length,
					terminated: db.terminated,
				}).toEqual({
					name,
					facts,
					terminated: true,
				});
				const detail = questStepDetail(db.facts);
				expect({
					name,
					quests: detail.length,
					titled: detail.filter((quest) => quest.title !== undefined).length,
				}).toEqual({ name, quests, titled });
				expect({
					name,
					untitled: detail
						.filter((quest) => quest.title === undefined)
						.map((quest) => quest.id)
						.sort(),
				}).toEqual({ name, untitled: [...untitled].sort() });
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"measures the busiest quest's steps and events",
		() => {
			for (const { name, load, busiest } of FIXTURES) {
				const db = readFactDB(decompressContainer(load()).data);
				if (db === undefined) throw new Error(`${name}: no fact DB`);
				const detail = questStepDetail(db.facts);
				const first = detail[0];
				expect({
					name,
					id: first?.id,
					stepsTotal: first?.stepsTotal,
					stepsFired: first?.stepsFired,
					events: first?.events,
				}).toEqual({ name, ...busiest });
				const quest = questOf(detail, busiest.id);
				expect(quest.events).toBe(busiest.events);
				expect(quest.stepsFired).toBeLessThanOrEqual(quest.stepsTotal);
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"resolves a title through the catalogue, and leaves it undefined otherwise",
		() => {
			for (const { name, load, titledQuest } of FIXTURES) {
				const db = readFactDB(decompressContainer(load()).data);
				if (db === undefined) throw new Error(`${name}: no fact DB`);
				const detail = questStepDetail(db.facts);
				const quest = questOf(detail, titledQuest.id);
				expect({
					name,
					id: quest.id,
					title: quest.title,
					stepsTotal: quest.stepsTotal,
					stepsFired: quest.stepsFired,
					events: quest.events,
				}).toEqual({ name, ...titledQuest });
				for (const unresolved of detail.filter((q) => q.title === undefined)) {
					expect(unresolved.title).toBeUndefined();
					expect(unresolved.title === unresolved.id).toBe(false);
				}
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"reports a quest with zero fired steps as zeros, not as a plausible time",
		() => {
			for (const { name, load, zeroFired } of FIXTURES) {
				const db = readFactDB(decompressContainer(load()).data);
				if (db === undefined) throw new Error(`${name}: no fact DB`);
				const quest = questOf(questStepDetail(db.facts), zeroFired.id);
				expect({
					name,
					id: quest.id,
					stepsTotal: quest.stepsTotal,
					stepsFired: quest.stepsFired,
					events: quest.events,
					times: quest.eventTimeSample,
					dropped: quest.stepsDropped,
				}).toEqual({
					name,
					id: zeroFired.id,
					stepsTotal: zeroFired.stepsTotal,
					stepsFired: 0,
					events: 0,
					times: [],
					dropped: 0,
				});
				expect(quest.steps.map((step) => step.events)).toEqual([0]);
				expect(quest.steps[0]?.name).toBe("q504_inn_door_opened");
			}
			const db = readFactDB(decompressContainer(largeSave()).data);
			if (db === undefined) throw new Error("no fact DB");
			const dormant = questOf(questStepDetail(db.facts), "mq1036");
			expect({
				stepsTotal: dormant.stepsTotal,
				stepsFired: dormant.stepsFired,
				events: dormant.events,
				times: dormant.eventTimeSample,
			}).toEqual({
				stepsTotal: 57,
				stepsFired: 0,
				events: 0,
				times: [],
			});
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"caps every list and says what the cap dropped",
		() => {
			for (const { name, load } of FIXTURES) {
				const db = readFactDB(decompressContainer(load()).data);
				if (db === undefined) throw new Error(`${name}: no fact DB`);
				for (const quest of questStepDetail(db.facts)) {
					const label = `${name}/${quest.id}`;
					expect(quest.steps.length).toBeLessThanOrEqual(MAX_QUEST_STEPS);
					expect(quest.stepsDropped).toBe(
						quest.stepsTotal - quest.steps.length,
					);
					expect(quest.steps.length).toBeLessThanOrEqual(quest.stepsTotal);
					expect(quest.stepNameSample.length).toBeLessThanOrEqual(
						MAX_SAMPLED_STEP_NAMES,
					);
					expect(quest.stepNamesSampledOut).toBe(
						quest.stepsTotal - quest.stepNameSample.length,
					);
					expect(quest.eventTimeSample.length).toBeLessThanOrEqual(
						MAX_SAMPLED_EVENT_TIMES,
					);
					expect(quest.eventTimesSampledOut).toBe(
						quest.events - quest.eventTimeSample.length,
					);
					const sorted = [...quest.eventTimeSample].sort((a, b) => a - b);
					expect({ label, times: quest.eventTimeSample }).toEqual({
						label,
						times: sorted,
					});
					for (const step of quest.steps) {
						expect(step).toEqual({ name: step.name, events: step.events });
					}
					const keptFired = quest.steps.filter(
						(step) => step.events !== 0,
					).length;
					expect(keptFired).toBe(Math.min(quest.stepsFired, MAX_QUEST_STEPS));
				}
			}
			const db = readFactDB(decompressContainer(largeSave()).data);
			if (db === undefined) throw new Error("no fact DB");
			const wide = questOf(questStepDetail(db.facts), "q104");
			expect({
				stepsTotal: wide.stepsTotal,
				listed: wide.steps.length,
				dropped: wide.stepsDropped,
				listedFired: wide.steps.filter((step) => step.events !== 0).length,
			}).toEqual({
				stepsTotal: 361,
				listed: MAX_QUEST_STEPS,
				dropped: 297,
				listedFired: 52,
			});
			const streamNames = db.facts
				.filter((fact) => fact.name.startsWith("q104_"))
				.map((fact) => fact.name);
			expect(streamNames.length).toBe(361);
			expect(wide.stepNameSample.length).toBe(MAX_SAMPLED_STEP_NAMES);
			expect({
				first: wide.stepNameSample[0],
				last: wide.stepNameSample[wide.stepNameSample.length - 1],
			}).toEqual({
				first: streamNames[0],
				last: streamNames[streamNames.length - 1],
			});
			expect(wide.steps.map((step) => step.events)).toContain(0);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"reaches the reader with no offset in sight",
		() => {
			for (const { name, load } of FIXTURES) {
				const db = readFactDB(decompressContainer(load()).data);
				if (db === undefined) throw new Error(`${name}: no fact DB`);
				const facts = db.facts;
				const detail = questStepDetail(facts);
				const offsets = new Set(facts.map((fact) => fact.offset));
				const serialised = JSON.stringify(detail);
				const keys = new Set(
					(serialised.match(/"([A-Za-z]+)":/g) ?? []).map((pair) =>
						pair.slice(1, -2),
					),
				);
				const unexpected = [...keys].filter(
					(key) => !(ALLOWED_KEYS as readonly string[]).includes(key),
				);
				expect({ name, unexpected }).toEqual({ name, unexpected: [] });
				expect(offsets.size).toBeGreaterThan(0);
				const quest = detail.find((entry) => entry.steps.length > 0);
				expect(quest?.steps[0]?.name).toMatch(/^(mq|sq|q)\d{3,4}_/);
			}
		},
		FIXTURE_TIMEOUT_MS,
	);
});
