import { describe, expect, test } from "bun:test";
import {
	applyEdits,
	type Bytes,
	base64Decode,
	bytesEqual,
	effectiveEdits,
	getAtPath,
	isJsonObject,
	type JsonValue,
	setAtPath,
	verifyRoundTrip,
	zlibInflate,
} from "../../shared";
import { decodeToJson, dysmantle, encodeFromJson } from "../lib/format";
import { projectXml, unprojectXml, XML_DECLARATION } from "../lib/xml";

await import("../../shared/tests/happy-dom");

const PROFILE_XML = `${XML_DECLARATION}
<root>

	<array id="!INFO">
		<node id="time_created" value="1787135754"/>
		<node id="game_version_created" value="1.4.1.12"/>
		<node id="time_active" value="38406"/>
		<node id="uid" value="1010837125"/>
	</array>

	<array id="SAVE_FORMAT">
		<node id="version" value="3"/>
	</array>

	<array id="PLAYER_STATE">
		<node id="experience_level" value="12"/>
		<node id="acknowledged_experience_level" value="12"/>
		<node id="num_skills_to_pick" value="3"/>
		<node id="num_skills_picked" value="1"/>
		<node id="num_times_died" value="2"/>
		<node id="num_enemies_killed" value="7"/>
		<node id="materials" found_SCRAP_METAL="1" found_PLANTS="0" found_STONE="0"/>
		<node id="material_storage" SCRAP_METAL="4" PLANTS="9" STONE="0"/>
		<node id="material_storage_alltime" SCRAP_METAL="11" PLANTS="9" STONE="2"/>
		<node id="buildups" cold="0.00" heat="0.00"/>
		<node id="slot_00" amount="20"/>
		<node id="slot_01" amount="20"/>
	</array>

	<array id="RECIPES">
		<node id="BACKPACK" unlocked="0" new="1" crafted="0" level="0"/>
		<node id="CROWBAR" unlocked="0" new="1" crafted="0" level="0"/>
		<node id="KATANA" unlocked="0" new="1" crafted="0" level="0"/>
		<node id="AMBER_LILY_1" unlocked="0" new="1" crafted="0"/>
		<node id="SKILL_BUILDER_1" unlocked="0" new="1" crafted="0"/>
		<node id="SKILL_FIGHTER_1" unlocked="0" new="1" crafted="0"/>
	</array>

	<array id="ITEMS">
		<node id="items/tools/crowbar.nut" available="0"/>
		<node id="items/tools/katana.nut" available="0"/>
		<node id="items/backpacks/basic-backpack.nut" available="1"/>
	</array>

	<array id="FEATURES">
		<node id="CAMPFIRE_FAST_TRAVEL" available="1"/>
		<node id="MAP" available="0"/>
	</array>

	<array id="TEMPORARY_MODIFIERS_0">
	</array>

	<array id="INVENTORY_0_ITEM_USES">
		<node id="items/tools/crowbar.nut" times_used="0"/>
		<node id="items/tools/katana.nut" times_used="3"/>
		<node id="items/backpacks/basic-backpack.nut" times_used="2"/>
	</array>

	<array id="GLOBAL_KEY_VALUE_STORES">
		<node id="home_portal"/>
	</array>
</root>`;

const containerBytes = (): Bytes => {
	const chunks: Uint8Array[] = [];
	const push = (text: string): void => {
		const bytes = new Uint8Array(text.length);
		for (const [index, character] of [...text].entries()) {
			bytes[index] = character.charCodeAt(0) & 0xff;
		}
		chunks.push(bytes);
	};
	const u32 = (value: number): void => {
		const bytes = new Uint8Array(4);
		new DataView(bytes.buffer).setUint32(0, value, true);
		chunks.push(bytes);
	};
	push("10TONS_CONTAINER\0");
	push("VERSION\0");
	u32(1);
	push("FILE_SIZE\0");
	u32(0);
	for (const [name, content] of SEGMENTS) {
		push("SEGMENT\0");
		u32(name.length + 1 + 4 + content.length);
		push(`${name}\0`);
		u32(content.length);
		push(content);
		push("SEGMENT_END\0");
	}
	push("\0CONTAINER_END\0");
	const out = new Uint8Array(
		chunks.reduce((sum, chunk) => sum + chunk.length, 0),
	);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
};

