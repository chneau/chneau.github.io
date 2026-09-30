import { describe, expect, test } from "bun:test";
import { decodeContainer, findNode } from "../lib/container";
import { readDevelopment } from "../lib/development";
import { readSparseArray, readSystemsContainer } from "../lib/systems";
import {
	buildFullSave,
	buildSaveWithoutDevelopment,
	POOL,
	STARTING_ATTRIBUTES,
	STARTING_POINTS,
	STARTING_SKILLS,
} from "./character-save";
import {
	buildObject,
	buildSave,
	buildStructArray,
	buildSystemsBlob,
} from "./synthetic";

/**
 * The string pool and the object list.
 *
 * **All synthetic.** No real `sav.dat` exists to read (see the note at the top
 * of `character-save.ts`), so these confirm the projection is self-consistent
 * with a builder written independently from the format description — not that a
 * save the game wrote has the shape assumed here.
 */
describe("systems container", () => {
	test("reads the string pool, dropping each entry's null terminator", async () => {
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const systems = readSystemsContainer(node.data);
		expect(systems.pool.at(POOL.indexOf("devPoints"))).toBe("devPoints");
		expect(systems.pool.at(POOL.indexOf("unlockedPerks"))).toBe(
			"unlockedPerks",
		);
		expect(systems.pool.names).toHaveLength(POOL.length);
		// A NUL left on the end of a name is the classic pool-reading bug: every
		// field lookup would silently miss.
		expect(systems.pool.names.every((name) => !name.endsWith("\0"))).toBe(true);
	});

	test("resolves an out-of-range pool index to nothing rather than throwing", async () => {
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const systems = readSystemsContainer(node.data);
		expect(systems.pool.at(-1)).toBeUndefined();
		expect(systems.pool.at(9999)).toBeUndefined();
	});

	test("reads each object with its class name and fields", async () => {
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const systems = readSystemsContainer(node.data);
		expect(systems.objects.map((object) => object.ctypename)).toEqual([
			"PlayerDevelopmentData",
			"godModeSystem",
		]);
		const development = systems.find("PlayerDevelopmentData");
		if (development === undefined) throw new Error("No development object.");
		expect(development.fields.map((field) => field.name)).toEqual([
			"lifePath",
			"devPoints",
			"attributes",
			"proficiencies",
			"attributesData",
			"perkAreas",
			"traits",
		]);
		expect(development.field("devPoints")?.type).toBe("CName");
	});

	test("reads a field's bytes as the slice its descriptor implies", async () => {
		// A field runs from its own offset to the next descriptor's, or to the end
		// of the object for the last one. Slicing it any other way reads a
		// neighbouring field's bytes — which here would be the object's own
		// descriptor table, and would look like plausible data.
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const systems = readSystemsContainer(node.data);
		const godMode = systems.find("godModeSystem");
		if (godMode === undefined) throw new Error("No god-mode object.");
		expect([...(godMode.field("currLevel")?.data ?? [])]).toEqual([1, 2, 3, 4]);
		// The development object has seven fields, so each of the first six is
		// bounded by the next one's offset rather than by the object's end.
		const development = systems.find("PlayerDevelopmentData");
		if (development === undefined) throw new Error("No development object.");
		const lifePath = development.field("lifePath");
		const devPoints = development.field("devPoints");
		if (lifePath === undefined || devPoints === undefined) {
			throw new Error("The fixture lost a field.");
		}
		expect(lifePath.data.length).toBeLessThan(devPoints.data.length);
	});

	test("stops walking a sparse array at a field type it does not model", async () => {
		// An element's length is only knowable from the size of its last field, so
		// an unknown type means there is no way to find the next element. Guessing
		// would shift every element after it and report invented levels.
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const systems = readSystemsContainer(node.data);
		const development = systems.find("PlayerDevelopmentData");
		if (development === undefined) throw new Error("No development object.");
		const attributes = development.field("attributes");
		if (attributes === undefined) throw new Error("No attributes field.");
		// `attributes` as the fixture writes it ends on an `Int32`, so every
		// element is read.
		expect(readSparseArray(attributes.data, systems.pool)).toHaveLength(5);
		// A blob whose element's last field has a type this editor does not model
		// reads as empty, because there is no way to find the following element.
		const unknownLastField = new Uint8Array([
			1,
			0,
			0,
			0, // one element
			1,
			0, // one field
			0,
			0, // its name, pool index 0
			99,
			0, // a type name that is not in the pool at all
			10,
			0,
			0,
			0, // its offset within the element
		]);
		expect(readSparseArray(unknownLastField, systems.pool)).toEqual([]);
	});

	test("rejects a struct array claiming more elements than its bytes can hold", async () => {
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const systems = readSystemsContainer(node.data);
		// A count of 0x7fffffff in eight bytes cannot describe a real array, and
		// iterating it would be a very long loop.
		const absurd = new Uint8Array([0xff, 0xff, 0xff, 0x7f, 0, 0]);
		expect(() => readSparseArray(absurd, systems.pool)).toThrow(/cannot hold/);
	});
});

/**
 * `PlayerDevelopmentData`, projected to names.
 *
 * Every name asserted here is one the game writes: the field names are the
 * object's own, and the element names come from the enum orders transcribed from
 * the game's `CEnums.json`. See `lib/development.ts` for why those orders are
 * load-bearing when a save omits the redundant `type` field.
 */
