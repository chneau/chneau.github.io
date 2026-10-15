import { describe, expect, test } from "bun:test";
import { applyEdits, isJsonObject, type JsonValue } from "../../shared";
import { arrayAt, numberAt, objectAt } from "../../shared/save/json";
import { decompressContainer } from "../lib/container";
import { witcher3 } from "../lib/format";
import { readNameTable } from "../lib/names";
import { readObjectTree } from "../lib/objects";
import { questIdOf } from "../lib/quests";
import { reflectValue } from "../lib/reflect";
import { experienceToNextLevel, type LevelDefinition } from "../lib/stats";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

const asObject = (value: JsonValue): { readonly [key: string]: JsonValue } => {
	if (!isJsonObject(value)) throw new Error("expected a JSON object");
	return value;
};

describe("a resizing action predicts the chunk count, not only the payload size", () => {
	test(
		"mutations-max stages a `chunks` edit on the single-chunk fixture",
		async () => {
			const doc = await witcher3.decode(smallSave());
			const container = objectAt(doc, "container");
			expect(numberAt(container, "chunks")).toBe(1);
			const plan = witcher3.actions.find((a) => a.id === "mutations-max");
			if (plan === undefined) throw new Error("no mutations-max action");
			const edits = plan.plan(doc);
			const chunkEdit = edits.find(
				(e) => e.path.join(".") === "container.chunks",
			);
			expect(chunkEdit).toEqual({
				id: "container.chunks=2",
				label: "Chunk count",
				path: ["container", "chunks"],
				before: 1,
				after: 2,
			});
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"every resizing plan's edits survive a rebuild, on the single-chunk save",
		async () => {
			for (const id of ["mutations-max", "mutagens-greater"]) {
				const doc = await witcher3.decode(smallSave());
				const action = witcher3.actions.find((a) => a.id === id);
				if (action === undefined) throw new Error(`no ${id} action`);
				const edits = action.plan(doc);
				expect({ id, planned: edits.length > 0 }).toEqual({
					id,
					planned: true,
				});
				const working = applyEdits(doc, edits);
				const reread = await witcher3.decode(await witcher3.encode(working));
				expect({
					id,
					identical: JSON.stringify(reread) === JSON.stringify(working),
				}).toEqual({ id, identical: true });
			}
		},
		FIXTURE_TIMEOUT_MS,
	);
});

describe("the wallet action greys out at the ceiling", () => {
	test("planning against a full wallet stages nothing", () => {
		const base: JsonValue = { saveVersion: "66/29/164" };
		const withCrowns = (quantity: number): JsonValue => ({
			...base,
			items: [{ name: "Crowns", quantity, slot: 0, durability: null }],
		});
		const action = witcher3.actions.find((a) => a.id === "crowns-max");
		if (action === undefined) throw new Error("no crowns-max action");
		expect({
			belowCeiling: action.plan(withCrowns(397)).length,
			atCeiling: action.plan(withCrowns(65_535)).length,
			emptyWallet: action.plan(base).length,
		}).toEqual({ belowCeiling: 1, atCeiling: 0, emptyWallet: 0 });
	});
});

describe("the XP curve past its last explicit row", () => {
	const curveWithSentinel = (): readonly LevelDefinition[] => [
		{
			level: -1,
			requiredTotalExp: -1,
			addedSkillPoints: 1,
			requiredExp: 2000,
		},
		{
			level: 1,
			requiredTotalExp: null,
			addedSkillPoints: null,
			requiredExp: null,
		},
		{ level: 50, requiredTotalExp: 84000, addedSkillPoints: 1, requiredExp: 1 },
	];

	test("synthesises levels above the table from the sentinel", () => {
		const curve = curveWithSentinel();
		expect({
			level55: experienceToNextLevel(curve, 55, { free: 1886, used: 94000 }),
			mismatched: experienceToNextLevel(curve, 55, { free: 1886, used: 123 }),
			inTheGap: experienceToNextLevel(curve, 25, { free: 0, used: 0 }),
			noFree: experienceToNextLevel(curve, 55, { free: null, used: 94000 }),
		}).toEqual({
			level55: 114,
			mismatched: null,
			inTheGap: null,
			noFree: null,
		});
	});

	test("a curve with no sentinel still refuses rather than guessing", () => {
		const withoutSentinel: readonly LevelDefinition[] = [
			{
				level: 1,
				requiredTotalExp: null,
				addedSkillPoints: null,
				requiredExp: null,
			},
			{
				level: 50,
				requiredTotalExp: 84000,
				addedSkillPoints: 1,
				requiredExp: 1,
			},
		];
		expect(
			experienceToNextLevel(withoutSentinel, 55, { free: 0, used: 84000 }),
		).toBeNull();
	});
});

describe("a quest id separated by a control byte", () => {
	test("joins the quest instead of being dropped", () => {
		expect({
			controlByte: questIdOf("q203\x1f_what_happend"),
			underscore: questIdOf("q401_eskels_prep_spot_\x1ffound"),
			plain: questIdOf("mq0001_talked_to_brother"),
			trailingLetter: questIdOf("mq1234x"),
			fiveDigits: questIdOf("mq12345"),
			tooShort: questIdOf("mq12"),
			notAQuest: questIdOf("xq123"),
		}).toEqual({
			controlByte: "q203",
			underscore: "q401",
			plain: "mq0001",
			trailingLetter: undefined,
			fiveDigits: undefined,
			tooShort: undefined,
			notAQuest: undefined,
		});
	});
});

describe("hostile input does not take the process down", () => {
	test("a scalar narrower than its type is refused, not read past", () => {
		const data = new Uint8Array(64).fill(0x2a);
		const names = ["foo", "Int32", "Float", "Double"];
		const struct = (typeIdx: number, size: number): Uint8Array => {
			const b = data.slice();
			const view = new DataView(b.buffer, b.byteOffset);
			b[0] = 0x00;
			view.setUint16(1, 1, true);
			view.setUint16(3, typeIdx, true);
			view.setUint32(5, size, true);
			return b;
		};
		expect({
			int32Five: reflectValue(struct(1, 5), names, "S", 0, 12),
			floatFive: reflectValue(struct(2, 5), names, "S", 0, 12),
			doubleSeven: reflectValue(struct(3, 7), names, "S", 0, 12),
			negative: reflectValue(data, names, "Int32", 0, -1),
		}).toEqual({
			int32Five: undefined,
			floatFive: undefined,
			doubleSeven: undefined,
			negative: undefined,
		});
	});

	test("a variable table declaring more records than bytes does not hang", () => {
		const bytes: number[] = [];
		bytes.push(0x42, 0x53, 0x01, 0x00);
		bytes.push(0x4d, 0x41, 0x4e, 0x55);
		bytes.push(1, 0, 0, 0, 0, 0, 0, 0);
		bytes.push(1, 0x41, 0, 0, 0, 0, 0x45, 0x4e, 0x4f, 0x44);
		const vtAt = bytes.length;
		bytes.push(0xff, 0xff, 0xff, 0xff);
		bytes.push(vtAt, 0, 0, 0, 0x53, 0x45);
		const data = new Uint8Array(bytes);
		const started = Date.now();
		const tree = readObjectTree(data);
		expect({
			declared: tree.declared,
			resolved: tree.resolved,
			fast: Date.now() - started < 2000,
		}).toEqual({ declared: 0xffffffff, resolved: 0, fast: true });
	});

	test("refuses to write a MANU name longer than its length byte", async () => {
		const doc = await witcher3.decode(smallSave());
		const items = arrayAt(doc, "items") ?? [];
		const edited: JsonValue = {
			...asObject(doc),
			items: [
				...items,
				{ name: "Z".repeat(300), quantity: 1, slot: 0, durability: null },
			],
		};
		await expect(witcher3.encode(edited)).rejects.toThrow(/at most 255 bytes/);
	}, 240_000);

	test("a decode still works after all of it", async () => {
		for (const bytes of [smallSave(), largeSave()]) {
			const doc = await witcher3.decode(bytes);
			const rebuilt = await witcher3.decode(await witcher3.encode(doc));
			expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(doc));
		}
		expect(() =>
			readNameTable(decompressContainer(smallSave()).data.slice(0, 64)),
		).toThrow();
	}, 240_000);
});
