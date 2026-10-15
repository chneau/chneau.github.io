import type { Bytes } from "./bytes";

export const readFileBytes = async (file: File): Promise<Bytes> =>
	new Uint8Array(await file.arrayBuffer());

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

export const formatBytes = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const rebuiltName = (originalName: string): string => {
	const dot = originalName.lastIndexOf(".");
	if (dot <= 0) return `${originalName}-edited`;
	const stem = originalName.slice(0, dot);
	const extension = originalName.slice(dot);
	return `${stem}-edited${extension}`;
};
