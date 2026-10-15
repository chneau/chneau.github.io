import { describe, expect, test } from "bun:test";
import type { Bytes } from "../../shared";
import { decodeContainer, findNode } from "../lib/container";
import {
	applyPatches,
	type Development,
	planPatches,
	readDevelopment,
} from "../lib/development";
import { readSystemsContainer } from "../lib/systems";
import { buildFullSave, POOL, STARTING_SKILLS } from "./character-save";
import {
	buildObject,
	buildSave,
	buildStructArray,
	buildSystemsBlob,
} from "./synthetic";

type Opened = {
	readonly bytes: Bytes;
	readonly systems: ReturnType<typeof readSystemsContainer>;
};

const open = async (save: Bytes): Promise<Opened> => {
	const decoded = await decodeContainer(save);
	const node = findNode(decoded.root, "ScriptableSystemsContainer");
	if (node === undefined) throw new Error("The fixture has no systems node.");
	return { bytes: node.data, systems: readSystemsContainer(node.data) };
};

const blobsOf = (opened: Opened) => {
	const object = opened.systems.find("PlayerDevelopmentData");
	if (object === undefined) throw new Error("No development object.");
	const devPoints = object.field("devPoints");
	const attributes = object.field("attributes");
	const proficiencies = object.field("proficiencies");
	if (
		devPoints === undefined ||
		attributes === undefined ||
		proficiencies === undefined
	) {
		throw new Error("The fixture lost a field.");
	}
	return {
		devPoints: devPoints.data,
		attributes: attributes.data,
		proficiencies: proficiencies.data,
	};
};

const patchesFor = (
	patches: readonly {
		readonly blob: Bytes;
		readonly offset: number;
		readonly type: string;
		readonly value: number;
	}[],
	blob: Bytes,
): readonly {
	readonly blob: Bytes;
	readonly offset: number;
	readonly type: string;
	readonly value: number;
}[] => patches.filter((patch) => patch.blob === blob);

const desiredFor = (
	base: Development,
	changes: {
		readonly points?: Readonly<Record<string, number>>;
		readonly attributes?: Readonly<Record<string, number>>;
		readonly skills?: Readonly<Record<string, readonly [number, number]>>;
	},
): Development => {
	const points = new Map(base.developmentPoints);
	for (const [name, unspent] of Object.entries(changes.points ?? {})) {
		points.set(name, { unspent, spent: unspent * 10 });
	}
	const attributes = new Map(base.attributes);
	for (const [name, value] of Object.entries(changes.attributes ?? {})) {
		attributes.set(name, value);
	}
	const skills = new Map(base.skills);
	for (const [name, [level, exp]] of Object.entries(changes.skills ?? {})) {
		skills.set(name, { level, exp });
	}
	return { ...base, developmentPoints: points, attributes, skills };
};

const WANTS = {
	points: {
		Attribute: 20,
		Primary: 11,
		Secondary: 22,
		Espionage: 33,
	},
	attributes: {
		Strength: 15,
		Reflexes: 14,
		TechnicalAbility: 13,
		Intelligence: 12,
		Cool: 11,
	},
	skills: { Assault: [20, 1001], StreetCred: [30, 2002], Level: [40, 3003] },
} as const;

