import { describe, expect, test } from "bun:test";
import { isJsonObject, type JsonValue, verifyRoundTrip } from "../../shared";
import {
	arrayAt,
	collectLeaves,
	numberAt,
	objectAt,
} from "../../shared/save/json";
import { witcher3 } from "../lib/format";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

const FIXTURES = [
	{ name: "8559a", load: smallSave },
	{ name: "52586", load: largeSave },
] as const;

const branchOf = (doc: JsonValue, key: string): JsonValue => {
	const branch = objectAt(doc, key);
	return branch === undefined || !isJsonObject(branch) ? null : branch;
};

describe("the read-only ported features", () => {
	test(
		"survive a rebuild on both fixtures",
		async () => {
			for (const { name, load } of FIXTURES) {
				const file = load();
				const doc = await witcher3.decode(file);
				const verdict = await verifyRoundTrip(witcher3, file, doc, false);
				expect({ name, kind: verdict.kind }).toEqual({
					name,
					kind: "semantic",
				});
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"are populated with this save's own figures",
		async () => {
			for (const { name, load } of FIXTURES) {
				const doc = await witcher3.decode(load());
				expect({
					name,
					dialogBlocks: numberAt(branchOf(doc, "dialogues"), "blockCount"),
					attitudeRows: numberAt(branchOf(doc, "attitudes"), "groupCount"),
					booksRead: numberAt(
						branchOf(branchOf(doc, "unlocks"), "booksRead"),
						"count",
					),
					entities: numberAt(branchOf(doc, "entities"), "entities"),
					journalEntries: numberAt(branchOf(doc, "journal"), "entries"),
					journalQuests: arrayAt(branchOf(doc, "journal"), "quests")?.length,
					questStepQuests: arrayAt(doc, "questSteps")?.length,
				}).toEqual({
					name,
					dialogBlocks: name === "8559a" ? 21 : 152,
					attitudeRows: name === "8559a" ? 927 : 958,
					booksRead: name === "8559a" ? 11 : 108,
					entities: name === "8559a" ? 640 : 6525,
					journalEntries: name === "8559a" ? 296 : 972,
					journalQuests: name === "8559a" ? 8 : 29,
					questStepQuests: name === "8559a" ? 10 : 43,
				});
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"are read-only: no quick action writes into any of them",
		async () => {
			for (const { name, load } of FIXTURES) {
				const doc = await witcher3.decode(load());
				const branches = [
					"dialogues",
					"attitudes",
					"unlocks",
					"entities",
					"questSteps",
					"stats",
				];
				const touching = witcher3.actions.flatMap((action) =>
					action
						.plan(doc)
						.map((edit) => edit.path[0])
						.filter((segment) => branches.includes(String(segment)))
						.map((segment) => `${action.id} -> ${String(segment)}`),
				);
				expect({ name, touching }).toEqual({ name, touching: [] });
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"carry no byte offset, and do not echo an unresolved quest id as a title",
		async () => {
			const doc = await witcher3.decode(largeSave());

			const large = collectLeaves(doc).filter(
				(leaf) => typeof leaf.value === "number" && leaf.value >= 1_000_000,
			);
			expect({
				large: large.map(
					(leaf) => `${leaf.path.join(".")}=${String(leaf.value)}`,
				),
			}).toEqual({
				large: [
					"container.payloadBytes=5108325",
					"container.chunkBytes=1048576",
				],
			});

			const steps = (arrayAt(doc, "questSteps") ?? []).filter(isJsonObject);
			expect({
				nullTitles: steps.filter((quest) => quest.title === null).length,
				otherTitles: steps.filter(
					(quest) => typeof quest.title !== "string" && quest.title !== null,
				).length,
			}).toEqual({ nullTitles: 10, otherTitles: 0 });
		},
		FIXTURE_TIMEOUT_MS,
	);
});
