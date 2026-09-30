/**
 * File in, file out — and nothing leaves the tab.
 *
 * The promise every page on this site makes about a save is that it is read
 * and rebuilt on the reader's own device. These two functions are the whole of
 * that promise, so there is no `fetch`, no upload and no storage: a `File`
 * becomes bytes, and bytes become a download the browser hands back.
 */
import type { Bytes } from "./bytes";

/** Reads a picked or dropped file into bytes. */
export const readFileBytes = async (file: File): Promise<Bytes> =>
	new Uint8Array(await file.arrayBuffer());

/**
 * Offers rebuilt bytes as a download.
 *
 * The object URL is revoked on the next macrotask rather than immediately:
 * revoking it synchronously races the browser's own read of the blob and
 * produces an empty file intermittently, which is a genuinely maddening bug to
 * chase from a user report.
 */
export const downloadBytes = (bytes: Bytes, filename: string): void => {
	const blob = new Blob([bytes], { type: "application/octet-stream" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** A readable byte count, so a megabyte save does not read as a number. */
export const formatBytes = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/**
 * Suffixes a rebuilt file so it cannot overwrite the original by accident.
 *
 * The editors never write to the game's folder, so the only way a rebuilt save
 * could clobber the real one is if the user renamed it back. Making the
 * downloaded name visibly different is a cheap second line of defence.
 */
export const rebuiltName = (originalName: string): string => {
	const dot = originalName.lastIndexOf(".");
	if (dot <= 0) return `${originalName}-edited`;
	const stem = originalName.slice(0, dot);
	const extension = originalName.slice(dot);
	return `${stem}-edited${extension}`;
};