const SEGMENTS: readonly (readonly [string, string])[] = [
	["xml", PROFILE_XML],
	["bin", "world-state-bytes"],
	["STAGE_PERSISTENCY&stages/island/index.xml&puid1", "binary blob"],
];

const buildSave = async (): Promise<Bytes> => {
	const container = containerBytes();
	const { zlibDeflate } = await import("../../shared");
	const compressed = new Uint8Array(await zlibDeflate(container));
	const out = new Uint8Array(12 + compressed.length);
	for (const [index, character] of [...`10tc`].entries()) {
		out[index] = character.charCodeAt(0);
	}
	const view = new DataView(out.buffer);
	view.setUint32(4, container.length, true);
	view.setUint32(8, compressed.length, true);
	out.set(compressed, 12);
	return out;
};

const buildSaveOf = async (profileXml: string): Promise<Bytes> => {
	const container = new TextEncoder().encode(profileXml);
	const { zlibDeflate } = await import("../../shared");
	const compressed = new Uint8Array(await zlibDeflate(container));
	const out = new Uint8Array(12 + compressed.length);
	out.set(new TextEncoder().encode("10tc"), 0);
	const view = new DataView(out.buffer);
	view.setUint32(4, container.length, true);
	view.setUint32(8, compressed.length, true);
	out.set(compressed, 12);
	return out;
};

const SAVE = await buildSave();
const DOC = await decodeToJson(SAVE);

const asObject = (value: JsonValue): { readonly [key: string]: JsonValue } => {
	if (!isJsonObject(value)) {
		throw new Error("expected a JSON object in the decoded document");
	}
	return value;
};

const profileOf = (doc: JsonValue): { readonly [key: string]: JsonValue } =>
	asObject(asObject(doc).root ?? null);

const arraysOf = (
	doc: JsonValue,
): readonly { readonly [key: string]: JsonValue }[] => {
	const group = profileOf(doc).array;
	if (!Array.isArray(group)) throw new Error("no array group");
	return group.filter(
		(entry): entry is { readonly [key: string]: JsonValue } =>
			typeof entry === "object" && entry !== null && !Array.isArray(entry),
	);
};

const nodesUnder = (doc: JsonValue, arrayId: string): readonly JsonValue[] => {
	const array = arraysOf(doc).find((entry) => entry.id === arrayId);
	if (array === undefined) throw new Error(`no ${arrayId} array`);
	const group = array.node;
	return Array.isArray(group) ? group : [];
};

const nodeNamed = (doc: JsonValue, arrayId: string, id: string): JsonValue => {
	const found = nodesUnder(doc, arrayId).find(
		(entry) => asObject(entry).id === id,
	);
	if (found === undefined) throw new Error(`no ${id} node`);
	return found;
};

const scaffoldOf = (doc: JsonValue): string => {
	const value = asObject(doc).$scaffold;
	if (typeof value !== "string") throw new Error("no scaffold in the document");
	return value;
};

const planFor = (id: string, doc: JsonValue = DOC) => {
	const action = dysmantle.actions.find((entry) => entry.id === id);
	if (action === undefined) throw new Error(`no ${id} action`);
	return action.plan(doc);
};

const indexOfArray = (doc: JsonValue, arrayId: string): number =>
	arraysOf(doc).findIndex((entry) => entry.id === arrayId);

type ReadSegment = {
	readonly name: string;
	readonly totalAt: number;
	readonly lengthAt: number;
	readonly contentStart: number;
	readonly contentEnd: number;
	readonly content: Bytes;
};

const latin1Of = (bytes: Bytes): string => {
	let out = "";
	for (const byte of bytes) out += String.fromCharCode(byte);
	return out;
};

