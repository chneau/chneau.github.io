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

const decodeFixture = async (): Promise<JsonValue> =>
	cyberpunk2077.decode(buildFullSave());

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
			suk: "CyberpunkSaveGame",
			uk0: 0,
			uk1: 0,
			tableEntries: 256,
		});
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
		const original = buildFullSave();
		const doc = await cyberpunk2077.decode(original);
		const verdict = await verifyRoundTrip(cyberpunk2077, original, doc, false);
		expect(verdict.kind).toBe("identical");
	});

	test("rebuilds a save with edits applied and reads back what was asked for", async () => {
		const original = buildFullSave();
		const doc = await decodeFixture();
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
		expect(verdict.kind).toBe("semantic");

		const reread = characterOf(
			await cyberpunk2077.decode(await cyberpunk2077.encode(edited)),
		);
		expect((reread.attributes as Record<string, number>).Strength).toBe(
			MAX_ATTRIBUTE,
		);
	});

	test("leaves subsystems it cannot read untouched", async () => {
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
		expect(byPath.has("character.attributes.Espionage")).toBe(false);
		expect(byPath.has("character.attributes.Gunslinger")).toBe(false);
		expect(plan.every((edit) => edit.path[0] === "character")).toBe(true);
	});

	test("drops a retired attribute to zero when the save still has one", async () => {
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
		expect(byPath.get("character.developmentPoints.Secondary.unspent")).toBe(
			12,
		);
		expect(byPath.has("character.developmentPoints.Espionage.unspent")).toBe(
			false,
		);
	});

	test("plans no edit for a value the save already holds", async () => {
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
		expect(byPath.get("character.skills.Assault")).toEqual({
			level: 20,
			exp: 120,
		});
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
		const original = buildFullSave();
		let current: JsonValue = await decodeFixture();

		for (const action of cyberpunk2077.actions) {
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
		expect(skills.Level?.level).toBe(7);
	});

	test("says nothing about money, which this codec cannot write", async () => {
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
		expect(
			cyberpunk2077.actions.some((action) =>
				/unlock|all perks|every perk/i.test(action.label),
			),
		).toBe(false);
	});
});

describe("the page's own contract", () => {
	test("states the extension, the notes and where the file lives", () => {
		expect(cyberpunk2077.extensions).toEqual(["dat"]);
		expect(cyberpunk2077.notes.length).toBeGreaterThanOrEqual(3);
		expect(cyberpunk2077.defaultPath).toContain("Cyberpunk 2077");
	});

	test("speaks British English in every string a reader sees", () => {
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
		const rows = cyberpunk2077.summarise(await decodeFixture());
		const text = [
			...cyberpunk2077.notes.map((note) => note.body),
			...rows.map((row) => `${row.label} ${row.value}`),
		].join(" ");
		expect(text).not.toMatch(
			/download WolvenKit|sign in to GOG|upload your save/i,
		);
	});
});
