/**
 * The XML <-> `JsonValue` projection for DYSMANTLE's `profile.save`.
 *
 * ## The shape, and why it is projected this way
 *
 * A profile is exactly one XML document with three element names in it, measured
 * against a real 1.4.1.12 save: `root` holds 22 `<array>` elements, each of
 * those holds `<node>` elements, and there is nothing deeper. 887 elements in
 * all, no comments, no CDATA, and not one element carrying text — every value
 * in the format is an attribute. The whole document is therefore attributes on
 * a fixed two-level skeleton, and a projection of that is lossless as long as
 * the *structure* survives.
 *
 * An element becomes an object: its attributes as string values, its child
 * elements as a real array under a key named after the child element. So
 *
 *     <array id="RECIPES">
 *       <node id="AXE" unlocked="1"/>
 *     </array>
 *
 * becomes `{ id: "RECIPES", node: [{ id: "AXE", unlocked: "1" }] }`.
 *
 * Three deliberate choices:
 *
 * - **Child groups are real arrays.** The shared inspector addresses a document
 *   by `SavePath`, and `getAtPath` only follows a numeric segment into an actual
 *   array, so a sibling group modelled as `{ "0": …, "1": … }` is a document the
 *   editing machinery cannot walk. `RECIPES` alone has 417 children.
 * - **Attributes stay strings.** The file stores `cold="0.00"`, `power="0.00"`,
 *   `player_angle="-1.332"` and `game_version_created="1.4.1.12"`. Parsing
 *   those as numbers and writing them back turns `0.00` into `0` and turns the
 *   version into a parse failure — a save that decodes and then quietly loses
 *   formatting the game reads.
 * - **`id` is not hoisted into the key.** It stays an ordinary attribute, so the
 *   writer never has to guess where a name came from, two siblings sharing an id
 *   would not collide, and the model stays a structural projection with no
 *   per-format cleverness in it.
 */
import { isJsonObject, type JsonValue } from "../../shared";

/** The single element wrapping the whole document. */
const ROOT_ELEMENT = "root";

/** The element that groups `<node>`s. */
export const ARRAY_ELEMENT = "array";

/** The element that carries a value. */
export const NODE_ELEMENT = "node";

/** The XML declaration the game writes, byte for byte. */
export const XML_DECLARATION = '<?xml version="1.0" encoding="iso-8859-1"?>';

/**
 * The layout the game's own writer uses, recovered from a real save.
 *
 * A child is preceded by a newline and one more tab than its parent; an
 * element's closing tag by a newline at its own indentation. The one wrinkle is
 * the document element's children, which get a *blank* line before them —
 *
 *     <root>\n\n\t<array id="!INFO">\n\t\t<node …/>\n\t</array>\n\n\t<array …/>\n</root>
 *
 * — uniformly, across all 22 of them.
 *
 * ## What this reproduces, and what it cannot
 *
 * Measured on a real 1.4.1.12 save — 887 elements, 22 `<array>` groups, all
 * three of those numbers read out of the file rather than assumed — one
 * `unprojectXml(projectXml(x))` pass leaves **17 of the 22 `<array>` regions
 * byte-identical** and changes the other five: `RECIPES`, `ITEMS`, `QUESTS`,
 * `FEATURES`, `INVENTORY_0_ITEM_USES`. It changes them in one way only, putting
 * back the line breaks between children. Those five are exactly the arrays a
 * third-party editor appended to, and that editor writes new `<node>`s with no
 * separator at all, so `RECIPES` in that file has 417 children separated by five
 * newlines instead of 417.
 *
 * Strip inter-element whitespace from the original and from the rebuild and
 * **every one of the five is equal**, as is the whole document. That is the
 * strongest statement available: the difference is layout, and the format has
 * no text content anywhere, so inter-element whitespace is not data.
 *
 * It also means this is a fixpoint — measured, a second pass over its own output
 * changes nothing — so a save this codec writes rebuilds to its own bytes.
 *
 * `lib/format.ts` records what this costs at the *file* level, where a second
 * and independent reason keeps the bytes from matching whatever: the game
 * deflates at a level `CompressionStream` cannot be asked for.
 */
const indent = (depth: number): string => "\t".repeat(depth);

/** The whitespace in front of a child element at `depth`. */
const beforeChild = (depth: number): string =>
	depth === 0 ? `\n\n${indent(1)}` : `\n${indent(depth + 1)}`;

/**
 * One attribute.
 *
 * Escaped the way XML requires an attribute to be — `&`, `<` and `"` — and not
 * otherwise. `>` is deliberately left alone: XML only requires it escaped inside
 * `]]>`, and no attribute value in a real save contains one, so there is no
 * evidence of what the game's writer would do with it and guessing would put a
 * difference between this codec and the file it read. The round trip is
 * unaffected either way: a `>` decodes back to `>`.
 */
const attribute = (name: string, value: string): string =>
	` ${name}="${value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/"/g, "&quot;")}"`;

/** The one question this module has to answer about a value: text or a list? */
const isAttribute = (value: JsonValue): value is string =>
	typeof value === "string";