describe("planPatches", () => {
	test("plans one patch per scalar the document actually holds", async () => {
		const { systems } = await open(buildFullSave());
		const patches = planPatches(
			systems,
			desiredFor(readDevelopment(systems), WANTS),
		);
		expect(patches).toHaveLength(4 * 2 + 5 + 7 * 2);
		for (const patch of patches) expect(patch.type).toBe("Int32");
	});

	test("addresses a patch inside exactly one of the document's blobs", async () => {
		const opened = await open(buildFullSave());
		const { devPoints, attributes, proficiencies } = blobsOf(opened);
		const blobs = [devPoints, attributes, proficiencies];
		const starts = blobs.map((blob) => blob.byteOffset);

		const patches = planPatches(
			opened.systems,
			desiredFor(readDevelopment(opened.systems), {
				points: { Attribute: 9 },
				attributes: { Cool: 19 },
				skills: { Athletics: [9, 90] },
			}),
		);
		expect(patchesFor(patches, devPoints)).toHaveLength(4 * 2);
		expect(patchesFor(patches, attributes)).toHaveLength(5);
		expect(patchesFor(patches, proficiencies)).toHaveLength(14);
		for (const patch of patches) {
			const owner = starts.indexOf(patch.blob.byteOffset);
			expect(owner).toBeGreaterThanOrEqual(0);
			const blob = blobs[owner];
			if (blob === undefined) throw new Error("Unreachable.");
			expect(patch.blob.length).toBe(blob.length);
			expect(patch.offset).toBeGreaterThanOrEqual(0);
			expect(patch.offset + 4).toBeLessThanOrEqual(blob.length);
		}
		expect(new Set(blobs).size).toBe(3);
	});

	test("plans no perk patch for a document that has no perk trees", async () => {
		const devPoints = buildStructArray(
			[
				{
					fields: [
						{
							name: "type",
							type: "gamedataDevelopmentPointType",
							value: "Attribute",
						},
						{ name: "unspent", type: "Int32", value: 3 },
						{ name: "spent", type: "Int32", value: 12 },
					],
				},
			],
			POOL,
		);
		const save = buildSave({
			nodes: [
				{
					name: "ScriptableSystemsContainer",
					data: [
						...buildSystemsBlob(POOL, [
							{
								ctypename: "PlayerDevelopmentData",
								body: [
									...buildObject(
										[
											{
												name: "devPoints",
												type: "CName",
												data: [...devPoints],
											},
										],
										POOL,
									),
								],
							},
						]),
					],
				},
			],
		});

		const { systems } = await open(save);
		const base = readDevelopment(systems);
		expect(base.perkTrees).toHaveLength(0);
		expect(base.attributes.size).toBe(0);
		expect(base.skills.size).toBe(0);
		expect(base.developmentPoints.get("Attribute")).toEqual({
			unspent: 3,
			spent: 12,
		});

		const patches = planPatches(systems, {
			...base,
			developmentPoints: new Map([["Attribute", { unspent: 7, spent: 77 }]]),
			attributes: new Map([["Strength", 20]]),
			skills: new Map([["Assault", { level: 20, exp: 5 }]]),
			perkTrees: [
				{
					name: "Body",
					perks: [{ perk: "Body_Central_Milestone_1", level: 1 }],
				},
			],
		});
		expect(patches).toHaveLength(2);
		expect(patches.map((patch) => patch.value).sort((a, b) => a - b)).toEqual([
			7, 77,
		]);
		expect(patches.every((patch) => patch.type === "Int32")).toBe(true);
	});

	test("plans nothing for a name the document does not mention", async () => {
		const opened = await open(buildFullSave());
		const { proficiencies } = blobsOf(opened);
		const base = readDevelopment(opened.systems);
		const patches = planPatches(opened.systems, {
			...base,
			skills: new Map([
				...base.skills,
				["Kenjutsu", { level: 5, exp: 50 }],
				["NotAProficiency", { level: 5, exp: 50 }],
			]),
		});
		expect(patchesFor(patches, proficiencies)).toHaveLength(7 * 2);
	});

	test("plans nothing when there is no development object", async () => {
		const save = buildSave({
			nodes: [
				{
					name: "ScriptableSystemsContainer",
					data: [
						...buildSystemsBlob(POOL, [
							{
								ctypename: "godModeSystem",
								body: [
									...buildObject(
										[{ name: "currLevel", type: "Int32", data: [1, 2, 3, 4] }],
										POOL,
									),
								],
							},
						]),
					],
				},
			],
		});
		const { systems } = await open(save);
		expect(systems.find("PlayerDevelopmentData")).toBeUndefined();
		expect(planPatches(systems, readDevelopment(systems))).toHaveLength(0);
	});
});

