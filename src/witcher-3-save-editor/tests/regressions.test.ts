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

/**
 * Regressions for the second adversarial review round.
 *
 * Every case here was found by attacking the code with an input the committed
 * fixtures do not contain — a hostile buffer, a level past the XP table, a quest
 * id with a control byte, a store that is already full. None of them was a type
 * error or a failing test at the time, which is the point of the file.
 */

/** A document as an object, narrowed rather than cast. */
const asObject = (value: JsonValue): { readonly [key: string]: JsonValue } => {
	if (!isJsonObject(value)) throw new Error("expected a JSON object");
	return value;
};

describe("a resizing action predicts the chunk count, not only the payload size", () => {
	test(
		"mutations-max stages a `chunks` edit on the single-chunk fixture",
		async () => {
			// `8559a` is one chunk holding the whole payload, so *any* growth
			// re-chunks it: `rechunk` splits by the first chunk's decompressed size
			// and `ceil(total / unit)` becomes 2. The plan used to stage
			// `payloadBytes` alone, so the rebuild read back `chunks: 2` against the
			// document's `1` — reported unsound at character 90, with nothing saying
			// which field disagreed. The 5-chunk fixture never moved its count, which
			// is why only one fixture exposes this.
			const doc = await witcher3.decode(smallSave());
			const container = objectAt(doc, "container");
			expect(numberAt(container, "chunks")).toBe(1);
			const plan = witcher3.actions.find((a) => a.id === "mutations-max");
			if (plan === undefined) throw new Error("no mutations-max action");
			const edits = plan.plan(doc);
			const chunkEdit = edits.find(
				(e) => e.path.join(".") === "container.chunks",
			);
			// Staged, and to the value the writer will actually produce.
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
			// The end-to-end form of the same claim: plan, fold, rebuild, decode, and
			// compare the whole document. Both resizing actions failed this on `8559a`
			// before the chunk count was staged.
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
		// The button is enabled from `plan(doc).length`, so a plan that returns a
		// `65535 → 65535` no-op both kept the button live and listed a change that
		// changes nothing.
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
	/** A curve shaped like a real save's: a sentinel, levels 1..50, nothing above. */
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
		// The measured save: a level-55 character whose `used` is exactly
		// `84000 + 5 × 2000 = 94000`. Before the sentinel's `requiredExp` was read,
		// both ends of the subtraction were `null` and the summary said "not
		// derivable" for every New Game+ character — three of the seven reference
		// saves.
		const curve = curveWithSentinel();
		expect({
			// 2000 per level above 50, less the 1886 already banked.
			level55: experienceToNextLevel(curve, 55, { free: 1886, used: 94000 }),
			// The identity still guards: a `used` that does not match the curve is
			// refused rather than extrapolated from.
			mismatched: experienceToNextLevel(curve, 55, { free: 1886, used: 123 }),
			// A level *below* the table is a gap, not an extension.
			inTheGap: experienceToNextLevel(curve, 25, { free: 0, used: 0 }),
			// No free amount means nothing to compute.
			noFree: experienceToNextLevel(curve, 55, { free: null, used: 94000 }),
		}).toEqual({
			level55: 114,
			mismatched: null,
			inTheGap: null,
			noFree: null,
		});
	});

	test("a curve with no sentinel still refuses rather than guessing", () => {
		// The header promises `null` rather than a guess, and the synthesis must not
		// invent an increment when the save does not carry one.
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
		// `q203\x1f_what_happend` is a real fact name in the reference corpus. The
		// id had to be followed by `_` or the end, so the fact was dropped and
		// `q203` counted one step short of the save's own total.
		expect({
			controlByte: questIdOf("q203\x1f_what_happend"),
			underscore: questIdOf("q401_eskels_prep_spot_\x1ffound"),
			plain: questIdOf("mq0001_talked_to_brother"),
			// Still rejected where the old pattern rejected them: a trailing letter
			// or digit is not a separator.
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
		// `reflectValue` promised `undefined` for bytes that do not form a value of
		// that type *and length*, but a fixed-width branch ignored the length. With
		// `f32`/`f64` building their `DataView` over the parent buffer, a one-byte
		// length still produced a four- or eight-byte read — and threw `RangeError`
		// when the range ran past the end.
		const data = new Uint8Array(64).fill(0x2a);
		const names = ["foo", "Int32", "Float", "Double"];
		// `00 | u16 nameIdx | u16 typeIdx | u32 size | value`, the struct grammar.
		// The declared `size` is the whole member, so a value narrower than the
		// type is the case under test.
		const struct = (typeIdx: number, size: number): Uint8Array => {
			const b = data.slice();
			const view = new DataView(b.buffer, b.byteOffset);
			b[0] = 0x00; // presence
			view.setUint16(1, 1, true); // name index -> "foo"
			view.setUint16(3, typeIdx, true);
			view.setUint32(5, size, true);
			return b;
		};
		expect({
			int32Five: reflectValue(struct(1, 5), names, "S", 0, 12),
			floatFive: reflectValue(struct(2, 5), names, "S", 0, 12),
			doubleSeven: reflectValue(struct(3, 7), names, "S", 0, 12),
			// A negative length, which the array branch can hand a nested value.
			negative: reflectValue(data, names, "Int32", 0, -1),
		}).toEqual({
			int32Five: undefined,
			floatFive: undefined,
			doubleSeven: undefined,
			negative: undefined,
		});
	});

	test("a variable table declaring more records than bytes does not hang", () => {
		// A 36-byte buffer whose footer points at a count of `0xffffffff` looped
		// ~4.3 billion times — about 100 seconds of a blocked main thread, reachable
		// through `decode` on a corrupt file. The count is now bounded by what the
		// buffer can hold.
		const bytes: number[] = [];
		bytes.push(0x42, 0x53, 0x01, 0x00); // a BS token
		bytes.push(0x4d, 0x41, 0x4e, 0x55); // "MANU"
		bytes.push(1, 0, 0, 0, 0, 0, 0, 0);
		bytes.push(1, 0x41, 0, 0, 0, 0, 0x45, 0x4e, 0x4f, 0x44); // name + "ENOD"
		const vtAt = bytes.length;
		bytes.push(0xff, 0xff, 0xff, 0xff); // a count of 0xffffffff
		bytes.push(vtAt, 0, 0, 0, 0x53, 0x45); // footer offset + "SE"
		const data = new Uint8Array(bytes);
		const started = Date.now();
		const tree = readObjectTree(data);
		expect({
			// The file's own figure is reported, so a caller can see it was truncated.
			declared: tree.declared,
			// And it resolved nothing, because nothing could fit.
			resolved: tree.resolved,
			fast: Date.now() - started < 2000,
		}).toEqual({ declared: 0xffffffff, resolved: 0, fast: true });
	});

	test("refuses to write a MANU name longer than its length byte", async () => {
		// The writer's bound, through the real path: an item whose name the format
		// cannot carry is refused rather than written with a wrapped length. Before
		// the bound, a 300-character name was stored as `300 & 0xff = 44`, the rebuilt
		// table parsed 44 characters, and 256 orphan bytes were left between the last
		// name and `ENOD` for the *next* resize to insert into.
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
		// A guard against the fixes above having broken the ordinary path.
		for (const bytes of [smallSave(), largeSave()]) {
			const doc = await witcher3.decode(bytes);
			const rebuilt = await witcher3.decode(await witcher3.encode(doc));
			expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(doc));
		}
		// And a `.sav` the codec does not understand is refused by name.
		expect(() =>
			readNameTable(decompressContainer(smallSave()).data.slice(0, 64)),
		).toThrow();
	}, 240_000);
});
