import { describe, expect, test } from "bun:test";
import { type JsonValue, verifyRoundTrip, withEdits } from "../../shared";
import { decodeContainer, findNode } from "../lib/container";
import { MAX_ATTRIBUTE, MAX_POINTS, MAX_STREET_CRED } from "../lib/development";
import { cyberpunk2077 } from "../lib/format";
import {
	buildFullSave,
	buildSaveWithoutDevelopment,
	STARTING_ATTRIBUTES,
	STARTING_POINTS,
	STARTING_SKILLS,
} from "./character-save";

/**
 * The codec's contract, against a synthetic save.
 *
 * ## What is and is not proved here
 *
 * **No real Cyberpunk 2077 `sav.dat` exists in any repository this work can
 * reach.** The reference implementation's own round-trip test searches for one at
 * runtime and skips when absent; its committed data is 8.7 MB of JSON catalogues
 * and not a single byte of binary save. So the fixture used throughout is
 * synthetic, built by `tests/synthetic.ts` — code written from the format
 * description and deliberately *not* shared with `lib/`.
 *
 * What that establishes: the codec reads and writes the container, the LZ4
 * chunks, the string pool, the object descriptors and the sparse struct arrays
 * consistently with an independent reading of the format, and a value decoded
 * from a save is written back to the same bytes and read back identically.
 *
 * What it does **not** establish: that a save the game writes has the shape this
 * codec expects, that the node names are the ones a real save uses, or that the
 * enum orders transcribed from the game's `CEnums.json` match the order a real
 * save serialises its arrays in. Those are confirmed against the game's
 * published catalogues and the reference implementation's reading of a real
 * save, but neither has been observed here, and no claim below should be read as
 * having been checked against a file the game produced.
 */

/** The document for a freshly built fixture. */
const decodeFixture = async (): Promise<JsonValue> =>
	cyberpunk2077.decode(buildFullSave());

/** A character section, read out of a decoded document. */
const characterOf = (doc: JsonValue): Record<string, JsonValue> => {
	if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
		throw new Error("The document is not an object.");
	}
	const character = (doc as Record<string, JsonValue>).character;
	if (
		typeof character !== "object" ||
		character === null ||
		Array.isArray(character)
	) {
		throw new Error("The document has no character section.");
	}
	return character as Record<string, JsonValue>;
};

