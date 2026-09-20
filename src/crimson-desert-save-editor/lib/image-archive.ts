import { useEffect, useState } from "react";
import { readZipDirectory, readZipEntry, type ZipEntry } from "./zip-archive";

/**
 * Item and companion pictures are shipped inside two stored (uncompressed) ZIP
 * archives in `assets/image-archive/` instead of ~5,500 loose files. WebP does
 * not compress, so each part is read into memory once and an entry is sliced
 * out on demand into a blob URL the browser can render. Nothing is written to
 * disk.
 *
 * The archives are prebuilt and committed. They split the pictures by the
 * first hexadecimal digit of the file name so each part stays under the 25 MiB
 * per-file limit of the hosted static-asset build; `imagePart` and
 * `ARCHIVE_COUNT` must keep matching that layout.
 */
/** How many committed parts the pictures are split across. */
export const ARCHIVE_COUNT = 2;
// Resolved against the document, so the same value works whether the app is
// served from its production prefix (`/crimson-desert-save-editor/`) or from
// the dev server root.
const ARCHIVE_PREFIX = "image-archive/part-";
const PICTURE_TYPE = "image/webp";

type LoadedArchive = Map<string, ZipEntry>;
type ArchiveState = {
	status: "idle" | "loading" | "ready" | "error";
	bytes?: Uint8Array<ArrayBuffer>;
	directory?: LoadedArchive;
};

const archives: ArchiveState[] = Array.from({ length: ARCHIVE_COUNT }, () => ({
	status: "idle",
}));
const urls = new Map<string, string>();
const inflating = new Set<string>();
const listeners = new Set<() => void>();

/**
 * Maps a picture path to the archive part that holds it. Exported because it is
 * the rule `tests/pictures.test.ts` holds the committed layout to: the parts
 * cannot be rebuilt here, so nothing else proves a path still lands in the part
 * it is filed under.
 */
export const imagePart = (name: string): number => {
	const base = name.slice(name.lastIndexOf("/") + 1);
	const code = base.charCodeAt(0);
	const hex = code <= 57 ? code - 48 : (code | 32) - 87;
	return hex % ARCHIVE_COUNT;
};

const archiveState = (index: number): ArchiveState => {
	const existing = archives[index];
	if (existing) return existing;
	const state: ArchiveState = { status: "idle" };
	archives[index] = state;
	return state;
};

const emit = () => {
	for (const listener of listeners) listener();
};

const loadArchive = (index: number) => {
	const state = archiveState(index);
	if (state.status !== "idle") return;
	state.status = "loading";
	void fetch(`${ARCHIVE_PREFIX}${index}.zip`)
		.then((response) => {
			if (!response.ok) {
				throw new Error(
					`Picture archive ${index} is unavailable (${response.status})`,
				);
			}
			return response.arrayBuffer();
		})
		.then((buffer) => {
			state.bytes = new Uint8Array(buffer);
			state.directory = readZipDirectory(state.bytes);
			state.status = "ready";
			emit();
		})
		.catch(() => {
			state.status = "error";
			emit();
		});
};

/**
 * Resolves a published picture path (`/images/items/x.webp`) to a blob URL.
 * Returns `undefined` while the owning archive is still being read; `useImage`
 * calls this again once the archive is in memory.
 */
const imageUrl = (path: string | undefined): string | undefined => {
	if (!path || typeof window === "undefined") return undefined;
	const name = path.replace(/^\//, "");
	const cached = urls.get(name);
	if (cached) return cached;
	const index = imagePart(name);
	const state = archiveState(index);
	if (state.status === "idle") {
		loadArchive(index);
		return undefined;
	}
	if (state.status !== "ready" || !state.bytes || !state.directory) {
		return undefined;
	}
	const entry = state.directory.get(name);
	if (!entry) return undefined;
	if (entry.method === 0) {
		const stored = state.bytes.subarray(
			entry.dataOffset,
			entry.dataOffset + entry.compressedSize,
		);
		urls.set(
			name,
			URL.createObjectURL(new Blob([stored], { type: PICTURE_TYPE })),
		);
		return urls.get(name);
	}
	if (!inflating.has(name)) {
		inflating.add(name);
		void readZipEntry(state.bytes, entry)
			.then((picture) => {
				urls.set(
					name,
					URL.createObjectURL(new Blob([picture], { type: PICTURE_TYPE })),
				);
				emit();
			})
			.catch(() => {})
			.finally(() => inflating.delete(name));
	}
	return undefined;
};

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

/** Blends `imageUrl` into React: re-renders once the archive is in memory. */
export const useImage = (path: string | undefined): string | undefined => {
	const [url, setUrl] = useState<string>();
	useEffect(() => {
		if (!path) {
			setUrl(undefined);
			return;
		}
		const update = () => setUrl(imageUrl(path));
		update();
		return subscribe(update);
	}, [path]);
	return url;
};
