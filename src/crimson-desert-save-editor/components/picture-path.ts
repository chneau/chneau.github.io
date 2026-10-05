/**
 * Which file a picture key resolves to — the half of the picture module that
 * needs no DOM.
 *
 * `Picture` draws; this decides. Splitting them means the answer to "does the
 * committed archive actually hold this key" is a pure function of the two
 * generated tables, so `tests/pictures.test.ts` can hold it against those
 * tables directly instead of standing up a component to ask.
 */
import companionPaths from "@/lib/generated/companion-image-paths.json";
import itemPaths from "@/lib/generated/item-image-paths.json";

/** Which generated picture table a key is filed under. */
export type PictureKind = "item" | "companion";

/** The published path tables, keyed by Item Key or Character Key. */
const PATHS: Record<PictureKind, Record<string, string>> = {
	item: itemPaths,
	companion: companionPaths,
};

/**
 * The published path one key is filed under, or `undefined` for a key the
 * table does not carry.
 */
export const picturePath = (
	kind: PictureKind,
	key: number | string,
): string | undefined => PATHS[kind][String(key)];

export const pictureTable = (kind: PictureKind): Record<string, string> =>
	PATHS[kind];
