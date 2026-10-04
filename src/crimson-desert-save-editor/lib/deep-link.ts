import { companionLabels } from "@/lib/companions";
import { editorViewInfo, type SaveView } from "@/lib/inventory";

/**
 * Every `SaveView` id, so a URL parameter can be checked against the app before
 * it is trusted.
 */
const SAVE_VIEWS = new Set<string>([
	"inventory",
	...Object.keys(editorViewInfo),
	...Object.keys(companionLabels),
]);

const isSaveView = (value: string | null): value is SaveView =>
	value !== null && SAVE_VIEWS.has(value);

/**
 * Read `?view=` and `?storage=` for the initial render. Only stable ids are
 * accepted and anything else falls back to the defaults. No save content, file
 * name or personal data is ever read from or written to the URL.
 */
export const readDeepLink = (): { view: SaveView; storage: number | null } => {
	if (typeof window === "undefined") {
		return { view: "inventory", storage: null };
	}
	const params = new URLSearchParams(window.location.search);
	const view = params.get("view");
	const rawStorage = params.get("storage");
	const parsedStorage = rawStorage === null ? Number.NaN : Number(rawStorage);
	const storage =
		Number.isSafeInteger(parsedStorage) && parsedStorage > 0
			? parsedStorage
			: null;
	return { view: isSaveView(view) ? view : "inventory", storage };
};