describe("player development data", () => {
	test("reads attributes, skills, points and the life path", async () => {
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const development = readDevelopment(readSystemsContainer(node.data));

		expect(development.lifePath).toBe("Streetkid");
		for (const [name, value] of Object.entries(STARTING_ATTRIBUTES)) {
			expect(development.attributes.get(name)).toBe(value);
		}
		for (const [name, counts] of Object.entries(STARTING_POINTS)) {
			expect(development.developmentPoints.get(name)).toEqual(counts);
		}
		for (const [name, level, exp] of STARTING_SKILLS) {
			expect(development.skills.get(name)).toEqual({ level, exp });
		}
	});

	test("reads the 2.0 perk trees and the perks bought in them", async () => {
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const development = readDevelopment(readSystemsContainer(node.data));
		expect(development.perkTrees.map((tree) => tree.name)).toEqual([
			"Body",
			"Reflexes",
		]);
		// `AttributeData` is stripped, because that suffix names the C++ type
		// rather than the tree the player sees.
		expect(development.perkTrees[1]?.perks).toEqual([
			{ perk: "Reflexes_Central_Perk_1_1", level: 1 },
			{ perk: "Reflexes_Central_Perk_1_2", level: 1 },
		]);
	});

	test("reads a trait with its unlock flag and level", async () => {
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const development = readDevelopment(readSystemsContainer(node.data));
		expect(development.traits).toEqual([
			{ name: "Streetkid", unlocked: true, level: 1 },
		]);
	});

	test("reports nothing when the save has no development object", async () => {
		const decoded = await decodeContainer(buildSaveWithoutDevelopment());
		// A save with no systems node still decodes: the container is what the
		// editor must not lose, and a missing subsystem is a gap in the projection
		// rather than a broken file.
		expect(decoded.root.children.map((node) => node.name)).toEqual([
			"inventory",
			"PSData",
		]);
		// An empty blob is not a systems container at all, and is reported as such.
		expect(() => readSystemsContainer(new Uint8Array(0))).toThrow();
	});

	test("identifies an element positionally when the save omits its type", async () => {
		// A save that leaves out the redundant `type` field is readable only because
		// the array is stored in its enum's order. This asserts the two orderings
		// that decide whether a cheat does the right thing: the development points
		// and the proficiencies.
		//
		// Built by hand because the fixture's own arrays name every element — this
		// is the one case the fixture cannot produce.
		const pool = [...POOL];
		const withoutTypes = buildSave({
			nodes: [
				{
					name: "ScriptableSystemsContainer",
					data: [
						...buildSystemsBlob(pool, [
							{
								ctypename: "PlayerDevelopmentData",
								body: [
									...buildObject(
										[
											{
												name: "devPoints",
												type: "CName",
												data: [
													...buildStructArray(
														[
															{
																fields: [
																	{
																		name: "unspent",
																		type: "Int32",
																		value: 3,
																	},
																],
															},
															{
																fields: [
																	{
																		name: "unspent",
																		type: "Int32",
																		value: 1,
																	},
																],
															},
															{
																fields: [
																	{
																		name: "unspent",
																		type: "Int32",
																		value: 0,
																	},
																],
															},
															{
																fields: [
																	{
																		name: "unspent",
																		type: "Int32",
																		value: 0,
																	},
																],
															},
														],
														pool,
													),
												],
											},
											{
												name: "proficiencies",
												type: "CName",
												data: [
													...buildStructArray(
														// Two elements with no `type` field at all: index 0
														// must read as `Assault` and index 1 as
														// `Athletics`.
														[
															{
																fields: [
																	{
																		name: "currentLevel",
																		type: "Int32",
																		value: 4,
																	},
																	{
																		name: "currentExp",
																		type: "Int32",
																		value: 10,
																	},
																],
															},
															{
																fields: [
																	{
																		name: "currentLevel",
																		type: "Int32",
																		value: 3,
																	},
																	{
																		name: "currentExp",
																		type: "Int32",
																		value: 20,
																	},
																],
															},
														],
														pool,
													),
												],
											},
										],
										pool,
									),
								],
							},
						]),
					],
				},
			],
		});
		const decoded = await decodeContainer(withoutTypes);
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const development = readDevelopment(readSystemsContainer(node.data));
		expect([...development.developmentPoints.keys()]).toEqual([
			"Attribute",
			"Espionage",
			"Primary",
			"Secondary",
		]);
		expect([...development.skills.keys()]).toEqual(["Assault", "Athletics"]);
	});

	test("does not report a level for a field it could not read", async () => {
		// A blob cut short mid-array must be refused rather than producing confident
		// zeros, which would read as a level-1 character.
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const systems = readSystemsContainer(node.data);
		const development = systems.find("PlayerDevelopmentData");
		if (development === undefined) throw new Error("No development object.");
		const proficiencies = development.field("proficiencies");
		if (proficiencies === undefined) throw new Error("No proficiencies field.");
		const truncated = new Uint8Array(proficiencies.data).subarray(0, 6);
		expect(() => readSparseArray(truncated, systems.pool)).toThrow(
			/cannot hold/,
		);
	});
});

/** The document shape, exercised through the codec's own contract. */
describe("document", () => {
	test("names the fields the game writes", async () => {
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const development = readDevelopment(readSystemsContainer(node.data));
		// A projection is only useful if the values are addressable by the names
		// the quick actions use, so they are asserted as a set rather than only
		// individually above.
		const keys: readonly string[] = [
			...development.attributes.keys(),
			...development.skills.keys(),
			...development.developmentPoints.keys(),
		];
		expect(keys).toContain("Strength");
		expect(keys).toContain("StreetCred");
		expect(keys).toContain("Level");
		expect(keys).toContain("Attribute");
	});
});

/** Re-exported so the codec test can build the same fixture. */
