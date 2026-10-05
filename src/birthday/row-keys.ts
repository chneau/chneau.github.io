/**
 * Collision-free React keys for lists of records that carry no id of their own.
 *
 * Separate from the components that render the lists (`BirthdayTable`, the
 * countdown) because the key derivation is the load-bearing part and has to be
 * testable, and provable identical, without rendering a table.
 */

/** Short, stable, non-cryptographic fingerprint, same shape as `birthdays.ts`. */
const fingerprint = (input: string): string => {
	let hash = 0;
	for (let i = 0; i < input.length; i++) {
		hash = (hash << 5) - hash + input.charCodeAt(i);
		hash |= 0;
	}
	return (hash >>> 0).toString(36);
};

/** The identity fields a row key is derived from; `Birthday` satisfies this. */
type RowIdentity = {
	name: string;
	birthdayString: string;
	kind: string;
};

type KeyedRow<T> = { record: T; key: string };

/**
 * Pairs every record with a collision-free row key: a fingerprint of the full
 * identity the row shows — name, date *and* kind, since `birthdays.ts` keys its
 * CRUD on `(name, date)` alone and two people can share both — plus the record's
 * occurrence index within that fingerprint.
 *
 * This is a fallback, not a true id: `Birthday` carries no id of its own, so a
 * key can only be derived from what a record displays, and it stays valid only
 * as long as the underlying list keeps its order. A real `id` on `RawBirthday`
 * (and the `Birthday` derived from it) is the real fix; that type lives in
 * `birthdays.ts`, which this module does not own.
 */
export const withRowKeys = <T extends RowIdentity>(
	list: readonly T[],
): KeyedRow<T>[] => {
	const seen = new Map<string, number>();
	return list.map((record) => {
		const base = fingerprint(
			`${record.name}\u001F${record.birthdayString}\u001F${record.kind}`,
		);
		const occurrence = seen.get(base) ?? 0;
		seen.set(base, occurrence + 1);
		return { record, key: `${base}#${occurrence}` };
	});
};
