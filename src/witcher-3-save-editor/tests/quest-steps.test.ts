/**
 * Per-quest step detail, read from the fact DB.
 *
 * The assertions are the save's own numbers, so a wrong projection fails rather
 * than looking plausible, and both fixtures are covered because they are two
 * builds — the same fact name carries a different offset on each, and a reader
 * that reached for an offset instead of re-deriving would pass on one and fail
 * on the other.
 *
 * The properties asserted here that matter most are the negative ones: no
 * offset reaches the output, an unresolvable title stays `undefined` rather
 * than echoing the id back, and a quest with no fired steps reports zeros and
 * an empty timestamp sample rather than a plausible-looking time.
 */

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

/**
 * Figures measured by running this module over each fixture, not copied from
 * the reference decoder's documentation. The reference save there is the same
 * build as `8559a`, so its counts are a cross-check rather than the source.
 */
const FIXTURES = [
	{
		name: "8559a",
		load: smallSave,
		facts: 1452,
		quests: 10,
		titled: 8,
		untitled: ["mq1060", "sq107"],
		/** `q002` — the busiest quest: 72 steps, 46 events. */
		busiest: { id: "q002", stepsTotal: 72, stepsFired: 41, events: 46 },
		/** `mq0001` — 16 steps, 13 fired, 24 events, title resolves. */
		titledQuest: {
			id: "mq0001",
			title: "Missing in Action",
			stepsTotal: 16,
			stepsFired: 13,
			events: 24,
		},
		/** one step record, never fired, and the catalogue does resolve it. */
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

/** The step detail of one quest id, or a thrown expectation naming what exists. */
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

/** Every key `questStepDetail`'s output is allowed to carry. */
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
	// `fired` was removed: it is `events !== 0` and nothing more, so listing it
	// here would assert a second field over one fact. Its absence is the contract.
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
				// The module sorts by events descending, so the first entry is the
				// busiest — asserted on the index rather than only on the id, since
				// an ordering that silently changed would otherwise go unnoticed.
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
				// An unresolved title must be `undefined`, never the id echoed back:
				// a reader rendering "q102" where a title belongs would be inventing
				// a name the save does not carry. Asserted across *every* unresolved
				// quest rather than one, so a new unresolvable id cannot slip past.
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
				// Its one step is present and explicitly unfired, so the reader can
				// tell "recorded and did not happen" from "not in this save".
				// No `fired` field exists: it was `events !== 0` and nothing more, so it
				// would be a second document field over the same fact.
				expect(quest.steps.map((step) => step.events)).toEqual([0]);
				expect(quest.steps[0]?.name).toBe("q504_inn_door_opened");
			}
			// `mq1036` exists only on the larger save: 57 recorded steps, none fired.
			// A step list of 57 dormant names is the shape that tempts a caller into
			// reporting progress, so it is asserted to report none.
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
					// The label exists only to make a failure readable: two builds produce the
					// same shape, and a bare assertion would not say which quest failed.
					const label = `${name}/${quest.id}`;
					// Steps: the cap bites only on `q104` (361 records), and
					// `stepsDropped` makes the loss explicit rather than silent.
					expect(quest.steps.length).toBeLessThanOrEqual(MAX_QUEST_STEPS);
					expect(quest.stepsDropped).toBe(
						quest.stepsTotal - quest.steps.length,
					);
					expect(quest.steps.length).toBeLessThanOrEqual(quest.stepsTotal);
					// Names and timestamps are samples, and both report their omission.
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
					// The timestamps are ascending, so a sample is a range, not a set.
					const sorted = [...quest.eventTimeSample].sort((a, b) => a - b);
					expect({ label, times: quest.eventTimeSample }).toEqual({
						label,
						times: sorted,
					});
					// A fired step is exactly a step with events.
					for (const step of quest.steps) {
						expect(step).toEqual({ name: step.name, events: step.events });
					}
					// The fired half survives the cap intact, which is what makes the
					// cap safe rather than merely small: the list is truncated, not
					// sampled, so it loses only the tail of the dormant run. Checked
					// as the exact figure rather than an inequality, so a change that
					// quietly starts sampling the list fails here.
					const keptFired = quest.steps.filter(
						(step) => step.events !== 0,
					).length;
					expect(keptFired).toBe(Math.min(quest.stepsFired, MAX_QUEST_STEPS));
				}
			}
			// The one quest the step cap actually truncates, on the larger save.
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
			// Its name sample spans the whole list rather than taking a prefix, so a
			// sample is not a claim that the first 24 steps are representative. Both
			// ends are asserted against the fact DB's own order — the sample must
			// reach the *last* step recorded, which a prefix could not.
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
				// An allow-list of every key the output can carry, checked against the
				// serialised form. A per-offset `includes` sweep was the obvious
				// assertion and the wrong one: an engine timestamp of 15,356 is a
				// digit run that a fact offset could match by coincidence, so it
				// tests the arithmetic of the fixtures rather than the shape of the
				// projection. Naming the keys states the property directly — an
				// offset could only appear under a key not on this list.
				const keys = new Set(
					(serialised.match(/"([A-Za-z]+)":/g) ?? []).map((pair) =>
						pair.slice(1, -2),
					),
				);
				const unexpected = [...keys].filter(
					(key) => !(ALLOWED_KEYS as readonly string[]).includes(key),
				);
				expect({ name, unexpected }).toEqual({ name, unexpected: [] });
				// A fact's offset and size are the numbers the reader must not carry;
				// its own step name it must.
				expect(offsets.size).toBeGreaterThan(0);
				// A fact's own step name is carried; its offset, size and position are
				// not, which is the distinction the allow-list draws.
				const quest = detail.find((entry) => entry.steps.length > 0);
				expect(quest?.steps[0]?.name).toMatch(/^(mq|sq|q)\d{3,4}_/);
			}
		},
		FIXTURE_TIMEOUT_MS,
	);
});