const u32At = (bytes: Bytes, at: number): number =>
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
		at,
		true,
	);

const readSegmentsOf = (container: Bytes): readonly ReadSegment[] => {
	const text = latin1Of(container);
	const magicEnd = text.indexOf("\0");
	if (magicEnd < 0) return [];
	let at = magicEnd + 1;
	for (const _field of ["VERSION", "FILE_SIZE"]) {
		const end = text.indexOf("\0", at);
		if (end < 0) return [];
		at = end + 1 + 4;
	}
	const segments: ReadSegment[] = [];
	while (text.startsWith("SEGMENT\0", at)) {
		const totalAt = at + "SEGMENT\0".length;
		const nameStart = totalAt + 4;
		const nameEnd = text.indexOf("\0", nameStart);
		if (nameEnd < 0) return segments;
		const lengthAt = nameEnd + 1;
		const contentStart = lengthAt + 4;
		const contentEnd = contentStart + u32At(container, lengthAt);
		if (contentEnd > container.length) return segments;
		segments.push({
			name: text.slice(nameStart, nameEnd),
			totalAt,
			lengthAt,
			contentStart,
			contentEnd,
			content: container.subarray(contentStart, contentEnd),
		});
		at = contentEnd + "SEGMENT_END\0".length;
	}
	return segments;
};

const containerOf = async (file: Bytes): Promise<Bytes> =>
	new Uint8Array(await zlibInflate(file.subarray(12)));

const segmentNamed = (container: Bytes, name: string): ReadSegment => {
	const found = readSegmentsOf(container).find(
		(segment) => segment.name === name,
	);
	if (found === undefined) throw new Error(`no ${name} segment`);
	return found;
};

const hexOf = (bytes: Bytes, from = 0, to = bytes.length): string =>
	Array.from(bytes.subarray(from, to))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join(" ");

describe("the XML projection", () => {
	test("reads a profile into the shared model", () => {
		expect(profileOf(DOC).id).toBeUndefined();
		expect(arraysOf(DOC).map((entry) => entry.id)).toEqual([
			"!INFO",
			"SAVE_FORMAT",
			"PLAYER_STATE",
			"RECIPES",
			"ITEMS",
			"FEATURES",
			"TEMPORARY_MODIFIERS_0",
			"INVENTORY_0_ITEM_USES",
			"GLOBAL_KEY_VALUE_STORES",
		]);
	});

	test("repeated siblings become real arrays, not objects keyed by index", () => {
		const recipes = asObject(
			arraysOf(DOC).find((entry) => entry.id === "RECIPES") ?? null,
		).node;
		expect(Array.isArray(recipes)).toBe(true);
		expect(recipes).toHaveLength(6);
	});

	test("the shared path helpers can reach and change a leaf through that array", () => {
		const at = indexOfArray(DOC, "RECIPES");
		const changed = setAtPath(
			DOC,
			["root", "array", at, "node", 0, "unlocked"],
			"1",
		);
		expect(
			getAtPath(changed, ["root", "array", at, "node", 0, "unlocked"]),
		).toBe("1");
		expect(getAtPath(DOC, ["root", "array", at, "node", 0, "unlocked"])).toBe(
			"0",
		);
	});

	test("keeps attribute values as text, including the ones that look numeric", () => {
		expect(asObject(nodeNamed(DOC, "PLAYER_STATE", "buildups")).cold).toBe(
			"0.00",
		);
		expect(asObject(nodeNamed(DOC, "PLAYER_STATE", "buildups")).heat).toBe(
			"0.00",
		);
		expect(
			asObject(nodeNamed(DOC, "!INFO", "game_version_created")).value,
		).toBe("1.4.1.12");
	});

	test("writes the profile back byte for byte in the game's own layout", () => {
		expect(unprojectXml(profileOf(DOC))).toBe(PROFILE_XML);
	});

	test("is a fixpoint, so a file this codec writes rebuilds to its own bytes", () => {
		const once = unprojectXml(projectXml(PROFILE_XML));
		expect(unprojectXml(projectXml(once))).toBe(once);
	});

	test("closes an <array> even with no children, and self-closes a <node>", () => {
		expect(PROFILE_XML).toContain(
			'<array id="TEMPORARY_MODIFIERS_0">\n\t</array>',
		);
		expect(unprojectXml(profileOf(DOC))).toContain('<node id="home_portal"/>');
	});

	test("refuses a document whose root is not <root>", () => {
		expect(() => projectXml(`${XML_DECLARATION}\n<profile/>`)).toThrow(
			/<root>/,
		);
	});

	test("refuses text content rather than dropping it silently", () => {
		expect(() =>
			projectXml(
				`${XML_DECLARATION}\n<root><array id="X">hello</array></root>`,
			),
		).toThrow(/text content/);
	});

	test("refuses an attribute and a child element sharing a name", () => {
		expect(() =>
			projectXml(
				`${XML_DECLARATION}\n<root><array id="X" node="1"><node id="y"/></array></root>`,
			),
		).toThrow(/both an attribute and a child element/);
	});

	test("unescapes attribute values in and re-escapes them out", () => {
		const xml = `${XML_DECLARATION}\n<root><array id="A&amp;B"><node id="x" note="&lt;hi&gt;"/></array></root>`;
		const doc = projectXml(xml);
		const group = asObject(doc).array;
		if (!Array.isArray(group)) throw new Error("no array group");
		expect(asObject(group[0]).id).toBe("A&B");
		const nodes = asObject(group[0]).node;
		if (!Array.isArray(nodes)) throw new Error("no node group");
		expect(asObject(nodes[0]).note).toBe("<hi>");
		expect(unprojectXml(doc)).toContain('note="&lt;hi>"');
		expect(unprojectXml(doc)).toContain('id="A&amp;B"');
	});
});

