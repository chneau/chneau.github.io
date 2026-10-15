import { describe, expect, test } from "bun:test";
import {
	applyEdits,
	arrayAt,
	effectiveEdits,
	getAtPath,
	isJsonObject,
	type JsonValue,
	setAtPath,
	verifyRoundTrip,
} from "../../shared";
import {
	collectLeaves,
	numberAt,
	objectAt,
	requireArrayAt,
	stringAt,
} from "../../shared/save/json";
import { decompressContainer } from "../lib/container";
import { witcher3 } from "../lib/format";
import { locateWritable } from "../lib/write";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

const asObject = (value: JsonValue): { readonly [key: string]: JsonValue } => {
	if (!isJsonObject(value)) {
		throw new Error("expected a JSON object in the decoded document");
	}
	return value;
};

const rowValue = (doc: JsonValue, label: string): string | undefined =>
	witcher3.summarise(doc).find((row) => row.label === label)?.value;

const planFor = (
	id: string,
	doc: JsonValue,
): readonly {
	readonly id: string;
	readonly label: string;
	readonly path: readonly (string | number)[];
	readonly before: JsonValue;
	readonly after: JsonValue;
}[] => {
	const action = witcher3.actions.find((entry) => entry.id === id);
	if (action === undefined) throw new Error(`no ${id} action`);
	return action.plan(doc);
};