describe("Cyberpunk 2077 codec", () => {
	test("decodes a save into a document the workbench can walk", async () => {
		const doc = await decodeFixture();
		expect(typeof doc).toBe("object");
		const version = (doc as Record<string, JsonValue>).version;
		if (typeof version !== "object" || version === null) {
			throw new Error("No version.");
		}
		expect(version).toMatchObject({
			v1: 269,
			v2: 2310,
			v3: 192,
			ps4w: false,
			// The header's unknown words travel with the document so an untouched
			// save rebuilds to identical bytes; they are shown rather than hidden,
			// because a reader should be able to see what was carried.
			suk: "CyberpunkSaveGame",
			uk0: 0,
			uk1: 0,
			tableEntries: 256,
		});
		// The tree summary is what the header rows read.
		const tree = (doc as Record<string, JsonValue>).tree;
		if (typeof tree !== "object" || tree === null) {
			throw new Error("No tree section.");
		}
		expect((tree as Record<string, JsonValue>).nodes).toBe(8);
	});

	test("projects the character under the game's real field names", async () => {
		const character = characterOf(await decodeFixture());
		expect(character.lifePath).toBe("Streetkid");
		const attributes = character.attributes as Record<string, number>;
		for (const [name, value] of Object.entries(STARTING_ATTRIBUTES)) {
			expect(attributes[name]).toBe(value);
		}
		const points = character.developmentPoints as Record<
			string,
			{ unspent: number; spent: number }
		>;
		expect(points.Attribute).toEqual(STARTING_POINTS.Attribute);
		const skills = character.skills as Record<string, { level: number }>;
		for (const [name, level] of STARTING_SKILLS) {
			expect(skills[name]?.level).toBe(level);
		}
	});

	test("rebuilds an untouched save byte for byte", async () => {
		const original = buildFullSave();
		const doc = await cyberpunk2077.decode(original);
		const rebuilt = await cyberpunk2077.encode(doc);
		expect([...rebuilt]).toEqual([...original]);
	});

	test("round-trips a decoded document through the workbench's own check", async () => {
		// `verifyRoundTrip` is what the page runs before it offers a rebuilt file,
		// so proving it passes here is proving the promise the page makes.
		const original = buildFullSave();
		const doc = await cyberpunk2077.decode(original);
		const verdict = await verifyRoundTrip(cyberpunk2077, original, doc, false);
		expect(verdict.kind).toBe("identical");
	});

	test("rebuilds a save with edits applied and reads back what was asked for", async () => {
		const original = buildFullSave();
		const doc = await decodeFixture();
		// Edits are folded in with the workbench's own `withEdits`, which is what
		// the page does. That matters here: the codec keeps the save's node tree
		// against the decoded document, so a document reached by rebuilding it by
		// hand is a different object and has no tree behind it. Folding edits in
		// place is the supported path.
		const character = characterOf(doc);
		const attributes = character.attributes as Record<string, number>;
		const edited = withEdits(doc, [
			{
				id: "strength",
				label: "Strength",
				path: ["character", "attributes", "Strength"],
				before: attributes.Strength ?? 0,
				after: MAX_ATTRIBUTE,
			},
		]);
		const verdict = await verifyRoundTrip(
			cyberpunk2077,
			original,
			edited,
			true,
		);
		// `semantic`, not `lossless-edit`: the rebuilt file decodes to exactly the
		// values asked for, but its bytes necessarily differ from the original's,
		// because an attribute was changed in them. `lossless-edit` would mean the
		// bytes matched an edited file, which is a different and stronger claim than
		// this format can make.
		expect(verdict.kind).toBe("semantic");

		// And the value really is in the file, not merely in the document.
		const reread = characterOf(
			await cyberpunk2077.decode(await cyberpunk2077.encode(edited)),
		);
		expect((reread.attributes as Record<string, number>).Strength).toBe(
			MAX_ATTRIBUTE,
		);
	});

	test("leaves subsystems it cannot read untouched", async () => {
		// The whole safety argument for carrying the node tree: a cheat on the
		// attributes must not disturb the inventory or the quest facts, which this
		// codec has no vocabulary for at all. A codec that rebuilt the save from the
		// fields it *can* read would wipe them.
		const original = buildFullSave();
		const doc = await decodeFixture();
		const character = characterOf(doc);
		const attributes = character.attributes as Record<string, number>;
		const edited = withEdits(doc, [
			{
				id: "cool",
				label: "Cool",
				path: ["character", "attributes", "Cool"],
				before: attributes.Cool ?? 0,
				after: MAX_ATTRIBUTE,
			},
		]);

		const before = await decodeContainer(original);
		const after = await decodeContainer(await cyberpunk2077.encode(edited));

		for (const name of ["inventory", "FactsDB", "PSData", "StatsSystem"]) {
			const from = findNode(before.root, name);
			const to = findNode(after.root, name);
			if (from === undefined || to === undefined) {
				throw new Error(`The fixture lost its ${name} node.`);
			}
			expect([...to.data]).toEqual([...from.data]);
		}
	});

	test("reads a save with no development data rather than refusing it", async () => {
		// A save this projection cannot read must still open: losing the file
		// because one subsystem is unfamiliar is the opposite of what an editor is
		// for. The summary says so explicitly instead.
		const doc = await cyberpunk2077.decode(buildSaveWithoutDevelopment());
		const rows = cyberpunk2077.summarise(doc);
		expect(rows.some((row) => row.value.includes("not readable"))).toBe(true);
		expect(
			(
				await verifyRoundTrip(
					cyberpunk2077,
					buildSaveWithoutDevelopment(),
					doc,
					false,
				)
			).kind,
		).toBe("identical");
	});

	test("refuses a file that is not a save", async () => {
		await expect(cyberpunk2077.decode(new Uint8Array(512))).rejects.toThrow(
			/not a Cyberpunk 2077 save/,
		);
	});

	test("refuses to rebuild a document that has no save behind it", async () => {
		// A document that has been exported and re-imported carries the readable
		// projection but not the bytes: `decode` remembers the node tree on a
		// non-enumerable property, so a `structuredClone` — and, in the app, a
		// `JSON.parse` of the exported file — comes back without it. Rebuilding
		// from the projection alone would produce a save missing every subsystem
		// this codec cannot name, so it is refused with a message that says what
		// to do. `structuredClone` is the clone that loses it: it copies own
		// *enumerable* properties, exactly as the JSON round-trip does.
		const doc = await decodeFixture();
		const reimported = structuredClone(doc) as JsonValue;
		await expect(cyberpunk2077.encode(reimported)).rejects.toThrow(
			/no node tree behind it/,
		);
	});

	test("refuses a document that is not one this codec wrote", async () => {
		await expect(cyberpunk2077.encode(7)).rejects.toThrow(
			/not a Cyberpunk 2077 save/,
		);
		// A document with the right shape but no character section is refused for
		// the missing section, which is the more specific complaint.
		await expect(
			cyberpunk2077.encode({ version: { v1: 269 } }),
		).rejects.toThrow(/no player development data/);
	});
});

