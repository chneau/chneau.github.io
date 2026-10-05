import { useSyncExternalStore } from "react";
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
/** How many mounted pictures are still using each cached blob URL. */
const refCounts = new Map<string, number>();
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
			// No `emit` here: every listener would immediately ask for this part
			// again, and `ensureArchive` retries an errored part, so notifying
			// would spin. The next subscription retries instead.
			state.status = "error";
		});
};

/**
 * Records that one mounted picture is using `name`, so the blob URL created
 * for it can be revoked once the last consumer goes away. Catalog browsing
 * mounts and unmounts thousands of rows; without this every visited picture
 * keeps its WebP bytes alive for the life of the tab.
 */
const retain = (name: string): void => {
	refCounts.set(name, (refCounts.get(name) ?? 0) + 1);
};

const release = (name: string): void => {
	const remaining = (refCounts.get(name) ?? 1) - 1;
	if (remaining > 0) {
		refCounts.set(name, remaining);
		return;
	}
	refCounts.delete(name);
	const url = urls.get(name);
	if (url !== undefined) {
		URL.revokeObjectURL(url);
		urls.delete(name);
	}
};

/** Cache a freshly created blob URL, unless its only consumer already left. */
const publish = (name: string, url: string): void => {
	if ((refCounts.get(name) ?? 0) <= 0) {
		URL.revokeObjectURL(url);
		return;
	}
	const previous = urls.get(name);
	if (previous !== undefined) URL.revokeObjectURL(previous);
	urls.set(name, url);
};

/**
 * Starts reading the archive part `index` needs, unless it is already read or
 * already being read.
 *
 * The trigger is a consumer subscribing (see `subscribePicture`), not a React
 * pass: these are build assets committed under `assets/image-archive/` and
 * served from this app's own origin, never anything from a user's save, so the
 * fetch is an asset read rather than data fetching.
 */
const ensureArchive = (index: number) => {
	const state = archiveState(index);
	// A failed part is retryable: back to idle so the next consumer fetches it
	// again instead of leaving a permanent placeholder with no explanation.
	if (state.status === "error") state.status = "idle";
	loadArchive(index);
};

/**
 * Resolves a published picture path (`/images/items/x.webp`) to a blob URL.
 * Returns `undefined` while the owning archive is still being read; the store
 * notifies `useImage` when it is in memory.
 */
const imageUrl = (name: string): string | undefined => {
	if (typeof window === "undefined") return undefined;
	const cached = urls.get(name);
	if (cached) return cached;
	const state = archiveState(imagePart(name));
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
		publish(
			name,
			URL.createObjectURL(new Blob([stored], { type: PICTURE_TYPE })),
		);
		return urls.get(name);
	}
	if (!inflating.has(name)) {
		inflating.add(name);
		void readZipEntry(state.bytes, entry)
			.then((picture) => {
				publish(
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

/**
 * Subscribes one mounted picture to the archive store, and starts the read its
 * part needs.
 *
 * Retaining on subscription (rather than from a render) is what makes the ref
 * count mean what it says: it counts mounted consumers, so a blob URL is only
 * published once somebody is waiting for it and revoked as soon as the last
 * picture unmounts. The listener is called once on the way in, so an already
 * read archive is published to this consumer without waiting for the next
 * change.
 */
const subscribePicture = (name: string | undefined, listener: () => void) => {
	if (name === undefined) return () => {};
	retain(name);
	listeners.add(listener);
	ensureArchive(imagePart(name));
	listener();
	return () => {
		listeners.delete(listener);
		release(name);
	};
};

/** Blends `imageUrl` into React: re-renders once the archive is in memory. */
export const useImage = (path: string | undefined): string | undefined => {
	const name = path === undefined ? undefined : path.replace(/^\//, "");
	return useSyncExternalStore(
		(listener) => subscribePicture(name, listener),
		() => (name === undefined ? undefined : imageUrl(name)),
		() => undefined,
	);
};
