import companionPaths from "../lib/generated/companion-image-paths.json";
import itemPaths from "../lib/generated/item-image-paths.json";

export type PictureKind = "item" | "companion";

const PATHS: Record<PictureKind, Record<string, string>> = {
	item: itemPaths,
	companion: companionPaths,
};

export const picturePath = (
	kind: PictureKind,
	key: number | string,
): string | undefined => PATHS[kind][String(key)];

export const pictureTable = (kind: PictureKind): Record<string, string> =>
	PATHS[kind];
