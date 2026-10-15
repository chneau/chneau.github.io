import type { SaveEdit } from "./staged-edits";

export const stagedEditKeys = (edits: readonly SaveEdit[]): string[] => {
	const seen = new Map<string, number>();
	return edits.map((edit) => {
		const base = `${edit.type}:${JSON.stringify(edit)}`;
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		return count === 0 ? base : `${base}#${count}`;
	});
};
