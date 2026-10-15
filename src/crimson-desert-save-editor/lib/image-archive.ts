import { useCallback, useSyncExternalStore } from "react";
import { readZipDirectory, readZipEntry, type ZipEntry } from "./zip-archive";

export const ARCHIVE_COUNT = 2;
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
const refCounts = new Map<string, number>();
const inflating = new Set<string>();
const listeners = new Set<() => void>();

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
		});
};

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

const publish = (name: string, url: string): void => {
	if ((refCounts.get(name) ?? 0) <= 0) {
		URL.revokeObjectURL(url);
		return;
	}
	const previous = urls.get(name);
	if (previous !== undefined) URL.revokeObjectURL(previous);
	urls.set(name, url);
};

const ensureArchive = (index: number) => {
	const state = archiveState(index);
	if (state.status === "error") state.status = "idle";
	loadArchive(index);
};

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

export const useImage = (path: string | undefined): string | undefined => {
	const name = path === undefined ? undefined : path.replace(/^\//, "");
	const subscribe = useCallback(
		(listener: () => void) => subscribePicture(name, listener),
		[name],
	);
	const snapshot = useCallback(
		() => (name === undefined ? undefined : imageUrl(name)),
		[name],
	);
	return useSyncExternalStore(subscribe, snapshot, () => undefined);
};
