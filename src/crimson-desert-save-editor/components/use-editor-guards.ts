import { type Dispatch, type SetStateAction, useEffect } from "react";
import type { SaveView } from "../lib/inventory";
import type { SaveEdit } from "../lib/staged-edits";

export const useStagedEditGuards = ({
	stagedCount,
	setEdits,
}: {
	stagedCount: number;
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
}) => {
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

	useEffect(() => {
		if (stagedCount === 0) return;
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [stagedCount]);
};

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
