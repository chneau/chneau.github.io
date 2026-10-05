import type { RawBirthday } from "./birthdays";

/**
 * Structural identity of a stored record: the `(name, date)` pair the CRUD
 * helpers in `birthdays.ts` key on, so it is what "the same birthday" means
 * here too. The unit separator cannot occur in a `date` (Zod validates it as a
 * dayjs-parsable date), so the concatenation stays unambiguous even when a
 * `name` contains the separator itself.
 */
const identityOf = (record: RawBirthday) =>
	`${record.name}\u001F${record.date}`;

export type RawBirthdayRow = {
	record: RawBirthday;
	/**
	 * 0-based position of this record among the records sharing its identity.
	 * Data stored before uniqueness was enforced can still hold duplicates, and
	 * a duplicate row can only be told apart from its twin by this number.
	 */
	occurrence: number;
	/** Collision-free React key: the identity plus that occurrence. */
	key: string;
};

/** Pairs every record with a collision-free key and its occurrence index. */
export const withRawKeys = (list: readonly RawBirthday[]): RawBirthdayRow[] => {
	const seen = new Map<string, number>();
	return list.map((record) => {
		const identity = identityOf(record);
		const occurrence = seen.get(identity) ?? 0;
		seen.set(identity, occurrence + 1);
		return { record, occurrence, key: `${identity}#${occurrence}` };
	});
};

/** Index of the `occurrence`-th record sharing `record`'s identity, or -1. */
export const indexOfOccurrence = (
	list: readonly RawBirthday[],
	record: RawBirthday,
	occurrence: number,
): number => {
	const identity = identityOf(record);
	let seen = 0;
	for (let index = 0; index < list.length; index++) {
		const candidate = list[index];
		if (!candidate || identityOf(candidate) !== identity) continue;
		if (seen === occurrence) return index;
		seen++;
	}
	return -1;
};

/**
 * Whether `(name, date)` is already taken. `excludeIndex` is the index of the
 * record being edited, which must not collide with itself when it is saved
 * unchanged.
 */
export const hasDuplicate = (
	list: readonly RawBirthday[],
	candidate: RawBirthday,
	excludeIndex = -1,
): boolean => {
	const identity = identityOf(candidate);
	return list.some(
		(x, index) => index !== excludeIndex && identityOf(x) === identity,
	);
};

/**
 * Keeps the first record of each identity and reports the rest, so a bulk
 * import cannot introduce duplicates in one step.
 */
export const dedupeRecords = (list: readonly RawBirthday[]) => {
	const seen = new Set<string>();
	const records: RawBirthday[] = [];
	let duplicateCount = 0;
	for (const record of list) {
		const identity = identityOf(record);
		if (seen.has(identity)) {
			duplicateCount++;
			continue;
		}
		seen.add(identity);
		records.push(record);
	}
	return { records, duplicateCount };
};