describe("decoding a real save", () => {
	test(
		"reads the small save's progression, inventory and wallet",
		async () => {
			const doc = await witcher3.decode(smallSave());
			expect({
				format: asObject(doc).format,
				game: asObject(doc).game,
				saveVersion: asObject(doc).saveVersion,
				level: getAtPath(doc, ["level"]),
				difficulty: rowValue(doc, "Difficulty"),
				skillPoints: getAtPath(doc, ["skillPoints"]),
				experience: getAtPath(doc, ["experience"]),
				chunks: getAtPath(doc, ["container", "chunks"]),
				headerSize: getAtPath(doc, ["container", "headerSize"]),
				items: arrayAt(doc, "items")?.length,
				skills: arrayAt(doc, "skills")?.length,
			}).toEqual({
				format: "witcher-3-save-editor",
				game: "The Witcher 3: Wild Hunt",
				saveVersion: "66/29/164",
				level: 4,
				difficulty: "Hardcore",
				skillPoints: { free: 9, used: null },
				experience: { free: 17, used: 3000 },
				chunks: 1,
				headerSize: 3084,
				items: 164,
				skills: 167,
			});
			expect(rowValue(doc, "Crowns")).toBe("397");
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"reads the large save's progression and its wallet",
		async () => {
			const doc = await witcher3.decode(largeSave());
			expect({
				saveVersion: asObject(doc).saveVersion,
				level: getAtPath(doc, ["level"]),
				difficulty: rowValue(doc, "Difficulty"),
				skillPoints: getAtPath(doc, ["skillPoints"]),
				experience: getAtPath(doc, ["experience"]),
				chunks: getAtPath(doc, ["container", "chunks"]),
				items: arrayAt(doc, "items")?.length,
				skills: arrayAt(doc, "skills")?.length,
			}).toEqual({
				saveVersion: "66/29/164",
				level: 7,
				difficulty: "Hard",
				skillPoints: { free: 14, used: null },
				experience: { free: 702, used: 6000 },
				chunks: 5,
				items: 626,
				skills: 167,
			});
			expect(rowValue(doc, "Crowns")).toBe("2996");
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"exposes only values, never the offsets they were found at",
		async () => {
			const doc = await witcher3.decode(largeSave());
			const found = locateWritable(decompressContainer(largeSave()).data);
			const wallet = found.money;
			if (wallet === undefined) throw new Error("the fixture has no wallet");
			const serialised = JSON.stringify(doc);
			const leaves = JSON.stringify(collectLeaves(doc));
			for (const offset of [
				wallet.offset,
				found.level?.offset,
				found.difficulty?.offset,
				...found.points.map((point) => point.freeOffset),
				...found.items.map((item) => item.quantityOffset),
			]) {
				if (offset === undefined || offset <= 0) continue;
				expect({ offset, appears: leaves.includes(`:${offset}`) }).toEqual({
					offset,
					appears: false,
				});
			}
			expect(serialised.length).toBeGreaterThan(0);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"keeps the scaffold out of the readable projection",
		async () => {
			const doc = await witcher3.decode(smallSave());
			expect(Object.keys(asObject(doc))).toContain("scaffold");

			const branch = asObject(getAtPath(doc, ["scaffold"]) ?? null);
			expect(Object.keys(branch)).toEqual([]);
			expect("bytes" in branch).toBe(true);
			expect(Object.getOwnPropertyDescriptor(branch, "bytes")?.enumerable).toBe(
				false,
			);
			expect(JSON.stringify(getAtPath(doc, ["scaffold"]))).toBe("{}");
			expect(JSON.stringify(doc).endsWith('"scaffold":{}}')).toBe(true);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("refuses a file that is not a Witcher 3 save", async () => {
		await expect(witcher3.decode(new Uint8Array(64))).rejects.toThrow(
			/does not look like a Witcher 3 save/,
		);
	});

	test("refuses a file whose container is well-formed but has no chunks", async () => {
		const file = new Uint8Array(3084);
		file.set(new TextEncoder().encode("SNFHFZLC"), 0);
		new DataView(file.buffer).setUint32(12, 3084, true);
		await expect(witcher3.decode(file)).rejects.toThrow(/chunk table is empty/);
	});
});

describe("the summary", () => {
	test(
		"reports the wallet on both builds, because both are readable now",
		async () => {
			for (const [name, bytes, crowns] of [
				["8559a", smallSave(), "397"],
				["52586", largeSave(), "2996"],
			] as const) {
				const doc = await witcher3.decode(bytes);
				const row = witcher3
					.summarise(doc)
					.find((entry) => entry.label === "Crowns");
				expect({
					name,
					crowns: row?.value,
					emphasis: row?.emphasis,
				}).toEqual({ name, crowns, emphasis: false });
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"says in words when a save carries no wallet at all",
		async () => {
			const rows = witcher3.summarise({
				saveVersion: "66/29/164",
				items: [],
			});
			expect(rows.find((row) => row.label === "Crowns")).toEqual({
				label: "Crowns",
				value: "not supported for this build",
				emphasis: true,
			});
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"reports a figure the save does carry without qualifying it",
		async () => {
			const doc = await witcher3.decode(smallSave());
			expect({
				saveVersion: rowValue(doc, "Save version"),
				level: rowValue(doc, "Level"),
				difficulty: rowValue(doc, "Difficulty"),
				skillPoints: rowValue(doc, "Skill points"),
				experience: rowValue(doc, "Experience"),
			}).toEqual({
				saveVersion: "66/29/164",
				level: "4",
				difficulty: "Hardcore",
				skillPoints: "9 free",
				experience: "17 available",
			});
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("omits a row for a field the document has lost rather than reporting zero", async () => {
		const rows = witcher3.summarise({ saveVersion: "66/29/164", items: [] });
		expect(rows.map((row) => row.label)).toEqual([
			"Save version",
			"Level",
			"Difficulty",
			"Crowns",
		]);
		expect(rows.map((row) => row.value)).toEqual([
			"66/29/164",
			"not found",
			"unknown",
			"not supported for this build",
		]);
		expect(rows.some((row) => row.label === "Skill points")).toBe(false);
	});

	test("describes a document with no item list instead of throwing", async () => {
		const docs: readonly JsonValue[] = [
			{ saveVersion: "66/29/164" },
			{ saveVersion: "66/29/164", items: null },
			{ saveVersion: "66/29/164", items: "not an array" },
		];
		for (const doc of docs) {
			const rows = witcher3.summarise(doc);
			expect(rows.find((row) => row.label === "Crowns")?.value).toBe(
				"not supported for this build",
			);
			expect(rows.find((row) => row.label === "Save version")?.value).toBe(
				"66/29/164",
			);
		}
	});
});

describe("the round trip", () => {
	test(
		"rebuilds an unedited save and reads back the same document",
		async () => {
			const file = smallSave();
			const doc = await witcher3.decode(file);
			const verdict = await verifyRoundTrip(witcher3, file, doc, false);
			expect(verdict.kind).toBe("semantic");
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"passes on the large save too",
		async () => {
			const file = largeSave();
			const doc = await witcher3.decode(file);
			const verdict = await verifyRoundTrip(witcher3, file, doc, false);
			expect(verdict.kind).toBe("semantic");
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"passes after an edit, and the edited value reads back out of the file",
		async () => {
			const file = largeSave();
			const doc = await witcher3.decode(file);
			const crowns = (arrayAt(doc, "items") ?? []).findIndex(
				(row) => isJsonObject(row) && row.name === "Crowns",
			);
			if (crowns < 0) throw new Error("the fixture has no Crowns record");
			const edited = setAtPath(doc, ["items", crowns, "quantity"], 40_000);
			const verdict = await verifyRoundTrip(witcher3, file, edited, true);
			expect(verdict.kind).toBe("semantic");

			const rebuilt = await witcher3.encode(edited);
			const back = await witcher3.decode(rebuilt);
			expect(getAtPath(back, ["items", crowns, "quantity"])).toBe(40_000);
			expect({
				level: getAtPath(back, ["level"]),
				skillPoints: getAtPath(back, ["skillPoints"]),
				experience: getAtPath(back, ["experience"]),
				items: arrayAt(back, "items")?.length,
			}).toEqual({
				level: 7,
				skillPoints: { free: 14, used: null },
				experience: { free: 702, used: 6000 },
				items: 626,
			});
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"fails loudly when the rebuild does not read back, rather than reporting success",
		async () => {
			const file = smallSave();
			const doc = await witcher3.decode(file);
			const tampered = setAtPath(doc, ["difficulty", "index"], 999_999);
			const verdict = await verifyRoundTrip(witcher3, file, tampered, true);
			expect(verdict.kind).toBe("failed");
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("refuses a document the editor did not decode, rather than inventing a save", async () => {
		await expect(witcher3.encode({ level: 20 })).rejects.toThrow(
			/no save attached to it/,
		);
	});
});

describe("editing a document", () => {
	test(
		"keeps the save attached through the workbench's own fold",
		async () => {
			const file = smallSave();
			const doc = await witcher3.decode(file);
			const original = decompressContainer(file).data;

			const edits = effectiveEdits(planFor("level-up", doc), doc);
			expect(edits).toHaveLength(1);
			const folded = applyEdits(doc, edits);
			expect(getAtPath(folded, ["level"])).toBe(9);

			const rebuilt = await witcher3.encode(folded);
			const back = decompressContainer(rebuilt).data;
			expect({ payloadBytes: back.length }).toEqual({
				payloadBytes: original.length,
			});
			const moved: number[] = [];
			for (let index = 0; index < back.length; index += 1) {
				if (back[index] !== original[index]) moved.push(index);
			}
			expect(moved.length).toBeGreaterThan(0);
			expect(moved.length).toBeLessThanOrEqual(4);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"survives an edit to a nested array element as well as a scalar",
		async () => {
			const file = largeSave();
			const doc = await witcher3.decode(file);
			const folded = applyEdits(
				doc,
				effectiveEdits(planFor("crowns-max", doc), doc),
			);
			expect(getAtPath(folded, ["items", 13, "quantity"])).toBe(65_535);
			const rebuilt = await witcher3.encode(folded);
			expect(
				getAtPath(await witcher3.decode(rebuilt), ["items", 13, "quantity"]),
			).toBe(65_535);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"leaves the document it was given untouched",
		async () => {
			const doc = await witcher3.decode(smallSave());
			const before = JSON.stringify(doc);
			applyEdits(doc, effectiveEdits(planFor("level-up", doc), doc));
			expect(JSON.stringify(doc)).toBe(before);
		},
		FIXTURE_TIMEOUT_MS,
	);
});

describe("the quick actions", () => {
	test(
		"plan exactly the wallet edits the large save calls for",
		async () => {
			const doc = await witcher3.decode(largeSave());
			expect(planFor("crowns-max", doc)).toEqual([
				{
					id: "items.13.quantity=65535",
					label: "Crowns",
					path: ["items", 13, "quantity"],
					before: 2996,
					after: 65_535,
				},
			]);
			expect(planFor("crowns-round", doc)).toEqual([
				{
					id: "items.13.quantity=3000",
					label: "Crowns",
					path: ["items", 13, "quantity"],
					before: 2996,
					after: 3000,
				},
			]);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"plan the wallet edits on the second build too, against its own records",
		async () => {
			const doc = await witcher3.decode(smallSave());
			const crowns = (arrayAt(doc, "items") ?? []).findIndex(
				(row) => isJsonObject(row) && row.name === "Crowns",
			);
			if (crowns < 0) throw new Error("the fixture has no Crowns record");
			expect(planFor("crowns-max", doc)).toEqual([
				{
					id: `items.${crowns}.quantity=65535`,
					label: "Crowns",
					path: ["items", crowns, "quantity"],
					before: 397,
					after: 65_535,
				},
			]);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"aims the wallet edit at the player's own record, not the first match in the save",
		async () => {
			for (const [name, bytes, before] of [
				["8559a", smallSave(), 397],
				["52586", largeSave(), 2996],
			] as const) {
				const doc = await witcher3.decode(bytes);
				const crownsRows = (arrayAt(doc, "items") ?? [])
					.map((row, index) => ({ row, index }))
					.filter(({ row }) => isJsonObject(row) && row.name === "Crowns");
				const planned = planFor("crowns-max", doc);
				expect({
					name,
					crownsRowsInPlayerInventory: crownsRows.length,
					path: planned[0]?.path,
					before: planned[0]?.before,
				}).toEqual({
					name,
					crownsRowsInPlayerInventory: 1,
					path: ["items", crownsRows[0]?.index ?? -1, "quantity"],
					before,
				});
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"plan exactly the progression edits, on both builds",
		async () => {
			const small = await witcher3.decode(smallSave());
			const large = await witcher3.decode(largeSave());
			expect(planFor("skill-points-max", small)).toEqual([
				{
					id: "skillPoints.free=500",
					label: "Skill points",
					path: ["skillPoints", "free"],
					before: 9,
					after: 500,
				},
			]);
			expect(planFor("experience-max", small)).toEqual([
				{
					id: "experience.free=500",
					label: "Experience",
					path: ["experience", "free"],
					before: 17,
					after: 500,
				},
			]);
			expect(planFor("level-up", small)).toEqual([
				{
					id: "level=9",
					label: "Level",
					path: ["level"],
					before: 4,
					after: 9,
				},
			]);
			expect(planFor("level-up", large)).toEqual([
				{
					id: "level=12",
					label: "Level",
					path: ["level"],
					before: 7,
					after: 12,
				},
			]);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"stage nothing when the action would change nothing",
		async () => {
			const doc = await witcher3.decode(smallSave());
			const maxed = applyEdits(doc, planFor("skill-points-max", doc));
			expect(planFor("skill-points-max", maxed)).toEqual([]);
			expect(applyEdits(maxed, planFor("skill-points-max", maxed))).toEqual(
				maxed,
			);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"stock every carried mutagen and the skill points lab research spends",
		async () => {
			const doc = await witcher3.decode(largeSave());
			const plan = planFor("mutation-research-kit", doc);
			expect(plan[0]?.path).toEqual(["skillPoints", "free"]);
			const itemEdits = plan.filter((entry) => entry.path[0] === "items");
			expect(itemEdits.length).toBeGreaterThan(0);
			expect(itemEdits.every((entry) => entry.after === 50)).toBe(true);
			expect(
				itemEdits.some((entry) => entry.label === "Greater mutagen blue"),
			).toBe(true);
			expect(itemEdits.some((entry) => /recipe/i.test(entry.label))).toBe(
				false,
			);
			const back = await witcher3.decode(
				await witcher3.encode(applyEdits(doc, plan)),
			);
			const points = objectAt(back, "skillPoints");
			expect(points === undefined ? undefined : numberAt(points, "free")).toBe(
				500,
			);
			const greater = requireArrayAt(back, "items").find(
				(row) =>
					isJsonObject(row) && stringAt(row, "name") === "Greater mutagen blue",
			);
			expect(
				greater === undefined || !isJsonObject(greater)
					? undefined
					: numberAt(greater, "quantity"),
			).toBe(50);
			expect(planFor("mutation-research-kit", back)).toEqual([]);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"max every mutation, and it survives the round trip",
		async () => {
			const doc = await witcher3.decode(largeSave());
			const edits = planFor("mutations-max", doc);
			expect(
				edits.filter((entry) => entry.path.includes("progress")).length,
			).toBeGreaterThan(0);
			const working = applyEdits(doc, edits);
			const back = await witcher3.decode(await witcher3.encode(working));
			expect(JSON.stringify(back)).toBe(JSON.stringify(working));
			const maxed = requireArrayAt(back, "mutations").filter(
				(row) =>
					isJsonObject(row) && stringAt(row, "name") !== "EPMT_MutationMaster",
			);
			expect(maxed.length).toBeGreaterThan(0);
			for (const row of maxed) {
				const progress = objectAt(row, "progress");
				expect(
					progress === undefined
						? undefined
						: numberAt(progress, "overallProgress"),
				).toBe(100);
			}
			expect(planFor("mutations-max", back)).toEqual([]);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"add Greater mutagens as real inserts and the document still reads back",
		async () => {
			const doc = await witcher3.decode(largeSave());
			const before = requireArrayAt(doc, "items").length;
			const working = applyEdits(doc, planFor("mutagens-greater", doc));
			const reread = await witcher3.decode(await witcher3.encode(working));
			expect(JSON.stringify(reread)).toBe(JSON.stringify(working));
			expect(requireArrayAt(reread, "items").length).toBe(before + 3);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"are pure: no plan touches the document it was given",
		async () => {
			for (const [label, bytes] of [
				["8559a", smallSave()],
				["52586", largeSave()],
			] as const) {
				const doc = await witcher3.decode(bytes);
				const before = JSON.stringify(doc);
				for (const action of witcher3.actions) {
					const beforeAction = JSON.stringify(doc);
					action.plan(doc);
					expect({
						label,
						action: action.id,
						unchanged: JSON.stringify(doc) === beforeAction,
					}).toEqual({ label, action: action.id, unchanged: true });
				}
				expect({ label, unchanged: JSON.stringify(doc) === before }).toEqual({
					label,
					unchanged: true,
				});
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"return the same edits when asked twice",
		async () => {
			const doc = await witcher3.decode(smallSave());
			for (const action of witcher3.actions) {
				const first = JSON.stringify(action.plan(doc));
				const second = JSON.stringify(action.plan(doc));
				expect({ action: action.id, same: first === second }).toEqual({
					action: action.id,
					same: true,
				});
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"reach the value they claim, through a rebuilt file",
		async () => {
			const doc = await witcher3.decode(smallSave());
			const working = applyEdits(
				doc,
				effectiveEdits(planFor("level-up", doc), doc),
			);
			const back = await witcher3.decode(await witcher3.encode(working));
			expect(getAtPath(back, ["level"])).toBe(9);
		},
		FIXTURE_TIMEOUT_MS,
	);
});

describe("the codec describes itself", () => {
	test("states the format, the extension and where the file lives", () => {
		expect({
			game: witcher3.game,
			formatLabel: witcher3.formatLabel,
			extensions: witcher3.extensions,
		}).toEqual({
			game: "The Witcher 3: Wild Hunt",
			formatLabel: "SNFH/FZLC container, LZ4 blocks, REDkit token stream",
			extensions: ["sav"],
		});
		expect(witcher3.defaultPath).toContain("savedata");
	});

	test("carries format notes that are prose rather than placeholders", () => {
		expect(witcher3.notes.length).toBeGreaterThanOrEqual(3);
		expect(witcher3.notes.length).toBeLessThanOrEqual(4);
		for (const note of witcher3.notes) {
			expect({
				title: note.title.length > 0,
				body: note.body.length > 40,
			}).toEqual({ title: true, body: true });
		}
	});

	test("every action carries a description the page can show", () => {
		for (const action of witcher3.actions) {
			expect({ id: action.id, label: action.label.length > 0 }).toEqual({
				id: action.id,
				label: true,
			});
			expect(action.description.length).toBeGreaterThan(10);
		}
	});

	test("orders the actions by how often they are wanted", () => {
		expect(witcher3.actions.map((action) => action.id)).toEqual([
			"crowns-max",
			"crowns-round",
			"skill-points-max",
			"mutation-research-kit",
			"mutations-max",
			"mutagens-greater",
			"experience-max",
			"skills-learn-all",
			"skills-reset",
			"level-up",
			"difficulty-easy",
			"difficulty-medium",
			"difficulty-hard",
			"difficulty-hardcore",
			"difficulty-notset",
		]);
	});
});

const absent = (value: number | null | undefined): boolean =>
	value === undefined || value === null;

describe("skills", () => {
	const skillLevels = (doc: JsonValue): (number | null)[] =>
		(requireArrayAt(doc, "skills") ?? []).map((row) => {
			if (!isJsonObject(row)) return null;
			return numberAt(row, "level") ?? null;
		});

	test(
		"exposes every skill, so a level cannot land on the wrong one",
		async () => {
			const doc = await witcher3.decode(largeSave());
			const skills = requireArrayAt(doc, "skills");
			expect(skills).toHaveLength(167);
			const levels = skillLevels(doc);
			expect(levels.filter((level) => level !== null)).toHaveLength(148);
			expect(levels.filter((level) => level === null)).toHaveLength(19);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"stages a level for every skill that is not already there",
		async () => {
			const doc = await witcher3.decode(largeSave());
			const edits =
				witcher3.actions.find((a) => a.id === "skills-learn-all")?.plan(doc) ??
				[];
			expect(edits).toHaveLength(132);
			expect(new Set(edits.map((edit) => [...edit.path].join("."))).size).toBe(
				132,
			);
			for (const edit of edits) {
				expect(typeof edit.after).toBe("number");
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"learns every skill in a rebuilt save, resizing nothing",
		async () => {
			const bytes = largeSave();
			const doc = await witcher3.decode(bytes);
			const edits =
				witcher3.actions.find((a) => a.id === "skills-learn-all")?.plan(doc) ??
				[];
			let folded = doc;
			for (const edit of edits)
				folded = setAtPath(folded, edit.path, edit.after);

			const verdict = await verifyRoundTrip(witcher3, bytes, folded, true);
			expect(verdict.kind).toBe("semantic");

			const back = await witcher3.decode(await witcher3.encode(folded));
			const rows = requireArrayAt(back, "skills");
			const capped = rows.filter(
				(row) => isJsonObject(row) && !absent(numberAt(row, "level")),
			);
			expect(capped).toHaveLength(148);
			for (const row of capped) {
				if (!isJsonObject(row)) throw new Error("not a row");
				expect(numberAt(row, "level")).toBe(numberAt(row, "maxLevel"));
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"caps each skill at its own maximum, not at 3",
		async () => {
			const doc = await witcher3.decode(largeSave());
			const rows = requireArrayAt(doc, "skills");
			const caps = new Map<number, number>();
			for (const row of rows) {
				if (!isJsonObject(row)) continue;
				if (absent(numberAt(row, "level"))) continue;
				const cap = numberAt(row, "maxLevel");
				if (cap === undefined || cap === null) continue;
				caps.set(cap, (caps.get(cap) ?? 0) + 1);
			}
			expect([...caps.entries()].sort((a, b) => a[0] - b[0])).toEqual([
				[1, 39],
				[2, 3],
				[3, 106],
			]);

			const edits =
				witcher3.actions.find((a) => a.id === "skills-learn-all")?.plan(doc) ??
				[];
			for (const edit of edits) {
				const index = edit.path[1];
				if (typeof index !== "number") throw new Error("no index");
				const row = rows[index];
				if (row === undefined || !isJsonObject(row)) {
					throw new Error("no row");
				}
				expect(edit.after).toBeLessThanOrEqual(numberAt(row, "maxLevel") ?? 3);
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"writes one skill's level and no other",
		async () => {
			const bytes = largeSave();
			const doc = await witcher3.decode(bytes);
			const skills = requireArrayAt(doc, "skills");
			const at = skills.findIndex(
				(row) => isJsonObject(row) && stringAt(row, "name") === "S_Sword_3",
			);
			expect(at).toBeGreaterThanOrEqual(0);
			const before = stringAt(skills[at], "name");
			const edited = setAtPath(doc, ["skills", at, "level"], 4);
			const rebuilt = await witcher3.encode(edited);
			const back = await witcher3.decode(rebuilt);

			const rows = requireArrayAt(back, "skills");
			expect(stringAt(rows[at], "name")).toBe(before);
			expect(numberAt(rows[at], "level")).toBe(4);

			const norm = (value: number | null | undefined) =>
				value === null || value === undefined ? null : value;
			const moved = rows.filter(
				(row, index) =>
					norm(isJsonObject(row) ? numberAt(row, "level") : null) !==
					norm(skillLevels(doc)[index]),
			);
			expect(moved).toHaveLength(1);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"resets every skill back to level 0",
		async () => {
			const bytes = largeSave();
			const doc = await witcher3.decode(bytes);
			const edits =
				witcher3.actions.find((a) => a.id === "skills-reset")?.plan(doc) ?? [];
			expect(edits).toHaveLength(16);
			for (const edit of edits) expect(edit.after).toBe(0);

			let folded = doc;
			for (const edit of edits)
				folded = setAtPath(folded, edit.path, edit.after);
			const verdict = await verifyRoundTrip(witcher3, bytes, folded, true);
			expect(verdict.kind).toBe("semantic");
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("caps the level at what the game has, and says so", async () => {
		const action = witcher3.actions.find((a) => a.id === "skills-learn-all");
		if (action === undefined) throw new Error("no such action");
		expect(action.label).toBe("Max every skill");
		expect(action.description).toContain("level 3");
	});

	test(
		"plans nothing once every skill is already where it would be put",
		async () => {
			const bytes = largeSave();
			const doc = await witcher3.decode(bytes);
			const learn = witcher3.actions.find((a) => a.id === "skills-learn-all");
			if (learn === undefined) throw new Error("no such action");
			let folded = doc;
			for (const edit of learn.plan(doc)) {
				folded = setAtPath(folded, edit.path, edit.after);
			}
			expect(learn.plan(folded)).toHaveLength(0);
		},
		FIXTURE_TIMEOUT_MS,
	);
});

describe("difficulty", () => {
	test("offers one action per difficulty the game is known to have", () => {
		expect(
			witcher3.actions
				.map((action) => action.id)
				.filter((id) => id.startsWith("difficulty-")),
		).toEqual([
			"difficulty-easy",
			"difficulty-medium",
			"difficulty-hard",
			"difficulty-hardcore",
			"difficulty-notset",
		]);
	});

	test(
		"labels the current difficulty from the save's own name table",
		async () => {
			const doc = await witcher3.decode(largeSave());
			expect(
				witcher3.summarise(doc).find((r) => r.label === "Difficulty")?.value,
			).toBe("Hard");
			const small = await witcher3.decode(smallSave());
			expect(
				witcher3.summarise(small).find((r) => r.label === "Difficulty")?.value,
			).toBe("Hardcore");
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"greys out a difficulty this build does not have",
		async () => {
			const doc = await witcher3.decode(largeSave());
			const plan = (id: string) =>
				witcher3.actions.find((a) => a.id === id)?.plan(doc) ?? [];
			expect(plan("difficulty-easy")).toHaveLength(1);
			expect(plan("difficulty-medium")).toHaveLength(1);
			expect(plan("difficulty-hardcore")).toHaveLength(0);
			expect(plan("difficulty-hard")).toHaveLength(0);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"stages the index the save itself uses, not an ordinal",
		async () => {
			const doc = await witcher3.decode(largeSave());
			const edits =
				witcher3.actions.find((a) => a.id === "difficulty-easy")?.plan(doc) ??
				[];
			expect(edits).toHaveLength(1);
			const edit = edits[0];
			if (edit === undefined) throw new Error("no edit staged");
			expect(edit.after).toBe(127);
			expect(edit.before).toBe(4632);
			expect([...edit.path]).toEqual(["difficulty", "index"]);
			expect(edit.label).toBe("Difficulty: Easy");
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"changes the difficulty in the rebuilt save and reads it back",
		async () => {
			const doc = await witcher3.decode(largeSave());
			const edits =
				witcher3.actions.find((a) => a.id === "difficulty-easy")?.plan(doc) ??
				[];
			const edit = edits[0];
			if (edit === undefined) throw new Error("no edit staged");
			const edited = setAtPath(doc, edit.path, edit.after);
			const back = await witcher3.decode(await witcher3.encode(edited));
			expect(
				witcher3.summarise(back).find((r) => r.label === "Difficulty")?.value,
			).toBe("Easy");
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"carries no difficulty name in the document, so none can go stale",
		async () => {
			const doc = await witcher3.decode(largeSave());
			const branch = objectAt(doc, "difficulty");
			if (branch === undefined) throw new Error("no difficulty branch");
			expect("name" in branch).toBe(false);
			expect(Array.isArray(branch.choices)).toBe(true);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"gives a blank skill slot a null level rather than a fake zero",
		async () => {
			const doc = await witcher3.decode(largeSave());
			const rows = requireArrayAt(doc, "skills");
			const blanks = rows.filter(
				(row) =>
					isJsonObject(row) &&
					absent(numberAt(row, "level")) &&
					absent(numberAt(row, "maxLevel")),
			);
			expect(blanks).toHaveLength(19);
			expect(
				blanks.map((row) =>
					isJsonObject(row) ? stringAt(row, "name") : undefined,
				),
			).toEqual([
				"empty slot 0",
				"empty slot 29",
				"empty slot 72",
				"empty slot 73",
				"empty slot 74",
				"empty slot 75",
				"empty slot 76",
				"empty slot 77",
				"empty slot 78",
				"empty slot 80",
				"empty slot 81",
				"empty slot 83",
				"empty slot 85",
				"empty slot 100",
				"empty slot 121",
				"empty slot 122",
				"empty slot 125",
				"empty slot 151",
				"empty slot 158",
			]);
			const edits =
				witcher3.actions.find((a) => a.id === "skills-learn-all")?.plan(doc) ??
				[];
			for (const edit of edits) {
				const index = edit.path[1];
				if (typeof index !== "number") throw new Error("no index");
				const row = rows[index];
				if (row === undefined || !isJsonObject(row)) {
					throw new Error("no row");
				}
				expect(absent(numberAt(row, "level"))).toBe(false);
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"every difficulty a save can reach survives a rebuild",
		async () => {
			const bytes = largeSave();
			for (const action of witcher3.actions) {
				if (!action.id.startsWith("difficulty-")) continue;
				const doc = await witcher3.decode(bytes);
				const edits = action.plan(doc);
				if (edits.length === 0) continue;
				const edit = edits[0];
				if (edit === undefined) throw new Error("no edit staged");
				const edited = setAtPath(doc, edit.path, edit.after);
				const verdict = await verifyRoundTrip(witcher3, bytes, edited, true);
				expect({ id: action.id, kind: verdict.kind }).toEqual({
					id: action.id,
					kind: "semantic",
				});
			}
		},
		FIXTURE_TIMEOUT_MS,
	);
});
