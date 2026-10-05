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
// `collectLeaves` is not on the shared barrel — it is an inspector detail — so
// it is imported from its module rather than widening the barrel's surface.
import { collectLeaves, objectAt } from "../../shared/save/json";
import { decompressContainer } from "../lib/container";
import { witcher3 } from "../lib/format";
import { locateWritable } from "../lib/write";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

/**
 * The codec contract, against real saves.
 *
 * `lib/` is written to the shape of seven reference files and has been run
 * against them by hand. This suite is the committed half of that claim. Every
 * test here reads a file the game actually wrote — there is no synthetic fixture
 * for the document-level assertions — because the property under test is
 * specifically about bytes that came from the game.
 *
 * ## Why both fixtures, every time
 *
 * The two saves are two builds, and the difference between them is a contract
 * rather than noise:
 *
 *  - `8559a` decodes progression and finds no wallet. Its build's item records
 *    use a different shape, and it holds none of the records `locateMoney` looks
 *    for. The editor must say so in words and offer no money edit.
 *  - `52586` decodes both.
 *
 * A test that only used the larger file would pass while the smaller one — a save
 * a player is quite likely to have, from an earlier patch of the game — offered
 * a wallet button that patched an unrelated record.
 */

/** The document as an object, read through a narrowing helper rather than a cast. */
const asObject = (value: JsonValue): { readonly [key: string]: JsonValue } => {
	if (!isJsonObject(value)) {
		throw new Error("expected a JSON object in the decoded document");
	}
	return value;
};

/** One summary row's value, by label. */
const rowValue = (doc: JsonValue, label: string): string | undefined =>
	witcher3.summarise(doc).find((row) => row.label === label)?.value;