describe("the container codec", () => {
	test("decodes a save into a profile beside the bytes needed to rebuild it", () => {
		expect(unprojectXml(profileOf(DOC))).toBe(PROFILE_XML);
		expect(scaffoldOf(DOC)).toBeTypeOf("string");
	});

	test("rebuilds a file that decodes to the same document", async () => {
		expect(await decodeToJson(await encodeFromJson(DOC))).toEqual(DOC);
	});

	test("carries the world segments through byte for byte", async () => {
		const back = await decodeToJson(await encodeFromJson(DOC));
		expect(scaffoldOf(back)).toBe(scaffoldOf(DOC));
	});

	test("writes the two header lengths the rebuild actually produced", async () => {
		const rebuilt = await encodeFromJson(DOC);
		const view = new DataView(
			rebuilt.buffer,
			rebuilt.byteOffset,
			rebuilt.byteLength,
		);
		expect(new TextDecoder().decode(rebuilt.subarray(0, 4))).toBe("10tc");
		expect(view.getUint32(8, true)).toBe(rebuilt.length - 12);
		const { zlibInflate } = await import("../../shared");
		const container = new Uint8Array(await zlibInflate(rebuilt.subarray(12)));
		expect(view.getUint32(4, true)).toBe(container.length);
	});

	test("an edit survives the round trip", async () => {
		const at = indexOfArray(DOC, "PLAYER_STATE");
		const edited = setAtPath(
			DOC,
			["root", "array", at, "node", 0, "value"],
			"50",
		);
		const back = await decodeToJson(await encodeFromJson(edited));
		expect(
			asObject(nodeNamed(back, "PLAYER_STATE", "experience_level")).value,
		).toBe("50");
	});

	test("refuses a document that did not come from this editor", async () => {
		expect(encodeFromJson({ root: projectXml(PROFILE_XML) })).rejects.toThrow(
			/the world, in 47 segments/,
		);
	});

	test("refuses a file too short to hold a save", async () => {
		expect(dysmantle.decode(new Uint8Array([1, 2, 3]))).rejects.toThrow(
			/too short/,
		);
	});

	test("refuses a file that inflates but is not a container", async () => {
		expect(
			dysmantle.decode(await buildSaveOf("just some text")),
		).rejects.toThrow(/not a 10TONS container/);
	});

	test("refuses a container with no xml segment", async () => {
		const empty = new Uint8Array([
			...new TextEncoder().encode("10TONS_CONTAINER\0VERSION\0"),
			1,
			0,
			0,
			0,
			...new TextEncoder().encode("FILE_SIZE\0"),
			0,
			0,
			0,
			0,
			...new TextEncoder().encode("\0CONTAINER_END\0"),
		]);
		const { zlibDeflate } = await import("../../shared");
		const compressed = new Uint8Array(await zlibDeflate(empty));
		const file = new Uint8Array(12 + compressed.length);
		file.set(new TextEncoder().encode("10tc"), 0);
		new DataView(file.buffer).setUint32(8, compressed.length, true);
		file.set(compressed, 12);
		expect(dysmantle.decode(file)).rejects.toThrow(/no "xml" segment/);
	});
});

