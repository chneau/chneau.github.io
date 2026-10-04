import type { SaveEdit } from "@/lib/staged-edits";

/**
 * A React key per staged edit, stable across a removal.
 *
 * The drawer used to key on `` `${edit.type}-${idx}` ``, which is an index key on
 * a list the user mutates by position: removing any row shifted every later
 * edit down one, so every subsequent row was re-keyed and React handed one
 * row's DOM to a different edit. `companion-panel.tsx` keys the same way and gets
 * away with it because that list only ever appends — this one has a remove
 * button on every row.
 *
 * `SaveEdit` is a twelve-member discriminated union with no id, so identity comes
 * from the edit's own content, which is stable across a removal of a *different*
 * edit. Two staged edits can legitimately be identical — the engine refuses a
 * duplicate on apply rather than preventing one from being staged — so an
 * occurrence counter disambiguates collisions, and only those: the first of two
 * identical edits keeps the plain content key, so adding and removing one of them
 * does not re-key the other.
 *
 * The limit worth stating: N edits with *identical* content are indistinguishable
 * by content, so removing one renumbers the others' occurrence suffixes. Stable
 * keys there need an id on `SaveEdit` itself, which is a change to the edit model
 * rather than to a drawer. The test asserts this instead of hiding it.
 *
 * @see the delete tests in `staged-edit-keys.test.ts`
 */
export const stagedEditKeys = (edits: readonly SaveEdit[]): string[] => {
	const seen = new Map<string, number>();
	return edits.map((edit) => {
		// `type` leads so a key is readable when it turns up in a DOM dump.
		const base = `${edit.type}:${JSON.stringify(edit)}`;
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		return count === 0 ? base : `${base}#${count}`;
	});
};
