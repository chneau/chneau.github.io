import { getAtPath, type JsonValue, type SavePath, setAtPath } from "./json";
import type { SaveEdit } from "./types";

export const applyEdits = (
	doc: JsonValue,
	edits: readonly SaveEdit[],
): JsonValue => applyEditsSafely(doc, edits).doc;

type ApplyEditsResult = {
	doc: JsonValue;
	failed: readonly SaveEdit[];
};

export const applyEditsSafely = (
	doc: JsonValue,
	edits: readonly SaveEdit[],
): ApplyEditsResult => {
	const failed: SaveEdit[] = [];
	const next = edits.reduce((current, edit) => {
		if (edit.path.length === 0) return edit.after;
		try {
			return setAtPath(current, edit.path, edit.after);
		} catch {
			failed.push(edit);
			return current;
		}
	}, doc);
	return { doc: next, failed };
};

export const withEdits = (
	doc: JsonValue,
	edits: readonly SaveEdit[],
): JsonValue => applyEdits(doc, edits);

export const withoutPath = (
	edits: readonly SaveEdit[],
	path: SavePath,
): readonly SaveEdit[] =>
	edits.filter((edit) => pathKey(edit.path) !== pathKey(path));

export const pathKey = (path: SavePath): string => JSON.stringify(path);

export const editId = (path: SavePath, after: JsonValue): string =>
	`${pathKey(path)}=${JSON.stringify(after)}`;

export const stageEdits = (
	edits: readonly SaveEdit[],
	incoming: readonly SaveEdit[],
): readonly SaveEdit[] => {
	let next = edits;
	for (const edit of incoming) {
		next = [
			...next.filter(
				(existing) =>
					JSON.stringify(existing.path) !== JSON.stringify(edit.path),
			),
			edit,
		];
	}
	return next;
};

export const previewValue = (value: JsonValue): string => {
	if (typeof value === "string") {
		return value.length > 28 ? `"${value.slice(0, 28)}…"` : `"${value}"`;
	}
	if (value === null) return "null";
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) {
		return `[${value.length} item${value.length === 1 ? "" : "s"}]`;
	}
	const keys = Object.keys(value);
	return `{${keys.length} field${keys.length === 1 ? "" : "s"}}`;
};

export const isEffective = (edit: SaveEdit, doc: JsonValue): boolean => {
	if (edit.path.length === 0) {
		return JSON.stringify(edit.after) !== JSON.stringify(doc);
	}
	const current = getAtPath(doc, edit.path);
	return (
		current === undefined ||
		JSON.stringify(current) !== JSON.stringify(edit.after)
	);
};

export const effectiveEdits = (
	edits: readonly SaveEdit[],
	doc: JsonValue,
): readonly SaveEdit[] => edits.filter((edit) => isEffective(edit, doc));