describe("the write path", () => {
	const rebuiltContainerOf = async (doc: JsonValue): Promise<Bytes> =>
		containerOf(await encodeFromJson(doc));

	test("the scaffold is the container with the profile's own bytes removed", async () => {
		const scaffold = base64Decode(scaffoldOf(DOC));
		const container = await containerOf(SAVE);
		const xml = segmentNamed(container, "xml");

		const expected = new Uint8Array(container.length - PROFILE_XML.length);
		expected.set(container.subarray(0, xml.contentStart), 0);
		expected.set(container.subarray(xml.contentEnd), xml.contentStart);
		for (const at of [xml.totalAt, xml.lengthAt]) {
			new DataView(expected.buffer).setUint32(at, 0, true);
		}
		expect(bytesEqual(scaffold, expected)).toBe(true);
		expect(hexOf(scaffold)).toBe(hexOf(expected));
		expect(scaffold.length).toBe(container.length - PROFILE_XML.length);
		expect(u32At(scaffold, xml.lengthAt)).toBe(0);
		expect(u32At(scaffold, xml.totalAt)).toBe(0);
	});

	test("the scaffold carries every world segment, uninterpreted and intact", async () => {
		const container = await containerOf(SAVE);
		const scaffold = base64Decode(scaffoldOf(DOC));
		const names = readSegmentsOf(container).map((segment) => segment.name);
		expect(names).toEqual([
			"xml",
			"bin",
			"STAGE_PERSISTENCY&stages/island/index.xml&puid1",
		]);
		for (const name of names) {
			const before = segmentNamed(container, name);
			const after = segmentNamed(scaffold, name);
			if (name !== "xml") {
				expect(bytesEqual(after.content, before.content)).toBe(true);
				expect(hexOf(after.content)).toBe(hexOf(before.content));
			} else {
				expect(after.content.length).toBe(0);
			}
		}
	});

	test("writing a document back copies the world segments byte for byte", async () => {
		const working = applyEdits(DOC, effectiveEdits(planFor("max-level"), DOC));
		const before = await containerOf(SAVE);
		const after = await rebuiltContainerOf(working);

		const beforeSegments = readSegmentsOf(before);
		const afterSegments = readSegmentsOf(after);
		expect(afterSegments.map((segment) => segment.name)).toEqual(
			beforeSegments.map((segment) => segment.name),
		);
		for (const [index, original] of beforeSegments.entries()) {
			const rebuilt = afterSegments[index];
			if (rebuilt === undefined) throw new Error("a segment went missing");
			expect(rebuilt.totalAt).toBe(original.totalAt);
			expect(rebuilt.lengthAt).toBe(original.lengthAt);
			if (original.name === "xml") continue;
			expect(bytesEqual(rebuilt.content, original.content)).toBe(true);
		}
	});

	test("an edit changes the profile's bytes and nothing else in the container", async () => {
		const working = applyEdits(DOC, effectiveEdits(planFor("max-level"), DOC));
		const before = await containerOf(SAVE);
		const after = await rebuiltContainerOf(working);
		const beforeXml = segmentNamed(before, "xml");
		const afterXml = segmentNamed(after, "xml");

		expect(
			bytesEqual(
				after.subarray(0, beforeXml.totalAt),
				before.subarray(0, beforeXml.totalAt),
			),
		).toBe(true);
		expect(
			bytesEqual(
				after.subarray(beforeXml.lengthAt + 4, beforeXml.contentStart),
				before.subarray(beforeXml.lengthAt + 4, beforeXml.contentStart),
			),
		).toBe(true);
		expect(
			bytesEqual(
				after.subarray(afterXml.contentEnd),
				before.subarray(beforeXml.contentEnd),
			),
		).toBe(true);
		expect(u32At(after, afterXml.lengthAt)).toBe(
			afterXml.contentEnd - afterXml.contentStart,
		);
		expect(u32At(after, afterXml.totalAt)).toBe(
			u32At(after, afterXml.lengthAt) + 8,
		);
		expect(new TextDecoder().decode(afterXml.content)).toContain(
			'<node id="experience_level" value="50"/>',
		);
	});

	test("the scaffold is a fixed point: a rebuild hands back the same bytes", async () => {
		const edited = applyEdits(DOC, effectiveEdits(planFor("unlock-all"), DOC));
		expect(scaffoldOf(await decodeToJson(await encodeFromJson(DOC)))).toBe(
			scaffoldOf(DOC),
		);
		expect(scaffoldOf(await decodeToJson(await encodeFromJson(edited)))).toBe(
			scaffoldOf(DOC),
		);
	});

	test("encoding is deterministic: the same document gives the same bytes", async () => {
		const first = await encodeFromJson(DOC);
		const second = await encodeFromJson(DOC);
		expect(bytesEqual(first, second)).toBe(true);
		expect(hexOf(first)).toBe(hexOf(second));
		expect(bytesEqual(first, new Uint8Array(SAVE))).toBe(true);
	});

	test("every quick action is idempotent on the bytes it produces", async () => {
		for (const action of dysmantle.actions) {
			const once = applyEdits(DOC, effectiveEdits(action.plan(DOC), DOC));
			const firstBytes = await encodeFromJson(once);
			expect(effectiveEdits(action.plan(once), once)).toEqual([]);
			const twice = applyEdits(once, effectiveEdits(action.plan(once), once));
			expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
			const secondBytes = await encodeFromJson(twice);
			expect(bytesEqual(secondBytes, firstBytes)).toBe(true);
			expect(hexOf(secondBytes)).toBe(hexOf(firstBytes));
		}
	});

	test("quick actions leave the world alone, whichever is applied", async () => {
		const before = await containerOf(SAVE);
		const world = readSegmentsOf(before).filter(
			(segment) => segment.name !== "xml",
		);
		expect(world.length).toBe(2);
		for (const action of dysmantle.actions) {
			const working = applyEdits(DOC, effectiveEdits(action.plan(DOC), DOC));
			const after = readSegmentsOf(await rebuiltContainerOf(working));
			for (const original of world) {
				const rebuilt = after.find((segment) => segment.name === original.name);
				expect(rebuilt).toBeDefined();
				expect(
					bytesEqual(rebuilt?.content ?? new Uint8Array(), original.content),
				).toBe(true);
			}
		}
	});

	test("every action's rebuild is a byte-stable fixed point", async () => {
		for (const action of dysmantle.actions) {
			const working = applyEdits(DOC, effectiveEdits(action.plan(DOC), DOC));
			const rebuilt = await encodeFromJson(working);
			const reread = await decodeToJson(rebuilt);
			expect(await verifyRoundTrip(dysmantle, rebuilt, reread, false)).toEqual({
				kind: "identical",
			});
		}
	});
});

