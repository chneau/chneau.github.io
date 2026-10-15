import { isJsonObject, type JsonValue, type SavePath } from "../../shared";
import { asNumber } from "./nodes";
import type { CerimalDocumentView, CerimalFile } from "./types";

const PAYLOAD_KEY = '"binaryInfo":"';
export const splitWrapper = (
	text: string,
): { before: string; after: string } => {
	const start = text.indexOf(PAYLOAD_KEY);
	if (start < 0) return { before: text, after: "" };
	const from = start + PAYLOAD_KEY.length;
	const end = text.indexOf('"', from);
	if (end < 0) {
		throw new Error("This save's binaryInfo field is not terminated.");
	}
	return { before: text.slice(0, from), after: text.slice(end) };
};

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
	const entries = Object.entries(value);
	return Object.fromEntries(
		entries.map(([key, item]: [string, unknown]) => [
			key,
			toJsonValue(item, depth + 1),
		]),
	);
};

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
		if (!Array.isArray(entry)) {
			throw new Error(
				"This document holds an array shape with no array shape.",
			);
		}
		const [rawPath, extents] = entry;
		const path = asPathList(
			rawPath === undefined ? undefined : [rawPath],
			"array shapes",
		)[0];
		if (!path || path.length === 0 || !Array.isArray(extents)) {
			throw new Error("This document holds an array shape without a path.");
		}
		return [path, extents.map((extent) => asNumber(extent, "an array extent"))];
	});
};

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
export const wrapperMatches = (
	before: string,
	after: string,
	envelope: { readonly [key: string]: JsonValue },
): boolean => {
	try {
		const rebuilt = toJsonValue(JSON.parse(`${before}${after}`));
		if (!isJsonObject(rebuilt)) return false;
		const without = { ...rebuilt };
		delete without.binaryInfo;
		return JSON.stringify(without) === JSON.stringify(envelope);
	} catch {
		return false;
	}
};
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
