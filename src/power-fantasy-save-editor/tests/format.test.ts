/**
 * The codec, against the real save.
 *
 * The fixture is a committed 57,280-byte `PowerFantasySave.es3` taken from a
 * played game, and it is the only authority for every field name claimed in
 * `lib/format.ts`. A test written against a hand-made document would pass
 * against a codec that had the crypto right and the vocabulary wrong, which is
 * precisely the defect that turns a rebuilt save into a file the game refuses.
 *
 * The second fixture is what the original command-line tool produced from that
 * same save: the same JSON, a fresh IV, different bytes. It is here to pin the
 * reason the codec reuses the header rather than drawing a new one.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	applyEdits,
	type Bytes,
	bytesEqual,
	getAtPath,
	isJsonObject,
	type JsonValue,
} from "../../shared";
import {
	decryptSave,
	encryptSave,
	headerIv,
	PASSWORD,
	powerFantasy,
} from "../lib/format";

const root = join(import.meta.dir, "..");

/** One committed save, as bytes. */
const fixture = (name: string): Bytes =>
	new Uint8Array(readFileSync(join(root, "saves", name)));

const SAVE = fixture("PowerFantasySave.es3");
const RE_ENCRYPTED = fixture("PowerFantasySave-reencrypted.es3");

/** The document every suite works against, decoded through the real codec. */
const decodeSave = (): Promise<JsonValue> => powerFantasy.decode(SAVE);

/** A quick action by id, or the test fails loudly rather than silently. */
const actionOf = (id: string) => {
	const action = powerFantasy.actions.find((candidate) => candidate.id === id);
	if (!action) throw new Error(`no quick action called ${id}`);
	return action;
};

/** The paths an action would write, as strings so they can be compared. */
const pathsOf = (
	edits: readonly { readonly path: readonly (string | number)[] }[],
): readonly string[] => edits.map((edit) => JSON.stringify(edit.path));

/** The number inside a Unity `{__type, value}` record, if it holds one. */
const numberIn = (value: JsonValue | undefined): number | undefined =>
	value !== undefined && isJsonObject(value) && typeof value.value === "number"
		? value.value
		: undefined;

/**
 * The same save with every counter zeroed and every list emptied.
 *
 * What a fresh playthrough looks like, built from the fixture rather than
 * written by hand: same keys, same types, nothing earned. It is what lets the
 * suite check that a quick action has something to do on a save that has not
 * already been cheated at, which the fixture itself cannot show.
 */
const zeroedCounters = (doc: JsonValue): JsonValue => {
	if (!isJsonObject(doc)) throw new Error("expected a decoded save");
	return Object.fromEntries(
		Object.entries(doc).map(([key, record]): [string, JsonValue] => {
			if (!isJsonObject(record) || typeof record.__type !== "string") {
				return [key, record];
			}
			return [
				key,
				record.__type === "int"
					? { __type: "int", value: 0 }
					: { ...record, value: [] },
			];
		}),
	);
};

/**
 * Unity's type name for the inventory stack list.
 *
 * Written out rather than read from a save, so this test pins that the codec
 * copies the string off the record rather than shipping its own copy of a long
 * generic name that a patch could change under it.
 */
const STACK_TYPE =
	"System.Collections.Generic.List`1[[InventoryManager+StackEntry, Assembly-CSharp, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null]],mscorlib";

describe("Power Fantasy container", () => {
	test("decodes the real save", async () => {
		expect(isJsonObject(await decodeSave())).toBe(true);
	});

	test("has the top-level keys the game writes", async () => {
		// Named one by one rather than as a count: a summary or a cheat built
		// on keys the save does not have is the failure this suite exists for,
		// and a count would not notice it happening.
		const doc = await decodeSave();
		for (const key of [
			"s_bloodRuby",
			"s_totalBanish",
			"s_level_Kaito",
			"s_runs_Daria",
			"totalWins_",
			"inv/index",
			"inv/item_infusion",
			"a_level_2",
			"a_10br2",
			"blood_egg",
			"br_Kaito_ButtonDamage",
			"Kaito_alchemy_infusions",
			"currentCampCompanions",
			"prof/index",
			"p_picked_Cheat Death",
		]) {
			expect({ key, present: getAtPath(doc, [key]) !== undefined }).toEqual({
				key,
				present: true,
			});
		}
	});

	test("every value is one of Unity's {__type, value} records", async () => {
		// The one structural claim the summary and every cheat rests on: there
		// is no nesting below the top level, so a path is always one segment.
		const doc = await decodeSave();
		if (!isJsonObject(doc)) throw new Error("the fixture did not decode");
		const odd = Object.entries(doc).filter(
			([, record]) =>
				!isJsonObject(record) ||
				typeof record.__type !== "string" ||
				record.value === undefined,
		);
		expect(Object.keys(odd)).toEqual([]);
	});

	test("the header is the IV, and it is a whole number of blocks", () => {
		expect(headerIv(SAVE)).toHaveLength(16);
		expect(SAVE.length % 16).toBe(0);
	});

	test("rejects a file too short to hold a header and a block", () => {
		expect(() => headerIv(new Uint8Array(20))).toThrow(/too short/);
	});

	test("a wrong password fails cleanly rather than surfacing a cipher error", async () => {
		// The padding check is what catches a wrong key, and WebCrypto reports
		// it as a bare `OperationError` with no explanation. What the user must
		// not see is that, so it is caught and said in their terms — and the
		// one-in-256 chance of valid padding on garbage lands on the same
		// message, as a parse failure rather than a cipher failure.
		await expect(decryptSave(SAVE, "not-the-password")).rejects.toThrow(
			/did not decrypt to a Power Fantasy save/,
		);
	});

	test("random bytes are refused as a save, with the same explanation", async () => {
		const noise = new Uint8Array(4096);
		crypto.getRandomValues(noise);
		await expect(powerFantasy.decode(noise)).rejects.toThrow(
			/did not decrypt to a Power Fantasy save/,
		);
	});
});