describe("the summary", () => {
	test("reports figures read from names this save actually has", () => {
		const value = (label: string) =>
			dysmantle.summarise(DOC).find((row) => row.label === label)?.value;
		expect(value("Game version")).toBe("1.4.1.12");
		expect(value("Save format")).toBe("3");
		expect(value("Player level")).toBe("12");
		expect(value("Skill points to spend")).toBe("3");
		expect(value("Skill points spent")).toBe("1");
		expect(value("Deaths")).toBe("2");
		expect(value("Recipes and skills")).toBe("6");
		expect(value("Skills")).toBe("2");
		expect(value("Recipes still locked")).toBe("6");
		expect(value("Items tracked")).toBe("3");
		expect(value("Features")).toBe("2");
		expect(value("Materials found")).toBe("3");
		expect(value("Material stacks")).toBe("3");
	});

	test("omits a figure the save does not carry rather than reporting a zero", () => {
		const rows = dysmantle.summarise({
			root: {
				array: [{ id: "SAVE_FORMAT", node: [{ id: "version", value: "3" }] }],
			},
		});
		expect(rows.map((row) => row.label)).toEqual(["Save format"]);
	});
});

describe("the quick actions", () => {
	const after = (id: string, label: string) =>
		planFor(id).find((edit) => edit.label === label)?.after;

	test("fill every material writes the stacks, the found flags and the pages", () => {
		const player = indexOfArray(DOC, "PLAYER_STATE");
		const root = `root.array.${player}`;
		expect(after("fill-materials", `${root}.node.7.SCRAP_METAL`)).toBe("9999");
		expect(after("fill-materials", `${root}.node.8.PLANTS`)).toBe("9999");
		expect(after("fill-materials", `${root}.node.6.found_STONE`)).toBe("1");
		expect(after("fill-materials", `${root}.node.10.amount`)).toBe("9999");
		expect(
			planFor("fill-materials").some((edit) => edit.label.endsWith(".id")),
		).toBe(false);
	});

	test("level 50 writes both level nodes, which the game keeps in step", () => {
		const edits = planFor("max-level");
		expect(edits.map((edit) => edit.after)).toEqual(["50", "50"]);
		expect(edits).toHaveLength(2);
	});

	test("skill points writes the unspent count and not the spent one", () => {
		expect(planFor("skill-points")).toHaveLength(1);
		expect(
			after(
				"skill-points",
				`root.array.${indexOfArray(DOC, "PLAYER_STATE")}.node.2.value`,
			),
		).toBe("20");
	});

	test("unlock all covers every recipe and skill, and levels the upgradable", () => {
		const labels = planFor("unlock-all").map((edit) => edit.label);
		expect(labels.filter((label) => label.endsWith(".unlocked"))).toHaveLength(
			6,
		);
		expect(labels.filter((label) => label.endsWith(".new"))).toHaveLength(6);
		expect(labels.filter((label) => label.endsWith(".crafted"))).toHaveLength(
			6,
		);
		expect(labels.filter((label) => label.endsWith(".level"))).toHaveLength(3);
	});

	test("unlock all records the skill count the game shows", () => {
		expect(
			after(
				"unlock-all",
				`root.array.${indexOfArray(DOC, "PLAYER_STATE")}.node.3.value`,
			),
		).toBe("2");
	});

	test("unlock features covers whatever the save lists, and skips a no-op", () => {
		const edits = planFor("unlock-features");
		expect(edits).toHaveLength(1);
		expect(edits[0]?.before).toBe("0");
		expect(edits[0]?.after).toBe("1");
	});

	test("make all items available covers both item lists", () => {
		const labels = planFor("unlock-items").map((edit) => edit.label);
		expect(labels).toHaveLength(4);
		expect(labels.filter((label) => label.endsWith(".available"))).toHaveLength(
			2,
		);
		expect(
			labels.filter((label) => label.endsWith(".times_used")),
		).toHaveLength(2);
	});

	test("unlock a weapon writes the recipe, the item and the use counter", () => {
		const edits = planFor("unlock-katana");
		expect(edits.map((edit) => edit.label.split(".").pop())).toEqual([
			"unlocked",
			"new",
			"crafted",
			"level",
			"available",
			"times_used",
		]);
		expect(edits.map((edit) => edit.after)).toEqual([
			"1",
			"0",
			"1",
			"9",
			"1",
			"0",
		]);
	});

	test("a weapon this save does not have greys its own button out", () => {
		expect(planFor("unlock-laser-sword")).toEqual([]);
	});

	test("every plan is pure: it does not touch the document it is given", () => {
		const before = JSON.stringify(DOC);
		for (const action of dysmantle.actions) action.plan(DOC);
		expect(JSON.stringify(DOC)).toBe(before);
	});

	test("every plan returns the same edits when asked twice", () => {
		for (const action of dysmantle.actions) {
			expect(JSON.stringify(action.plan(DOC))).toBe(
				JSON.stringify(action.plan(DOC)),
			);
		}
	});

	test("the planned edits change the profile and read back identically", async () => {
		const working = applyEdits(DOC, effectiveEdits(planFor("unlock-all"), DOC));
		expect(await decodeToJson(await encodeFromJson(working))).toEqual(working);
	});

	test("a planned edit reaches the value it claims", async () => {
		const edits = effectiveEdits(planFor("unlock-all"), DOC);
		const working = applyEdits(DOC, edits);
		const back = await decodeToJson(await encodeFromJson(working));
		const recipes = nodesUnder(back, "RECIPES");
		for (const recipe of recipes) {
			expect(asObject(recipe).unlocked).toBe("1");
			expect(asObject(recipe).new).toBe("0");
			expect(asObject(recipe).crafted).toBe("1");
		}
		expect(asObject(recipes[2] ?? null).level).toBe("9");
		expect("level" in asObject(recipes[3] ?? null)).toBe(false);
	});
});

