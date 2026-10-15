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
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const systems = readSystemsContainer(node.data);
		const godMode = systems.find("godModeSystem");
		if (godMode === undefined) throw new Error("No god-mode object.");
		expect([...(godMode.field("currLevel")?.data ?? [])]).toEqual([1, 2, 3, 4]);
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
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const systems = readSystemsContainer(node.data);
		const development = systems.find("PlayerDevelopmentData");
		if (development === undefined) throw new Error("No development object.");
		const attributes = development.field("attributes");
		if (attributes === undefined) throw new Error("No attributes field.");
		expect(readSparseArray(attributes.data, systems.pool)).toHaveLength(5);
		const unknownLastField = new Uint8Array([
			1, 0, 0, 0, 1, 0, 0, 0, 99, 0, 10, 0, 0, 0,
		]);
		expect(readSparseArray(unknownLastField, systems.pool)).toEqual([]);
	});

	test("rejects a struct array claiming more elements than its bytes can hold", async () => {
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const systems = readSystemsContainer(node.data);
		const absurd = new Uint8Array([0xff, 0xff, 0xff, 0x7f, 0, 0]);
		expect(() => readSparseArray(absurd, systems.pool)).toThrow(/cannot hold/);
	});
});

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
		expect(decoded.root.children.map((node) => node.name)).toEqual([
			"inventory",
			"PSData",
		]);
		expect(() => readSystemsContainer(new Uint8Array(0))).toThrow();
	});

	test("identifies an element positionally when the save omits its type", async () => {
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

describe("document", () => {
	test("names the fields the game writes", async () => {
		const decoded = await decodeContainer(buildFullSave());
		const node = findNode(decoded.root, "ScriptableSystemsContainer");
		if (node === undefined) throw new Error("The fixture has no systems node.");
		const development = readDevelopment(readSystemsContainer(node.data));
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