describe("Power Fantasy round trip", () => {
	test("re-encoding an untouched save is byte for byte identical", async () => {
		// The strongest claim the shared round-trip check can make, and the one
		// the page shows the user. It holds only because `encode` reuses the
		// header `decode` read: a fresh IV changes every block of a CBC stream,
		// so the claim would quietly become false.
		const doc = await decodeSave();
		expect(bytesEqual(await powerFantasy.encode(doc), SAVE)).toBe(true);
	});

	test("a rebuilt save decodes back to the same document", async () => {
		const doc = await decodeSave();
		const rebuilt = await powerFantasy.encode(doc);
		expect(JSON.stringify(await powerFantasy.decode(rebuilt))).toBe(
			JSON.stringify(doc),
		);
	});

	test("the same document under a fresh IV is a different file", async () => {
		// Which is what the original tool produced, and what the second fixture
		// is: `saves/PowerFantasySave-reencrypted.es3` decrypts to byte-identical
		// JSON and shares no bytes on disk with the save it came from. Pinned so
		// the note on the page and the codec's header reuse cannot drift apart.
		const doc = await decodeSave();
		expect(bytesEqual(RE_ENCRYPTED, SAVE)).toBe(false);
		expect(JSON.stringify(await decryptSave(RE_ENCRYPTED))).toBe(
			JSON.stringify(doc),
		);
		const fresh = await encryptSave(
			doc,
			crypto.getRandomValues(new Uint8Array(16)),
		);
		expect(bytesEqual(fresh, SAVE)).toBe(false);
		expect(JSON.stringify(await decryptSave(fresh))).toBe(JSON.stringify(doc));
	});

	test("editing a counter survives the whole trip", async () => {
		// A save round-trip, driven rather than reasoned about: change the ruby
		// total, rebuild, read back, and confirm the game would see the new
		// number rather than the old one.
		const doc = await decodeSave();
		const cheated = applyEdits(doc, [
			{
				id: "rubies",
				label: "Blood Rubies",
				path: ["s_bloodRuby"],
				before: getAtPath(doc, ["s_bloodRuby"]) ?? null,
				after: { __type: "int", value: 9999999 },
			},
		]);
		const reread = await powerFantasy.decode(
			await powerFantasy.encode(cheated),
		);
		expect(getAtPath(reread, ["s_bloodRuby"])).toEqual({
			__type: "int",
			value: 9999999,
		});
	});
});

describe("Power Fantasy summary", () => {
	test("reports values read out of the fixture", async () => {
		const doc = await decodeSave();
		const rows = Object.fromEntries(
			powerFantasy.summarise(doc).map((row) => [row.label, row.value]),
		);
		expect(rows).toEqual({
			"Blood Rubies": (9056785).toLocaleString("en-GB"),
			"Heroes with a saved level": "10 of 17",
			"Runs won": "8",
			"Banishes, all time": "32",
			"Inventory stacks": "18",
			"Passives recorded": "459",
			"Achievements recorded": "228",
			"Saved values": "994",
		});
	});

	test("says so rather than inventing a value for a key the save lacks", () => {
		// A fresh game has no ruby total and no stack list. Reporting a zero
		// there would read as a fact about the player's save.
		const rows = Object.fromEntries(
			powerFantasy
				.summarise({ a_level_1: { __type: "int", value: 1 } })
				.map((row) => [row.label, row.value]),
		);
		expect(rows).toMatchObject({
			"Blood Rubies": "not recorded",
			"Inventory stacks": "not recorded",
			"Heroes with a saved level": "0 of 17",
			"Achievements recorded": "1",
			"Saved values": "1",
		});
	});
});