/**
 * Reads an XML document into the shared model.
 *
 * Whitespace-only text between elements is dropped, which is safe *because* it
 * was measured: no element in a real save has text content, so every text node
 * in the file is layout. A document that did carry text would be silently
 * mangled by that assumption, so it is refused instead — `unprojectXml` cannot
 * put text back, and an editor that quietly drops content is worse than one that
 * says it does not understand the file.
 */
export const projectXml = (xml: string): JsonValue => {
	const parsed = new DOMParser().parseFromString(xml, "application/xml");
	if (parsed.getElementsByTagName("parsererror").length > 0) {
		throw new Error("The XML in this save did not parse.");
	}
	const root = parsed.documentElement;
	if (root === null || root.tagName !== ROOT_ELEMENT) {
		throw new Error(
			`Expected the profile to be a <${ROOT_ELEMENT}> element, but it is ${
				root === null ? "missing" : `<${root.tagName}>`
			}.`,
		);
	}
	return readElement(root);
};

const readElement = (element: Element): JsonValue => {
	const out: Record<string, JsonValue> = {};
	// Tracked apart from `out` because two *siblings* legitimately share a
	// name — every `<node>` under an `<array>` does — and only a clash with this
	// element's own attributes is unrepresentable.
	const attributes = new Set<string>();
	for (const attribute of Array.from(element.attributes)) {
		attributes.add(attribute.name);
		out[attribute.name] = attribute.value;
	}
	for (const child of Array.from(element.children)) {
		const name = child.tagName;
		if (attributes.has(name)) {
			throw new Error(
				`<${element.tagName}> has both an attribute and a child element called "${name}", which this projection cannot represent.`,
			);
		}
		const siblings = out[name];
		out[name] = Array.isArray(siblings)
			? [...siblings, readElement(child)]
			: [readElement(child)];
	}
	for (const node of Array.from(element.childNodes)) {
		if (node.nodeType === 3 && (node.textContent ?? "").trim() !== "") {
			throw new Error(
				`<${element.tagName} id="${
					element.getAttribute("id") ?? ""
				}"> has text content, which this projection cannot represent.`,
			);
		}
	}
	return out;
};

/** Writes the shared model back to XML, in the game's own layout. */
export const unprojectXml = (doc: JsonValue): string => {
	if (!isJsonObject(doc)) {
		throw new Error("The profile to write is not an object.");
	}
	return `${XML_DECLARATION}\n${writeElement(doc, ROOT_ELEMENT, 0)}`;
};

const writeElement = (
	value: JsonValue,
	name: string,
	depth: number,
): string => {
	if (!isJsonObject(value)) {
		throw new Error(`<${name}> in the profile is not an object.`);
	}
	let out = `<${name}`;
	const groups: string[] = [];
	for (const [key, child] of Object.entries(value)) {
		if (isAttribute(child)) {
			out += attribute(key, child);
		} else if (Array.isArray(child)) {
			groups.push(key);
		} else {
			throw new Error(
				`"${key}" under <${name}> is neither an attribute nor a list of child elements.`,
			);
		}
	}
	// A `<node>` is self-closing, always: a real save has 864 of them and 864
	// self-closing tags. An `<array>` always gets an explicit closing tag, even
	// with no children — the one childless array in a real save is
	// `<array id="TEMPORARY_MODIFIERS_0">\n\t</array>`, not a self-closing tag.
	// So the question is which of the two element names this is, not whether it
	// happens to have children.
	if (groups.length === 0 && name !== ARRAY_ELEMENT) {
		return `${out}/>`;
	}
	out += ">";
	for (const key of groups) {
		const group = value[key];
		if (!Array.isArray(group)) continue;
		for (const child of group) {
			out += beforeChild(depth);
			out += writeElement(child, key, depth + 1);
		}
	}
	return `${out}\n${indent(depth)}</${name}>`;
};

/**
 * The child element groups of a node, in document order.
 *
 * Returned as entries rather than as an object so that two groups never have to
 * be merged, and so a caller walking a save's 22 arrays cannot be surprised by
 * key ordering.
 */
export const childGroups = (
	node: JsonValue,
): readonly (readonly [string, readonly JsonValue[]])[] => {
	if (!isJsonObject(node)) return [];
	return Object.entries(node).flatMap(([name, value]) =>
		Array.isArray(value) ? [[name, value] as const] : [],
	);
};

/** A located element: the path a `SaveEdit` needs, and the element itself. */
type Located = {
	readonly path: readonly (string | number)[];
	readonly value: JsonValue;
};

/**
 * Finds the first child element of `parent` named `name` whose `id` is `id`.
 *
 * Linear, because a save holds 887 elements at most and this runs while a quick
 * action is planning; a map would be built only to be thrown away.
 */
export const findElement = (
	parent: JsonValue,
	name: string,
	id: string,
	basePath: readonly (string | number)[],
): Located | undefined => {
	for (const [group, members] of childGroups(parent)) {
		if (group !== name) continue;
		for (const [index, member] of members.entries()) {
			if (isJsonObject(member) && member.id === id) {
				return { path: [...basePath, name, index], value: member };
			}
		}
	}
	return undefined;
};
