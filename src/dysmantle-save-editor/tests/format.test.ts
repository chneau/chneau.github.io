import { describe, expect, test } from "bun:test";
import {
	applyEdits,
	type Bytes,
	effectiveEdits,
	getAtPath,
	isJsonObject,
	type JsonValue,
	setAtPath,
	verifyRoundTrip,
} from "../../shared";
import { decodeToJson, dysmantle, encodeFromJson } from "../lib/format";
import { projectXml, unprojectXml, XML_DECLARATION } from "../lib/xml";

// A DOM is needed for the XML half. Registered here rather than in the codec,
// so the pure byte half of the suite would still run without it.
await import("../../shared/tests/happy-dom");

/**
 * ## The fixture is synthetic
 *
 * No real `profile.save` ships with this repository — it is somebody's save,
 * and it is not this project's to commit. Everything below is written by hand
 * to the shape measured against a real 1.4.1.12 save: the same `<array>` group
 * names, the same element names, the same attribute names, the same spacing, and
 * the same three element shapes (`<array>` always closed, `<node/>` always
 * self-closed, the one childless array closed rather than self-closed).
 *
 * What that buys and what it does not: it pins the codec's *behaviour* — the
 * container framing, the projection, the round trip, the quick actions — against
 * a document shaped like the real thing. It cannot prove a real save behaves the
 * same way. The two claims are kept apart on purpose, and the measurements taken
 * from the real file are written into the comments in `lib/xml.ts` and
 * `lib/format.ts` rather than quietly promoted to tests they are not.
 */
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

/**
 * The container the game writes: a header, then named segments, then a trailer.
 *
 * Assembled byte by byte rather than with the codec's own writer. A fixture
 * built from the code it is meant to test would prove nothing about the framing,
 * and the tests below read the result back through `dysmantle` to show they
 * agree.
 */
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
	// `10TONS_CONTAINER\0`, `VERSION\0` + 1, `FILE_SIZE\0` + 0 — the header a
	// real 1.4.1.12 save opens with, the `FILE_SIZE` field included: it is zero
	// in that file and this codec copies it rather than inventing a meaning.
	push("10TONS_CONTAINER\0");
	push("VERSION\0");
	u32(1);
	push("FILE_SIZE\0");
	u32(0);
	for (const [name, content] of SEGMENTS) {
		push("SEGMENT\0");
		// The segment total covers the name field, the length field and the
		// content, which is what the game writes.
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
	// Two world segments the codec cannot interpret. The bytes are arbitrary on
	// purpose: if it understood this format it would be tempted to rewrite them,
	// and the tests below prove it does not.
	["bin", "world-state-bytes"],
	["STAGE_PERSISTENCY&stages/island/index.xml&puid1", "binary blob"],
];