describe("Power Fantasy quick actions", () => {
	test("every planned edit lands on a field the save really records", async () => {
		// The safety property: `setAtPath` refuses a path the document does not
		// have, so an action that planned a missing key would throw inside a
		// render rather than quietly do nothing.
		const doc = await decodeSave();
		for (const action of powerFantasy.actions) {
			for (const edit of action.plan(doc)) {
				expect({
					action: action.id,
					path: edit.path,
					present: getAtPath(doc, edit.path) !== undefined,
				}).toEqual({ action: action.id, path: edit.path, present: true });
			}
		}
	});

	test("planning changes nothing, and applying is what edits the document", async () => {
		const doc = await decodeSave();
		const before = JSON.stringify(doc);
		for (const action of powerFantasy.actions) action.plan(doc);
		expect(JSON.stringify(doc)).toBe(before);
	});

	test("no action stages a change the file already holds", async () => {
		const doc = await decodeSave();
		for (const action of powerFantasy.actions) {
			for (const edit of action.plan(doc)) {
				expect(edit.before).not.toEqual(edit.after);
			}
		}
	});

	test("the cheat actions write the keys the game names for them", async () => {
		const doc = await decodeSave();
		expect(pathsOf(actionOf("cheat").plan(doc))).toEqual(['["s_bloodRuby"]']);
		expect(
			actionOf("cheat")
				.plan(doc)
				.map((edit) => edit.after),
		).toEqual([{ __type: "int", value: 9999999 }]);
		// The eleven stacks this save holds below 999. The seven above it are
		// left exactly as they are: the original tool wrote 999 into every
		// counter it found, which on this save would have quietly taken items
		// away from the player. `inv/index` is absent for the same reason — its
		// amounts all read 999 already, and an edit that writes the value in the
		// file is not staged.
		expect(pathsOf(actionOf("cheat-items").plan(doc))).toEqual([
			'["inv/fish_bloodruby"]',
			'["inv/fish_common"]',
			'["inv/fish_epic"]',
			'["inv/herb_common"]',
			'["inv/herb_epic"]',
			'["inv/herb_legendary"]',
			'["inv/item_cosmetictoken"]',
			'["inv/item_goldenkey"]',
			'["inv/item_infusion"]',
			'["inv/item_muck"]',
			'["inv/shard_profession"]',
		]);
	});

	test("no action ever writes a count below the one the save holds", async () => {
		// The property that makes these cheats safe to press twice, and the one
		// the original tool did not have: three achievements in this save read
		// 193,517 and one reads 100,000, all above the 99,999 unlock value.
		const doc = await decodeSave();
		const lowered: unknown[] = [];
		let checked = 0;
		for (const action of powerFantasy.actions) {
			for (const edit of action.plan(doc)) {
				const before = numberIn(edit.before);
				const after = numberIn(edit.after);
				if (before === undefined || after === undefined) continue;
				checked += 1;
				if (after < before) {
					lowered.push({ action: action.id, path: edit.path, before, after });
				}
			}
		}
		expect(lowered).toEqual([]);
		// A vacuous pass is worse than a failure here: the count says the
		// property was actually exercised rather than skipped over.
		expect(checked).toBeGreaterThan(0);
	});

	test("the stack list is rewritten too, keeping Unity's type name", () => {
		// A stack list that disagrees with the per-item counters is exactly the
		// state the original tool learned to fix by writing both.
		const disagreeing: JsonValue = {
			"inv/index": {
				__type: STACK_TYPE,
				value: [
					{ itemId: "item_infusion", amount: 3 },
					{ itemId: "shard_boss", amount: 1 },
				],
			},
		};
		expect(actionOf("cheat-items").plan(disagreeing)).toEqual([
			{
				id: `["inv/index"]=${JSON.stringify({
					__type: STACK_TYPE,
					value: [
						{ itemId: "item_infusion", amount: 999 },
						{ itemId: "shard_boss", amount: 999 },
					],
				})}`,
				label: "Inventory stack list",
				path: ["inv/index"],
				before: {
					__type: STACK_TYPE,
					value: [
						{ itemId: "item_infusion", amount: 3 },
						{ itemId: "shard_boss", amount: 1 },
					],
				},
				after: {
					__type: STACK_TYPE,
					value: [
						{ itemId: "item_infusion", amount: 999 },
						{ itemId: "shard_boss", amount: 999 },
					],
				},
			},
		]);
	});

	test("passives and infusions are planned per hero, on the game's own keys", async () => {
		const doc = await decodeSave();
		// The fixture already has every passive learned and every infusion
		// maxed, so both plans come back empty and the buttons grey out — the
		// honest answer for this save, and asserted rather than assumed.
		expect(actionOf("cheat-passives").plan(doc)).toEqual([]);
		expect(actionOf("cheat-infusions").plan(doc)).toEqual([]);
		// Which is what makes the next test necessary: an empty plan proves
		// nothing about whether those 459 and 17 paths exist.
		const fresh: JsonValue = Object.fromEntries(
			HEROES.flatMap((hero) => [
				[`br_${hero}_ButtonDamage`, { __type: "int", value: 0 }],
				[
					`${hero}_alchemy_infusions`,
					{
						__type: "List",
						value: [{ infusionId: "infusion_xpgain", count: 1 }],
					},
				],
			]),
		);
		expect(actionOf("cheat-passives").plan(fresh)).toHaveLength(HEROES.length);
		expect(actionOf("cheat-infusions").plan(fresh)).toHaveLength(HEROES.length);
		expect(getAtPath(fresh, ["br_Zikk_ButtonDamage"])).toEqual({
			__type: "int",
			value: 0,
		});
	});

	test("every action is a real, non-empty command on a save that needs it", async () => {
		// The fixture has already been cheated at, which filters several plans
		// to nothing. Zeroing that same save's counters — the game's own
		// vocabulary, none of it invented — is what a fresh playthrough looks
		// like, and on it all nine must plan something. This is what catches an
		// action whose every path turned out not to exist.
		const blanked = zeroedCounters(await decodeSave());
		for (const action of powerFantasy.actions) {
			expect({
				action: action.id,
				planned: action.plan(blanked).length > 0,
			}).toEqual({ action: action.id, planned: true });
		}
	});

	test("unlocking everything is the exact union of the three unlocks", async () => {
		const doc = await decodeSave();
		const all = pathsOf(actionOf("unlock-all").plan(doc));
		const characters = pathsOf(actionOf("unlock-characters").plan(doc));
		const companions = pathsOf(actionOf("unlock-companions").plan(doc));
		const upgrades = pathsOf(actionOf("unlock-upgrades").plan(doc));

		// A partition, not a subset: every achievement and blood rune this save
		// records is claimed exactly once across the three, so applying two of
		// them cannot stage the same field twice.
		expect(all.slice().sort()).toEqual(
			[...characters, ...companions, ...upgrades].sort(),
		);
		// The DLC ids are a subset of the hero ids in the game's own naming,
		// which is why unlocking the DLC is a nine-line action rather than a
		// separate branch of the unlock logic. All nine already read 99,999 in
		// this save, so the plan is empty here and is proved on the blanked one.
		expect(actionOf("unlock-dlc").plan(doc)).toEqual([]);
		const blanked = zeroedCounters(doc);
		expect(pathsOf(actionOf("unlock-dlc").plan(blanked))).toEqual(
			[
				"a_Santa_0",
				"a_Santa_5",
				"a_Kaze_0",
				"a_Kaze_3",
				"a_Kaze_5",
				"a_Nova_0",
				"a_Nova_5",
				"a_Orb_0",
				"a_Orb_5",
			].map((id) => JSON.stringify([id])),
		);
	});

	test("a staged unlock reads back out of a rebuilt save", async () => {
		const doc = await decodeSave();
		const edits = actionOf("unlock-all").plan(doc);
		expect(edits.length).toBeGreaterThan(0);
		const reread = await powerFantasy.decode(
			await powerFantasy.encode(applyEdits(doc, edits)),
		);
		for (const edit of edits) {
			expect({ path: edit.path, after: getAtPath(reread, edit.path) }).toEqual({
				path: edit.path,
				after: edit.after,
			});
		}
	});
});

/** The seventeen playable heroes, as the save names them. */
const HEROES = [
	"Aric",
	"Croak",
	"Daria",
	"Effy",
	"Ember",
	"Gundel",
	"Icicle",
	"Kaito",
	"Kaze",
	"Mad",
	"Misty",
	"Mothman",
	"Nova",
	"Nox",
	"Orb",
	"Santa",
	"Zikk",
] as const;

describe("the codec contract", () => {
	test("is wired the way the workbench expects", () => {
		expect(powerFantasy.id).toBe("power-fantasy-save-editor");
		expect(powerFantasy.game).toBe("Power Fantasy");
		expect(powerFantasy.extensions).toEqual(["es3"]);
		expect(powerFantasy.defaultPath).toContain("Lava Lamb Games");
		expect(powerFantasy.notes.length).toBeGreaterThanOrEqual(3);
		expect(powerFantasy.actions.length).toBe(9);
	});

	test("the password is the game's, and it is not a secret of ours", () => {
		// Naming it is the point of the third note on the page: a password that
		// ships inside the game is the whole of this format's weakness.
		expect(PASSWORD).toBe("godisdad");
	});
});