describe("applyPatches", () => {
	test("writes each planned value and leaves every neighbouring byte identical", async () => {
		const opened = await open(buildFullSave());
		const blobs = blobsOf(opened);
		const before = new Uint8Array(opened.bytes);

		const desired = desiredFor(readDevelopment(opened.systems), WANTS);
		const patches = planPatches(opened.systems, desired);
		expect(applyPatches(patches)).toBe(patches.length);

		const after = opened.bytes;
		const base = before.byteOffset;
		const expected = new Set<number>();
		for (const patch of patches) {
			const owner = [
				blobs.devPoints,
				blobs.attributes,
				blobs.proficiencies,
			].indexOf(patch.blob);
			if (owner < 0) throw new Error("A patch addressed an unknown blob.");
			const blob = [blobs.devPoints, blobs.attributes, blobs.proficiencies][
				owner
			];
			if (blob === undefined) throw new Error("Unreachable.");
			const start = blob.byteOffset - base + patch.offset;
			const written = new Uint8Array(4);
			new DataView(written.buffer).setInt32(0, patch.value, true);
			for (let byte = 0; byte < 4; byte += 1) {
				if (before[start + byte] !== written[byte]) {
					expected.add(start + byte);
				}
			}
		}
		expect(expected.size).toBeGreaterThan(0);

		const differing = new Set<number>();
		for (let at = 0; at < before.length; at += 1) {
			if (before[at] !== after[at]) differing.add(at);
		}
		expect([...differing].sort((a, b) => a - b)).toEqual(
			[...expected].sort((a, b) => a - b),
		);
		expect(differing.size).toBeLessThanOrEqual(patches.length * 4);
	});

	test("leaves the bytes a patch skipped over alone", async () => {
		const opened = await open(buildFullSave());
		const { devPoints } = blobsOf(opened);
		const patches = patchesFor(
			planPatches(
				opened.systems,
				desiredFor(readDevelopment(opened.systems), {
					points: { Attribute: 21 },
				}),
			),
			devPoints,
		);
		expect(patches).toHaveLength(4 * 2);
		applyPatches(patches);
		const view = new DataView(
			devPoints.buffer,
			devPoints.byteOffset,
			devPoints.byteLength,
		);
		for (const patch of patches) {
			expect(view.getInt32(patch.offset, true)).toBe(patch.value);
		}
		expect(view.getUint32(0, true)).toBe(4);
		expect(view.getUint16(4, true)).toBe(3);
		expect(view.getUint16(30, true)).toBe(POOL.indexOf("Attribute"));
		expect(patches[0]?.offset).toBe(32);
		expect(patches[1]?.offset).toBe(36);
		expect(view.getInt32(patches[0]?.offset ?? 0, true)).toBe(21);
		expect(view.getInt32(patches[1]?.offset ?? 0, true)).toBe(210);
		expect(view.getInt32(patches[2]?.offset ?? 0, true)).toBe(1);
		expect(view.getInt32(patches[3]?.offset ?? 0, true)).toBe(8);
	});

	test("the reader sees the new numbers through its own projection", async () => {
		const opened = await open(buildFullSave());
		const base = readDevelopment(opened.systems);
		applyPatches(planPatches(opened.systems, desiredFor(base, WANTS)));
		const reread = readDevelopment(opened.systems);
		expect(reread.developmentPoints.get("Attribute")).toEqual({
			unspent: 20,
			spent: 200,
		});
		expect(reread.attributes.get("Strength")).toBe(15);
		expect(reread.skills.get("Assault")).toEqual({ level: 20, exp: 1001 });
		expect(reread.lifePath).toBe(base.lifePath);
		expect(reread.perkTrees).toEqual(base.perkTrees);
		expect(reread.traits).toEqual(base.traits);
		for (const [name, level, exp] of STARTING_SKILLS) {
			if (name === "Assault" || name === "StreetCred" || name === "Level") {
				continue;
			}
			expect(reread.skills.get(name)).toEqual({ level, exp });
		}
	});

	test("counts zero for a patch whose type it cannot write", async () => {
		const { devPoints } = blobsOf(await open(buildFullSave()));
		const before = [...devPoints];
		expect(
			applyPatches([
				{ blob: devPoints, offset: 8, type: "CName", value: 1 },
				{ blob: devPoints, offset: 8, type: "Float32", value: 1 },
			]),
		).toBe(0);
		expect([...devPoints]).toEqual(before);
	});

	test("counts only the patches that landed in a mixed batch", async () => {
		const { devPoints } = blobsOf(await open(buildFullSave()));
		const written = applyPatches([
			{ blob: devPoints, offset: 8, type: "CName", value: 1 },
			{ blob: devPoints, offset: 8, type: "Int32", value: 5 },
			{ blob: devPoints, offset: 12, type: "Int32", value: 6 },
		]);
		expect(written).toBe(2);
		const view = new DataView(
			devPoints.buffer,
			devPoints.byteOffset,
			devPoints.byteLength,
		);
		expect(view.getInt32(8, true)).toBe(5);
		expect(view.getInt32(12, true)).toBe(6);
	});

	test("counts zero for an empty batch", async () => {
		const { devPoints } = blobsOf(await open(buildFullSave()));
		const before = [...devPoints];
		expect(applyPatches([])).toBe(0);
		expect([...devPoints]).toEqual(before);
	});

	test("skips an offset with no room rather than aborting the batch", async () => {
		const { devPoints } = blobsOf(await open(buildFullSave()));
		const before = [...devPoints];
		const written = applyPatches([
			{ blob: devPoints, offset: 8, type: "Int32", value: 5 },
			{
				blob: devPoints,
				offset: devPoints.length - 2,
				type: "Int32",
				value: 7,
			},
		]);
		expect(written).toBe(1);
		const view = new DataView(
			devPoints.buffer,
			devPoints.byteOffset,
			devPoints.byteLength,
		);
		expect(view.getInt32(8, true)).toBe(5);
		expect(devPoints.slice(-2)).toEqual(new Uint8Array(before.slice(-2)));
	});

	test("skips an offset before the start of the blob", async () => {
		const { devPoints } = blobsOf(await open(buildFullSave()));
		const before = [...devPoints];
		expect(
			applyPatches([{ blob: devPoints, offset: -4, type: "Int32", value: 5 }]),
		).toBe(0);
		expect([...devPoints]).toEqual(before);
	});
});