describe("summary", () => {
	test("reports the header, the tree and the character", async () => {
		const rows = cyberpunk2077.summarise(await decodeFixture());
		const valueOfRow = (label: string): string | undefined =>
			rows.find((row) => row.label === label)?.value;
		expect(valueOfRow("Container format")).toBe("v269 (game build 2310)");
		expect(valueOfRow("Nodes in the tree")).toBe("8");
		expect(valueOfRow("Chunks")).toBe("LZ4-compressed");
		expect(valueOfRow("Life path")).toBe("Streetkid");
		expect(valueOfRow("Street Cred")).toContain("12");
		expect(valueOfRow("Character level")).toBe("7");
		// Every attribute is named with the game's own stat name, not an index.
		expect(valueOfRow("Attributes")).toBe(
			"Strength 6, Reflexes 5, TechnicalAbility 4, Intelligence 7, Cool 3",
		);
	});

	test("does not claim a perk point count it did not read", async () => {
		const rows = cyberpunk2077.summarise(await decodeFixture());
		const valueOfRow = (label: string): string | undefined =>
			rows.find((row) => row.label === label)?.value;
		expect(valueOfRow("Perk points")).toBe("3 unspent, 12 spent");
		expect(valueOfRow("Attribute points")).toBe("1 unspent, 8 spent");
	});
});