describe("the codec contract", () => {
	test("decode and encode are inverses on this save", async () => {
		expect(await dysmantle.decode(SAVE)).toEqual(DOC);
		expect(await dysmantle.encode(DOC)).toBeInstanceOf(Uint8Array);
	});

	test("an untouched save rebuilds to the identical bytes", async () => {
		const verdict = await verifyRoundTrip(dysmantle, SAVE, DOC, false);
		expect(verdict.kind).toBe("identical");
	});

	test("the round-trip check passes after an edit", async () => {
		const working = applyEdits(DOC, planFor("max-level"));
		const verdict = await verifyRoundTrip(dysmantle, SAVE, working, true);
		expect(verdict.kind).toBe("semantic");
	});

	test("a rebuilt file re-encodes to the same bytes it was built from", async () => {
		const rebuilt = await encodeFromJson(DOC);
		const reread = await decodeToJson(rebuilt);
		expect(bytesEqual(await encodeFromJson(reread), rebuilt)).toBe(true);
		expect(await verifyRoundTrip(dysmantle, rebuilt, reread, false)).toEqual({
			kind: "identical",
		});
	});

	test("that holds after an edit too", async () => {
		const working = applyEdits(DOC, effectiveEdits(planFor("max-level"), DOC));
		const rebuilt = await encodeFromJson(working);
		const reread = await decodeToJson(rebuilt);
		expect(bytesEqual(await encodeFromJson(reread), rebuilt)).toBe(true);
		expect(await verifyRoundTrip(dysmantle, rebuilt, reread, false)).toEqual({
			kind: "identical",
		});
	});

	test("the codec describes itself", () => {
		expect(dysmantle.game).toBe("DYSMANTLE");
		expect(dysmantle.extensions).toEqual(["save"]);
		expect(dysmantle.defaultPath).toContain("com.the10tons.dysmantle");
		expect(dysmantle.notes.length).toBeGreaterThanOrEqual(3);
		expect(dysmantle.notes.length).toBeLessThanOrEqual(4);
		for (const note of dysmantle.notes) {
			expect(note.title.length).toBeGreaterThan(0);
			expect(note.body.length).toBeGreaterThan(0);
		}
	});
});
