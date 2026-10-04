/**
 * The CERIMAL envelope: splits the file text around the base64 payload, checks
 * that a document really is one of ours field by field, and decides whether the
 * wrapper text can be spliced back so an untouched save returns byte for byte.
 *
 * Split out of `format.ts` unchanged.
 */
import { isJsonObject, type JsonValue, type SavePath } from "../../shared";
import { asNumber } from "./nodes";
import type { CerimalDocumentView, CerimalFile } from "./types";

/** The exact text a save uses to introduce its base64 payload. */
const PAYLOAD_KEY = '"binaryInfo":"';
/**
 * Splits the file text around the base64 payload.
 *
 * Both halves are kept exactly as they were written, because the envelope is
 * re-spliced rather than re-serialised: `"createdAtEpoch":1748808327.0` comes
 * back from `JSON.stringify` as `1748808327`, and the game's own key order is
 * not one `JSON.stringify` would necessarily reproduce.
 */
export const splitWrapper = (
	text: string,
): { before: string; after: string } => {
	const start = text.indexOf(PAYLOAD_KEY);
	if (start < 0) return { before: text, after: "" };
	const from = start + PAYLOAD_KEY.length;
	// A base64 payload contains no quote and no backslash, so the next quote
	// that ends it is the closing one.
	const end = text.indexOf('"', from);
	if (end < 0) {
		throw new Error("This save's binaryInfo field is not terminated.");
	}
	return { before: text.slice(0, from), after: text.slice(end) };
};

/** The `unknown` a `JSON.parse` hands back, narrowed to a document. */
export const toJsonValue = (value: unknown, depth = 0): JsonValue => {
	if (depth > 256) {
		throw new Error("This save nests its JSON too deeply to read.");
	}
	if (value === null) return null;
	switch (typeof value) {
		case "string":
		case "boolean":
			return value;
		case "number":
			if (!Number.isFinite(value)) {
				throw new Error("This save holds a number JSON cannot represent.");
			}
			return value;
		case "object":
			break;
		default:
			throw new Error(
				`This save holds a ${typeof value}, which JSON does not have.`,
			);
	}
	if (Array.isArray(value)) {
		return value.map((item) => toJsonValue(item, depth + 1));
	}
	// `Object.entries` is typed over `{ [key: string]: T }`, which the parser's
	// own return type is not; the entries are re-validated one by one below, so
	// nothing reaches the document unchecked.
	const entries = Object.entries(value);
	return Object.fromEntries(
		entries.map(([key, item]: [string, unknown]) => [
			key,
			toJsonValue(item, depth + 1),
		]),
	);
};

/**
 * Whether a value read out of a document is an object.
 *
 * The shared `isJsonObject` takes a `JsonValue`, and a value taken from a
 * document is `JsonValue | undefined` under this project's index-signature
 * rules — absence is an ordinary outcome when a save turns out not to be one of
 * ours, so it is answered here rather than with a non-null assertion.
 */
export const isRecord = (
	value: JsonValue | undefined,
): value is { readonly [key: string]: JsonValue } =>
	value !== undefined && isJsonObject(value);

const asObject = (
	value: JsonValue | undefined,
	what: string,
): { [key: string]: JsonValue } => {
	if (!isRecord(value)) {
		throw new Error(`This save has no ${what}.`);
	}
	return value;
};

const asText_ = (value: JsonValue | undefined, what: string): string => {
	if (typeof value === "string") return value;
	throw new Error(`This save has no ${what}.`);
};

const asPathList = (
	value: JsonValue | undefined,
	what: string,
): readonly SavePath[] => {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		throw new Error(`This document's ${what} is not a list of paths.`);
	}
	return value.map((entry) => {
		if (!Array.isArray(entry)) {
			throw new Error(
				`This document's ${what} holds something that is not a path.`,
			);
		}
		return entry.map((segment) => {
			if (typeof segment === "string" || typeof segment === "number") {
				return segment;
			}
			throw new Error(
				`A path in this document's ${what} has an unusable step.`,
			);
		});
	});
};

const asDimensionList = (
	value: JsonValue | undefined,
): readonly (readonly [SavePath, readonly number[]])[] => {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		throw new Error("This document's array shapes are not a list.");
	}
	return value.map((entry) => {
		const pair = asObject(entry, "array shape");
		const path = asPathList(pair.path, "array shapes");
		const extents = pair.extents;
		if (!Array.isArray(extents) || !path[0]) {
			throw new Error("This document holds an array shape without a path.");
		}
		return [
			path[0],
			extents.map((extent) => asNumber(extent, "an array extent")),
		];
	});
};

/** Checks that a value really is one of this codec's documents, field by field. */
export const asCerimalFile = (value: JsonValue): CerimalFile => {
	const root = asObject(value, "CERIMAL section");
	const section = asObject(root.$cerimal, "CERIMAL section");
	const documents: CerimalDocumentView[] = [];
	const views = section.documents;
	if (views !== undefined && !Array.isArray(views)) {
		throw new Error("This document's CERIMAL documents are not a list.");
	}
	for (const entry of views ?? []) {
		const view = asObject(entry, "CERIMAL document");
		const data = view.data;
		if (data === undefined) {
			throw new Error("A CERIMAL document in this file has no data.");
		}
		documents.push({
			rootType: asText_(view.rootType, "document type name"),
			version: asNumber(view.version ?? 2, "document version"),
			compression: asNumber(view.compression ?? 0, "document compression"),
			schema: asText_(view.schema, "document schema"),
			registered: asPathList(view.registered, "shared values"),
			dimensions: asDimensionList(view.dimensions),
			data,
		});
	}
	return {
		$cerimal: {
			envelope: asObject(section.envelope, "save envelope"),
			wrapperBefore: asText_(section.wrapperBefore, "save wrapper"),
			wrapperAfter: asText_(section.wrapperAfter, "save wrapper"),
			documents,
		},
	};
};
/**
 * Whether the envelope is still the one the wrapper text was written around.
 *
 * True means the payload can be spliced back and the file returns byte for
 * byte. False means an envelope field has been edited.
 */
export const wrapperMatches = (
	before: string,
	after: string,
	envelope: { readonly [key: string]: JsonValue },
): boolean => {
	try {
		// `wrapperBefore` ends with the opening quote of the payload and
		// `wrapperAfter` begins with its closing one, so putting the two together
		// leaves an empty string between the quotes — the only way to read back
		// what the wrapper originally wrapped.
		const rebuilt = toJsonValue(JSON.parse(`${before}${after}`));
		if (!isJsonObject(rebuilt)) return false;
		const without = { ...rebuilt };
		delete without.binaryInfo;
		return JSON.stringify(without) === JSON.stringify(envelope);
	} catch {
		return false;
	}
};
/** Whether a payload-less save's text is still the envelope it was read from. */
export const plainMatches = (
	before: string,
	envelope: { readonly [key: string]: JsonValue },
): boolean => {
	try {
		return (
			JSON.stringify(toJsonValue(JSON.parse(before))) ===
			JSON.stringify(envelope)
		);
	} catch {
		return false;
	}
};