describe("quick actions", () => {
	test("max attributes targets the five spendable ones and retires the rest", async () => {
		const doc = await decodeFixture();
		const plan = cyberpunk2077.actions[0]?.plan(doc) ?? [];
		const byPath = new Map(
			plan.map((edit) => [edit.path.join("."), edit.after]),
		);
		expect(byPath.get("character.attributes.Strength")).toBe(MAX_ATTRIBUTE);
		expect(byPath.get("character.attributes.Reflexes")).toBe(MAX_ATTRIBUTE);
		expect(byPath.get("character.attributes.TechnicalAbility")).toBe(
			MAX_ATTRIBUTE,
		);
		expect(byPath.get("character.attributes.Intelligence")).toBe(MAX_ATTRIBUTE);
		expect(byPath.get("character.attributes.Cool")).toBe(MAX_ATTRIBUTE);
		// Espionage and Gunslinger are 1.x attributes the 2.0 tree replaced: the
		// reference implementation pins them to zero rather than raising them,
		// because levelling an attribute the game no longer spends desynchronises
		// the character's perk spending. The fixture has neither, so there is
		// nothing to edit — what matters is that they are not in the plan above.
		expect(byPath.has("character.attributes.Espionage")).toBe(false);
		expect(byPath.has("character.attributes.Gunslinger")).toBe(false);
		expect(plan.every((edit) => edit.path[0] === "character")).toBe(true);
	});

	test("drops a retired attribute to zero when the save still has one", async () => {
		// The fixture has neither retired attribute, so the above cannot reach this
		// branch. Built by hand: a save carrying Espionage must have it pinned to
		// zero, not left at whatever the 1.x tree left there.
		const doc = await decodeFixture();
		const character = characterOf(doc);
		const attributes = character.attributes as Record<string, number>;
		const withRetired: JsonValue = {
			...(doc as Record<string, JsonValue>),
			character: {
				...character,
				attributes: { ...attributes, Espionage: 9, Gunslinger: 4 },
			},
		};
		const byPath = new Map(
			(cyberpunk2077.actions[0]?.plan(withRetired) ?? []).map((edit) => [
				edit.path.join("."),
				edit.after,
			]),
		);
		expect(byPath.get("character.attributes.Espionage")).toBe(0);
		expect(byPath.get("character.attributes.Gunslinger")).toBe(0);
	});

	test("refills points to the caps the game enforces", async () => {
		const doc = await decodeFixture();
		const plan = cyberpunk2077.actions[1]?.plan(doc) ?? [];
		const byPath = new Map(
			plan.map((edit) => [edit.path.join("."), edit.after]),
		);
		expect(byPath.get("character.developmentPoints.Attribute.unspent")).toBe(
			MAX_POINTS,
		);
		expect(byPath.get("character.developmentPoints.Primary.unspent")).toBe(
			MAX_POINTS,
		);
		// Secondary is capped at 12, not at the 720 the others take.
		expect(byPath.get("character.developmentPoints.Secondary.unspent")).toBe(
			12,
		);
		// Espionage is pinned to zero, but the fixture already has it at zero, so
		// an edit that would write the value already there is deliberately not
		// staged — that is what makes the action idempotent.
		expect(byPath.has("character.developmentPoints.Espionage.unspent")).toBe(
			false,
		);
	});

	test("plans no edit for a value the save already holds", async () => {
		// The counterpart to the above: an action that stages a no-op would put a
		// row in the staged list claiming work it did not do, and would make the
		// round-trip check report a change where there was none.
		const doc = await decodeFixture();
		const character = characterOf(doc);
		const points = character.developmentPoints as Record<
			string,
			{ unspent: number; spent: number }
		>;
		const alreadyFull: JsonValue = {
			...(doc as Record<string, JsonValue>),
			character: {
				...character,
				developmentPoints: {
					...points,
					Attribute: {
						unspent: MAX_POINTS,
						spent: points.Attribute?.spent ?? 0,
					},
				},
			},
		};
		const plan = cyberpunk2077.actions[1]?.plan(alreadyFull) ?? [];
		expect(
			plan.some(
				(edit) =>
					edit.path.join(".") ===
					"character.developmentPoints.Attribute.unspent",
			),
		).toBe(false);
	});

	test("raises skills and Street Cred but leaves character level alone", async () => {
		const doc = await decodeFixture();
		const plan = cyberpunk2077.actions[2]?.plan(doc) ?? [];
		const byPath = new Map(
			plan.map((edit) => [edit.path.join("."), edit.after]),
		);
		expect(byPath.get("character.skills.StreetCred")).toEqual({
			level: MAX_STREET_CRED,
			exp: 900,
		});
		// A legacy 1.x proficiency, capped at 20 rather than 60.
		expect(byPath.get("character.skills.Assault")).toEqual({
			level: 20,
			exp: 120,
		});
		// Level is the character's own level, not a skill, and the reference
		// deliberately does not touch it.
		expect(byPath.has("character.skills.Level")).toBe(false);
	});

	test("plan is pure: calling it twice changes nothing and stages nothing", async () => {
		const doc = await decodeFixture();
		const before = JSON.stringify(doc);
		const action = cyberpunk2077.actions[0];
		if (action === undefined) throw new Error("No attribute action.");
		expect(JSON.stringify(action.plan(doc))).toBe(
			JSON.stringify(action.plan(doc)),
		);
		expect(JSON.stringify(doc)).toBe(before);
	});

	test("an action with nothing to do plans no edits", async () => {
		// A save already at the caps must produce an empty plan, which is how the
		// workbench greys an action out.
		const doc = await decodeFixture();
		const character = characterOf(doc);
		const attributes = character.attributes as Record<string, number>;
		const attributesAtMax: JsonValue = {
			...(doc as Record<string, JsonValue>),
			character: {
				...character,
				attributes: Object.fromEntries(
					Object.keys(attributes).map((name) => [name, MAX_ATTRIBUTE]),
				),
			},
		};
		expect(cyberpunk2077.actions[0]?.plan(attributesAtMax) ?? []).toEqual([]);
	});

	test("every action's plan survives a decode, encode and re-decode", async () => {
		// The end-to-end promise for a cheat: stage what the button says, rebuild,
		// read back, and the values are the ones asked for.
		const original = buildFullSave();
		let current: JsonValue = await decodeFixture();

		for (const action of cyberpunk2077.actions) {
			// The workbench's own `applyEdits` is what stages these on the page, so
			// using it here means the test exercises the real path-folding rather
			// than a re-implementation of it.
			const edits = action.plan(current);
			if (edits.length === 0) continue;
			current = withEdits(current, edits);
		}

		const verdict = await verifyRoundTrip(
			cyberpunk2077,
			original,
			current,
			true,
		);
		expect(verdict.kind).not.toBe("failed");

		const finalCharacter = characterOf(
			await cyberpunk2077.decode(await cyberpunk2077.encode(current)),
		);
		const attributes = finalCharacter.attributes as Record<string, number>;
		for (const name of Object.keys(STARTING_ATTRIBUTES)) {
			expect(attributes[name]).toBe(MAX_ATTRIBUTE);
		}
		const skills = finalCharacter.skills as Record<string, { level: number }>;
		expect(skills.StreetCred?.level).toBe(MAX_STREET_CRED);
		expect(skills.Assault?.level).toBe(20);
		// Character level is untouched by every action.
		expect(skills.Level?.level).toBe(7);
	});

	test("says nothing about money, which this codec cannot write", async () => {
		// Money is `Items.money` as an inventory item whose `quantity` sits behind
		// a version-dependent `ItemID` layout. No committed save confirms those
		// layouts, so there is no money action and no summary row claiming one.
		for (const action of cyberpunk2077.actions) {
			expect(action.label.toLowerCase()).not.toContain("money");
			expect(action.description.toLowerCase()).not.toContain("edol");
		}
		const rows = cyberpunk2077.summarise(await decodeFixture());
		expect(rows.some((row) => row.label.toLowerCase().includes("money"))).toBe(
			false,
		);
	});

	test("does not offer to unlock perks without the game's perk tree", async () => {
		// The 2.0 perk names live in the TweakDB, not in the save. Writing them
		// into a save would produce a character the game cannot reconcile, so no
		// action offers to buy them. Refilling perk *points* is a different thing
		// entirely and is kept, so the check is for the verb rather than the noun.
		expect(
			cyberpunk2077.actions.some((action) =>
				/unlock|all perks|every perk/i.test(action.label),
			),
		).toBe(false);
	});
});

