import { isJsonObject, type JsonValue } from "../../shared";

const ROOT_ELEMENT = "root";

export const ARRAY_ELEMENT = "array";

export const NODE_ELEMENT = "node";

export const XML_DECLARATION = '<?xml version="1.0" encoding="iso-8859-1"?>';

const indent = (depth: number): string => "\t".repeat(depth);

const beforeChild = (depth: number): string =>
	depth === 0 ? `\n\n${indent(1)}` : `\n${indent(depth + 1)}`;

const attribute = (name: string, value: string): string =>
	` ${name}="${value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/"/g, "&quot;")}"`;

const isAttribute = (value: JsonValue): value is string =>
	typeof value === "string";

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

export const childGroups = (
	node: JsonValue,
): readonly (readonly [string, readonly JsonValue[]])[] => {
	if (!isJsonObject(node)) return [];
	return Object.entries(node).flatMap(([name, value]) =>
		Array.isArray(value) ? [[name, value] as const] : [],
	);
};

type Located = {
	readonly path: readonly (string | number)[];
	readonly value: JsonValue;
};

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
