import { type Dispatch, type SetStateAction, useEffect } from "react";
import type { SaveView } from "@/lib/inventory";
import type { SaveEdit } from "@/lib/staged-edits";

/**
 * The two guards against losing staged work by accident.
 *
 * Both are keyed to the staged count rather than to a flag, because the count
 * *is* the thing that is pending: there is no state to fall out of step with
 * the list. They live together because they answer the same question from two
 * directions — one for the tab being closed, one for the save being replaced by
 * a reload.
 */
export const useStagedEditGuards = ({
	stagedCount,
	setEdits,
}: {
	stagedCount: number;
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
}) => {
	// Global shortcut: Ctrl+Z / Cmd+Z to undo the latest staged edit
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				(e.ctrlKey || e.metaKey) &&
				e.key.toLowerCase() === "z" &&
				!e.shiftKey
			) {
				const activeTag = document.activeElement?.tagName?.toLowerCase();
				if (activeTag === "input" || activeTag === "textarea") return;
				if (stagedCount === 0) return;
				e.preventDefault();
				setEdits((current) => current.slice(0, -1));
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [setEdits, stagedCount]);

	// Staged edits only exist in this tab's memory: a reload or a closed tab
	// loses them with no download. The browser's own confirmation is the only
	// guard for those paths, so raise it whenever work is pending.
	useEffect(() => {
		if (stagedCount === 0) return;
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			// Legacy browsers need a truthy returnValue for the prompt to show.
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [stagedCount]);
};

/**
 * Keeps the active view — and, in the inventory, the selected storage — in the
 * URL so a section can be linked to.
 *
 * Only these stable ids are written; save content, file names and other data
 * never reach the URL. `replaceState` rather than `pushState`, because
 * switching sections is not navigation a reader wants the back button to undo.
 */
export const useViewInUrl = ({
	view,
	activeStorage,
}: {
	view: SaveView;
	activeStorage: number | null;
}) => {
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		params.set("view", view);
		if (view === "inventory" && activeStorage !== null) {
			params.set("storage", String(activeStorage));
		} else {
			params.delete("storage");
		}
		const query = params.toString();
		const url = `${window.location.pathname}${
			query ? `?${query}` : ""
		}${window.location.hash}`;
		window.history.replaceState(null, "", url);
	}, [view, activeStorage]);
};
