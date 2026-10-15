import { companionLabels } from "./companions";
import { editorViewInfo, type SaveView } from "./inventory";

const SAVE_VIEWS = new Set<string>([
	"inventory",
	...Object.keys(editorViewInfo),
	...Object.keys(companionLabels),
]);

const isSaveView = (value: string | null): value is SaveView =>
	value !== null && SAVE_VIEWS.has(value);

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