/** The staged edits one action would produce, with a useful failure message. */
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
		"reads the small save's progression and refuses to guess at its wallet",
		async () => {
			const doc = await witcher3.decode(smallSave());
			expect({
				format: asObject(doc).format,
				game: asObject(doc).game,
				build: asObject(doc).build,
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
				// Not a guess: `locateMoney` found nothing, and the codec says the
				// build is unrecognised rather than pretending the field is zero.
				build: "unrecognised",
				level: 4,
				difficulty: "Hardcore",
				skillPoints: { free: 9, used: 0 },
				experience: { free: 17, used: 3000 },
				chunks: 1,
				headerSize: 3084,
				items: 0,
				// Fewer than the 167 slots the player record holds, because the codec
				// reports only the skills whose level was read: a slot with no level is
				// a slot the save has not filled in, and listing it as level 0 would be
				// claiming a skill the character does not have.
				skills: 148,
			});
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"reads the large save's progression and its wallet",
		async () => {
			const doc = await witcher3.decode(largeSave());
			expect({
				build: asObject(doc).build,
				level: getAtPath(doc, ["level"]),
				difficulty: rowValue(doc, "Difficulty"),
				skillPoints: getAtPath(doc, ["skillPoints"]),
				experience: getAtPath(doc, ["experience"]),
				chunks: getAtPath(doc, ["container", "chunks"]),
				items: arrayAt(doc, "items")?.length,
				skills: arrayAt(doc, "skills")?.length,
			}).toEqual({
				build: "52586",
				level: 7,
				difficulty: "Hard",
				skillPoints: { free: 14, used: 0 },
				experience: { free: 702, used: 6000 },
				chunks: 5,
				items: 615,
				skills: 148,
			});
			// The wallet is the `u16` quantity of the `Crowns` item, not a field of
			// its own. Exposing it twice would give the document two fields over one
			// pair of bytes, and editing one would silently disagree with the other —
			// which the round-trip check then correctly reports as unsound.
			expect(rowValue(doc, "Crowns")).toBe("2996");
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"exposes only values, never the offsets they were found at",
		async () => {
			// The document must survive being typed into by hand and being rebuilt: a
			// stored address would be wrong for any other save of the same build, and
			// three saves of this build put the wallet at 3640748, 3640300 and
			// 3640999. So the addresses live in `locateWritable` and the document
			// carries the numbers only — asserted by walking every leaf and requiring
			// that the four bytes a wallet sits at never appear anywhere.
			const doc = await witcher3.decode(largeSave());
			const found = locateWritable(decompressContainer(largeSave()).data);
			const wallet = found.money;
			if (wallet === undefined) throw new Error("the fixture has no wallet");
			// Every address this codec knows, checked one at a time. A single digit
			// search would be meaningless — these numbers appear as substrings of item
			// quantities by coincidence — so each is searched for as a distinct token
			// in the document, which is the form a stored offset would take.
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
			// The workbench proves a rebuild by decoding it and comparing the resulting
			// *document* with the one that was encoded, and the payload it carries is
			// exactly the sort of field that differs by definition — the document
			// describes the pre-edit bytes while `encode` writes post-edit ones. So
			// the scaffold must be invisible to `JSON.stringify`, or every rebuild
			// would be reported unsound.
			const doc = await witcher3.decode(smallSave());
			expect(Object.keys(asObject(doc))).toContain("scaffold");

			// The branch really does carry the payload, and really does hide it: an
			// `Object.keys` that omits it proves the property is non-enumerable, which
			// is the mechanism — a JSON spread in `setAtPath` copies enumerable
			// properties only, so this is what survives an edit.
			const branch = asObject(getAtPath(doc, ["scaffold"]) ?? null);
			expect(Object.keys(branch)).toEqual([]);
			expect("bytes" in branch).toBe(true);
			expect(Object.getOwnPropertyDescriptor(branch, "bytes")?.enumerable).toBe(
				false,
			);
			// And nothing of it reaches the serialised comparison the round-trip check
			// makes: the branch serialises as `{}` and the whole document therefore ends
			// with an empty scaffold rather than with five megabytes of token stream.
			// Checked on the text rather than through a parse-and-compare, because the
			// claim is about what `JSON.stringify` *omits*.
			expect(JSON.stringify(getAtPath(doc, ["scaffold"]))).toBe("{}");
			expect(JSON.stringify(doc).endsWith('"scaffold":{}}')).toBe(true);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("refuses a file that is not a Witcher 3 save", async () => {
		// The wrong-file case, which is what somebody who picks the wrong `.sav`
		// actually hits. The message has to name the problem rather than reporting
		// a parse failure three layers down.
		await expect(witcher3.decode(new Uint8Array(64))).rejects.toThrow(
			/does not look like a Witcher 3 save/,
		);
	});

	test("refuses a file whose container is well-formed but has no chunks", async () => {
		// Hand-built rather than truncated from a fixture: no real save has an empty
		// chunk table, so this has to construct the header rather than hope the
		// fixture contains the case. The rejection comes from the reader rather
		// than the codec's own zero-chunk guard, because the reader refuses first —
		// and it should: there is nothing to decode and nothing to rebuild.
		const file = new Uint8Array(3084);
		file.set(new TextEncoder().encode("SNFHFZLC"), 0);
		new DataView(file.buffer).setUint32(12, 3084, true);
		await expect(witcher3.decode(file)).rejects.toThrow(/chunk table is empty/);
	});
});

describe("the summary", () => {
	test(
		"says in words that the wallet is unsupported on this build",
		async () => {
			// The honest-degradation contract, in the one place a player reads it. A
			// zero here would be a claim about the player's money that nobody
			// measured, and an empty string would look like a bug.
			const doc = await witcher3.decode(smallSave());
			expect(rowValue(doc, "Crowns")).toBe("not supported for this build");
			const crowns = witcher3
				.summarise(doc)
				.find((row) => row.label === "Crowns");
			// Worth noticing exactly when it is *missing*: this is the case of a save
			// the editor can read but cannot write money for.
			expect(crowns?.emphasis).toBe(true);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"reports a figure the save does carry without qualifying it",
		async () => {
			const doc = await witcher3.decode(smallSave());
			expect({
				build: rowValue(doc, "Build"),
				level: rowValue(doc, "Level"),
				difficulty: rowValue(doc, "Difficulty"),
				skillPoints: rowValue(doc, "Skill points"),
				experience: rowValue(doc, "Experience"),
			}).toEqual({
				build: "unrecognised",
				level: "4",
				difficulty: "Hardcore",
				skillPoints: "9 free",
				experience: "17 available",
			});
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("omits a row for a field the document has lost rather than reporting zero", async () => {
		// A document the inspector has edited is not a save any more, and the
		// summary is asked to describe it anyway. Reporting "0 free" for a
		// missing branch would be a statement about the player nobody measured.
		const rows = witcher3.summarise({ build: "52586", items: [] });
		expect(rows.map((row) => row.label)).toEqual([
			"Build",
			"Level",
			"Difficulty",
			"Crowns",
		]);
		// "not found" rather than "0": a zero would be a claim about the player's
		// progress that nothing in this document supports.
		expect(rows.map((row) => row.value)).toEqual([
			"52586",
			"not found",
			"unknown",
			"not supported for this build",
		]);
		// And the two progression rows really are absent rather than zeroed.
		expect(rows.some((row) => row.label === "Skill points")).toBe(false);
	});
});

describe("the round trip", () => {
	test(
		"rebuilds an unedited save and reads back the same document",
		async () => {
			// `semantic`, and never `identical`, and that is expected rather than a
			// defect: LZ4 admits many valid encodings of the same input, so a
			// compressor that makes no attempt to match the game's byte for byte
			// produces a different — equally valid — compressed stream. What has to
			// hold is that the payload decodes back to exactly the same bytes and the
			// document reads back identically, and `identical` here would mean the
			// compressor had accidentally started reproducing a particular reference
			// encoder, which is not a property worth having.
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
			// Five chunks and a wallet, so the envelope bookkeeping and the item loop
			// are both exercised by the rebuild rather than only the single-chunk path.
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
			// The claim a player actually relies on. Not `lossless-edit`: the bytes
			// genuinely differ, because the values genuinely changed. The document
			// reading back identically is the proof that the write landed and that
			// nothing else moved.
			const file = largeSave();
			const doc = await witcher3.decode(file);
			const edited = setAtPath(doc, ["items", 13, "quantity"], 40_000);
			const verdict = await verifyRoundTrip(witcher3, file, edited, true);
			expect(verdict.kind).toBe("semantic");

			const rebuilt = await witcher3.encode(edited);
			const back = await witcher3.decode(rebuilt);
			expect(getAtPath(back, ["items", 13, "quantity"])).toBe(40_000);
			// Everything the edit did not touch still reads as it did.
			expect({
				level: getAtPath(back, ["level"]),
				skillPoints: getAtPath(back, ["skillPoints"]),
				experience: getAtPath(back, ["experience"]),
				items: arrayAt(back, "items")?.length,
			}).toEqual({
				level: 7,
				skillPoints: { free: 14, used: 0 },
				experience: { free: 702, used: 6000 },
				items: 615,
			});
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"fails loudly when the rebuild does not read back, rather than reporting success",
		async () => {
			// The check is only worth anything if it can fail. A document whose
			// progression has been tampered with to a value no save could hold must
			// come back `failed` with a reason, because that is the state a user would
			// be in if the encoder wrote the wrong offset.
			const file = smallSave();
			const doc = await witcher3.decode(file);
			const tampered = setAtPath(doc, ["difficulty", "index"], 999_999);
			const verdict = await verifyRoundTrip(witcher3, file, tampered, true);
			expect(verdict.kind).toBe("failed");
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("refuses a document the editor did not decode, rather than inventing a save", async () => {
		// Without the scaffold there is nothing to rebuild: the payload is five
		// megabytes of token stream that only the save itself contains. Producing
		// a file anyway would be producing a file that loads into a game as an
		// empty world.
		await expect(witcher3.encode({ level: 20 })).rejects.toThrow(
			/no save attached to it/,
		);
	});
});

describe("editing a document", () => {
	test(
		"keeps the save attached through the workbench's own fold",
		async () => {
			// The bug this exists for, and it happened once. `setAtPath` rebuilds the
			// root with an object spread, which copies only *enumerable* properties —
			// so a scaffold defined on the root is destroyed by the first edit, and
			// `encode` then refuses and the player's work is lost. The codec hangs the
			// scaffold off a branch no edit rebuilds, as a non-enumerable property of
			// its own object, and this asserts that directly rather than trusting it:
			// one edit, then a rebuild, then the bytes compared with the original.
			const file = smallSave();
			const doc = await witcher3.decode(file);
			const original = decompressContainer(file).data;

			// The fold is the one the workbench performs — `applyEdits` is a reduce
			// over `setAtPath`, so going through the edits themselves exercises the
			// real path rather than a hand-rolled imitation of it.
			const edits = effectiveEdits(planFor("level-up", doc), doc);
			expect(edits).toHaveLength(1);
			const folded = applyEdits(doc, edits);
			expect(getAtPath(folded, ["level"])).toBe(9);

			const rebuilt = await witcher3.encode(folded);
			const back = decompressContainer(rebuilt).data;
			expect({ payloadBytes: back.length }).toEqual({
				payloadBytes: original.length,
			});
			// One field moved and the save survived: if the scaffold had been lost,
			// `encode` would have thrown and there would be no `rebuilt` at all.
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
			// The array fold is a different code path inside `setAtPath` — it slices
			// rather than spreads — so an edit into `items[13]` is a second, distinct
			// way for the scaffold to be dropped if the branch is ever moved.
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
			// `setAtPath` is copy-on-write for a reason the round-trip proof depends
			// on: the pre-edit document is the only honest record of what was on disk,
			// so the staged-edit list can show a real "before" and the check has
			// something true to compare against.
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
			// The exact staged edits, which is the only part of a cheat that matters:
			// a button that stages the wrong path, or the wrong value, is a cheat that
			// quietly does something else.
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
		"offer no wallet edits at all on the build whose records are unknown",
		async () => {
			// `[]` is how an action greys itself out, and this is the case it exists
			// for. Offering a wallet button here would patch one of the 1,845 records
			// the shape alone matches — of which exactly one is the player's.
			const doc = await witcher3.decode(smallSave());
			expect(planFor("crowns-max", doc)).toEqual([]);
			expect(planFor("crowns-round", doc)).toEqual([]);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"plan exactly the progression edits, on both builds",
		async () => {
			// Progression is found structurally rather than by build identity, so these
			// three work everywhere — which is the difference between the wallet and
			// everything else in this codec.
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
			// A button that stages a no-op is noise in the list and makes the
			// round-trip check claim work it did not do.
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
		"are pure: no plan touches the document it was given",
		async () => {
			// A plan that mutated its input would leave the working document
			// disagreeing with the one the round-trip check compares against, and the
			// check would then report a defect nobody made.
			for (const [label, bytes] of [
				["8559a", smallSave()],
				["52586", largeSave()],
			] as const) {
				const doc = await witcher3.decode(bytes);
				const before = JSON.stringify(doc);
				for (const action of witcher3.actions) {
					expect({ label, action: action.id }).toEqual({
						label,
						action: action.id,
					});
					action.plan(doc);
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
			// Idempotence is what lets the workbench stage an action repeatedly without
			// the list growing a duplicate each time.
			const doc = await witcher3.decode(smallSave());
			for (const action of witcher3.actions) {
				expect({ action: action.id }).toEqual({ action: action.id });
				expect(JSON.stringify(action.plan(doc))).toBe(
					JSON.stringify(action.plan(doc)),
				);
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"reach the value they claim, through a rebuilt file",
		async () => {
			// The end of the chain: staged edits → folded document → rebuilt bytes →
			// decoded again. Asserting only the plan would leave the write untested.
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
			id: witcher3.id,
			game: witcher3.game,
			formatLabel: witcher3.formatLabel,
			extensions: witcher3.extensions,
		}).toEqual({
			id: "witcher-3-save-editor",
			game: "The Witcher 3: Wild Hunt",
			formatLabel: "SNFH/FZLC container, LZ4 blocks, REDkit token stream",
			extensions: ["sav"],
		});
		expect(witcher3.defaultPath).toContain("savedata");
	});

	test("carries format notes that are prose rather than placeholders", () => {
		// The notes are the reason the page exists as well as the editor, so an
		// empty body or a stub would leave the page saying nothing.
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

	// The value actions come first because the page renders `actions` in order, and
	// a save editor wants "set my money" above "pick a difficulty".
	test("orders the value actions before the difficulty actions", () => {
		expect(
			witcher3.actions
				.map((action) => action.id)
				.filter((id) => !id.startsWith("difficulty-")),
		).toEqual([
			"crowns-max",
			"crowns-round",
			"skill-points-max",
			"experience-max",
			"level-up",
		]);
	});
});

describe("difficulty", () => {
	/**
	 * Difficulty is a `u16` holding the `MANU` index of the difficulty's name, so
	 * there is no global list of them: the indices differ per game build, and the
	 * two fixtures here share none. Everything below follows from that.
	 */

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
			// Not "index 4632": the label has to come from the save, and this build
			// calls that index "Hard".
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
			// This build knows Easy, Medium, Hard and NotSet, and not Hardcore.
			// Offering Hardcore would mean writing an index out of a different
			// build's name table, which is some other difficulty or none at all.
			expect(plan("difficulty-easy")).toHaveLength(1);
			expect(plan("difficulty-medium")).toHaveLength(1);
			expect(plan("difficulty-hardcore")).toHaveLength(0);
			// Already Hard: nothing to stage.
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
			// 127, not 0: the field holds a `MANU` index. Writing the ordinal would
			// silently set some other difficulty, or none.
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
			// The label is derived from `index` plus `choices`. Storing it would be a
			// second field over one fact: setting `index` left `name` reading "Hard"
			// while the file said "Easy", and the round-trip check called the
			// rebuild unsound. Measured, then removed — the same lesson as `money`.
			expect("name" in branch).toBe(false);
			expect(Array.isArray(branch.choices)).toBe(true);
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
				// `semantic`, never `identical`: re-encoding does not reproduce the
				// game's own LZ4 output even with no edits at all.
				expect({ id: action.id, kind: verdict.kind }).toEqual({
					id: action.id,
					kind: "semantic",
				});
			}
		},
		FIXTURE_TIMEOUT_MS,
	);
});