describe("the page's own contract", () => {
	test("identifies itself by the route slug", () => {
		expect(cyberpunk2077.id).toBe("cyberpunk-2077-save-editor");
		expect(cyberpunk2077.extensions).toEqual(["dat"]);
		expect(cyberpunk2077.notes.length).toBeGreaterThanOrEqual(3);
		expect(cyberpunk2077.defaultPath).toContain("Cyberpunk 2077");
	});

	test("speaks British English in every string a reader sees", () => {
		// §9 of the house rules: this is checked rather than trusted, because a
		// single American spelling in a note is exactly the sort of thing that
		// slips through review.
		const prose = [
			cyberpunk2077.game,
			cyberpunk2077.formatLabel,
			cyberpunk2077.defaultPath,
			...cyberpunk2077.notes.flatMap((note) => [note.title, note.body]),
			...cyberpunk2077.actions.flatMap((action) => [
				action.label,
				action.description,
			]),
		];
		for (const text of prose) {
			for (const forbidden of [
				"color",
				"behavior",
				"optimize",
				"analyze",
				"center",
				"favorite",
				"artifact",
				"labeled",
				"organize",
				"visualize",
				"utilize",
			]) {
				expect(text.toLowerCase()).not.toContain(forbidden);
			}
		}
	});

	test("names no tool a browser tab cannot run", async () => {
		// The reference implementation's cheat command delegated to a WolvenKit
		// binary and its sync command to GOG Cloud. Neither belongs on this page,
		// so neither is named anywhere the user can read.
		const rows = cyberpunk2077.summarise(await decodeFixture());
		const text = [
			...cyberpunk2077.notes.map((note) => note.body),
			...rows.map((row) => `${row.label} ${row.value}`),
		].join(" ");
		// The notes may *mention* the tools to explain why those features are
		// missing; what must not appear is anything presenting them as available.
		expect(text).not.toMatch(
			/download WolvenKit|sign in to GOG|upload your save/i,
		);
	});
});