const buildSave = async (): Promise<Bytes> => {
	const container = containerBytes();
	const { zlibDeflate } = await import("../../shared");
	// Copied into a concrete `Uint8Array`, which is what `Bytes` is: the
	// element-less spelling admits a `SharedArrayBuffer` that neither WebCrypto
	// nor a `WritableStream` will take.
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

/**
 * The document as the shared model sees it.
 *
 * Read through a narrowing helper rather than a cast, because the tests assert
 * on its shape and a cast would let a wrong shape through silently.
 */
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

/** The key the container bytes travel under; see `lib/format.ts`. */
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

/** The array index of a named group, which is what the action labels show. */
const indexOfArray = (doc: JsonValue, arrayId: string): number =>
	arraysOf(doc).findIndex((entry) => entry.id === arrayId);

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
		// The whole point of the shape: `getAtPath` follows a numeric path
		// segment only into an actual array, and `RECIPES` has 417 children in a
		// real save, so an object here would be a document the editor cannot
		// walk.
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
		// And the original is untouched, which is what makes "re-encode and
		// compare" a proof rather than a tautology.
		expect(getAtPath(DOC, ["root", "array", at, "node", 0, "unlocked"])).toBe(
			"0",
		);
	});

	test("keeps attribute values as text, including the ones that look numeric", () => {
		// `0.00` read as a number comes back as `0`, and `1.4.1.12` is not a
		// number at all. Either would be a save that decodes and then loses
		// formatting the game reads.
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
		// Both shapes are measured on a real save, where the one childless array
		// is `<array id="TEMPORARY_MODIFIERS_0">\n\t</array>` and not a
		// self-closing tag.
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
		// The projection cannot put text back, so a document carrying it would be
		// mangled on the way out. Saying so beats mangling it.
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
		// `&` and `<` and `"` are escaped; `>` is not, and need not be — XML only
		// requires it in `]]>`, and no attribute value in a real save has one.
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
		// These are the segments the codec cannot interpret, and the reason the
		// scaffold travels in the document at all. A rebuild that dropped or
		// rewrote them would be a save with the world missing.
		const back = await decodeToJson(await encodeFromJson(DOC));
		expect(scaffoldOf(back)).toBe(scaffoldOf(DOC));
	});

	test("writes the two header lengths the rebuild actually produced", async () => {
		// The game reads both, and neither is the input file's: the compressed
		// stream is this codec's own, at the platform's default level.
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
		// Without the scaffold there is no way to rebuild the 47 world segments, and
		// inventing them would be worse than refusing.
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
		// The wrong-file case, which is what a reader who picks the wrong `.save`
		// actually hits, and the only rejection path here that does not go
		// through the shared inflate helper's own failure mode.
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
		// A save from another game version genuinely lacks these names, and a
		// zero would be a claim about the player's progress nobody measured —
		// including for the counts, where "0 recipes" would be a statement about
		// the game version rather than about the player.
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
		// material_storage, material_storage_alltime, the `found_` flags on
		// `materials`, and the inventory pages.
		expect(after("fill-materials", `${root}.node.7.SCRAP_METAL`)).toBe("9999");
		expect(after("fill-materials", `${root}.node.8.PLANTS`)).toBe("9999");
		expect(after("fill-materials", `${root}.node.6.found_STONE`)).toBe("1");
		expect(after("fill-materials", `${root}.node.10.amount`)).toBe("9999");
		// `id` names the node rather than holding a stack, and a number written
		// into it would rename the node.
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
		// Six children: each gets unlocked/new/crafted, and the three that carry
		// a `level` also get raised. The lily and the two skills have none, and
		// an attribute the save does not have is never written.
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
		// `CAMPFIRE_FAST_TRAVEL` is already available, so restaging it would be
		// a change to the list that did nothing.
		expect(edits).toHaveLength(1);
		expect(edits[0]?.before).toBe("0");
		expect(edits[0]?.after).toBe("1");
	});

	test("make all items available covers both item lists", () => {
		const labels = planFor("unlock-items").map((edit) => edit.label);
		// The backpack is already available in both lists, and the crowbar's
		// counter already reads zero, so only the three that would change are
		// staged: an entry that changes nothing is noise in the list.
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
		// No edits is how the workbench disables a quick action, so an absent
		// recipe has to produce none rather than a partial set.
		expect(planFor("unlock-laser-sword")).toEqual([]);
	});

	test("every plan is pure: it does not touch the document it is given", () => {
		// A plan that mutated its input would leave the working document
		// disagreeing with the one the round-trip check compares against.
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
		// The upgradable ones reached 9; the lily and the two skills, which have
		// no `level` attribute, were not given one.
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
		// The strongest result the framework has, and this fixture earns it: it
		// is deflated by this same platform, so nothing in the codec loses a
		// byte. A *real* save is deflated by the game at a level
		// `CompressionStream` cannot be asked for, so it reports `semantic`
		// instead — which is why the note in `lib/format.ts` says so rather
		// than promising byte equality it cannot keep.
		const verdict = await verifyRoundTrip(dysmantle, SAVE, DOC, false);
		expect(verdict.kind).toBe("identical");
	});

	test("the round-trip check passes after an edit", async () => {
		// `semantic`, not `lossless-edit`: the document reads back exactly as
		// asked, and the bytes differ because the profile genuinely changed.
		const working = applyEdits(DOC, planFor("max-level"));
		const verdict = await verifyRoundTrip(dysmantle, SAVE, working, true);
		expect(verdict.kind).toBe("semantic");
	});

	test("the codec describes itself", () => {
		expect(dysmantle.id).toBe("dysmantle-save-editor");
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
