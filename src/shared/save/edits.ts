/**
 * Staged-edit bookkeeping.
 *
 * The invariant these functions exist to hold: a document is only ever changed
 * by folding a list of edits through `applyEdits`, and the list is the single
 * source of truth for what the user asked for. That is what lets the panel show
 * an honest "before", lets a single edit be reverted without replaying the
 * others, and lets the round-trip check compare against the true original.
 */
import { getAtPath, type JsonValue, type SavePath, setAtPath } from "./json";
import type { SaveEdit } from "./types";

/**
 * Folds edits into a document, left to right, so two edits touching the same
 * path compose in the order the user staged them.
 */
export const applyEdits = (
	doc: JsonValue,
	edits: readonly SaveEdit[],
): JsonValue =>
	edits.reduce((current, edit) => {
		if (edit.path.length === 0) return edit.after;
		return setAtPath(current, edit.path, edit.after);
	}, doc);

/**
 * The document as it stands with `edits` applied — computed, not stored, so a
 * render can never read a half-applied document.
 */
export const withEdits = (
	doc: JsonValue,
	edits: readonly SaveEdit[],
): JsonValue => applyEdits(doc, edits);

/**
 * Drops every edit at `path`, which reverts that field to what the save
 * actually held.
 *
 * A plain filter is the whole implementation, and that is only true because
 * the base document is never mutated: with edits `[gold 1→2, gold 2→3]` staged
 * in order, removing both leaves the document reading `1`, which is what the
 * file said. Restoring an intermediate value here would be the bug.
 *
 * Reverting by path rather than by id because a user who re-applies the same
 * action gets a fresh id but the same target, and "undo the gold change" should
 * undo the gold change whichever time they clicked it.
 */
export const withoutPath = (
	edits: readonly SaveEdit[],
	path: SavePath,
): readonly SaveEdit[] =>
	edits.filter((edit) => pathKey(edit.path) !== pathKey(path));

/**
 * The one identity for a save path.
 *
 * `editId`, `withoutPath` and `stageEdits` all compare or key on this, and
 * `useSaveDocument`'s `stagedPaths` set used `formatPath` instead. That gave the
 * app two different answers to "is this path staged?": one based on the path's
 * structure and one based on a rendered string.
 *
 * `formatPath` is lossy in a way that matters here. `["a.b"]` and `["a", "b"]`
 * both render as `a.b`, and `["a[0]"]` and `["a", 0]` both render as `a[0]`, so a
 * save with a key containing a dot or a bracket could mark the wrong field as
 * staged — or mark two. `formatPath` is for *display*; this is for identity, and
 * the two should never be interchanged.
 */
export const pathKey = (path: SavePath): string => JSON.stringify(path);

/**
 * A stable id for an edit, derived from its path and target value.
 *
 * Path-plus-value rather than a counter, so the same logical change staged
 * twice collapses instead of stacking — the user pressing "max gold" five times
 * should end up with one gold edit, not five.
 */
export const editId = (path: SavePath, after: JsonValue): string =>
	`${pathKey(path)}=${JSON.stringify(after)}`;

/**
 * Adds edits, replacing any existing edit at the same path.
 *
 * Last write wins, which is what makes the quick actions idempotent and lets
 * the inspector and a cheat button target the same field without either
 * having to know about the other.
 */
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

/** A short rendering of a value for the staged-edit list. */
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

/**
 * Whether an edit would actually change anything.
 *
 * A cheat that writes the value already present is noise in the list and makes
 * the round-trip check claim work it did not do, so it is filtered at the
 * source rather than shown and ignored.
 */
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

/** Keeps only the edits that would change the document. */
export const effectiveEdits = (
	edits: readonly SaveEdit[],
	doc: JsonValue,
): readonly SaveEdit[] => edits.filter((edit) => isEffective(edit, doc));
