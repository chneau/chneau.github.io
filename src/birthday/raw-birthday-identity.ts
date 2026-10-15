import type { RawBirthday } from "./birthdays";

const identityOf = (record: RawBirthday) =>
	`${record.name}\u001F${record.date}`;

export type RawBirthdayRow = {
	record: RawBirthday;
	occurrence: number;
	key: string;
};

export const withRawKeys = (list: readonly RawBirthday[]): RawBirthdayRow[] => {
	const seen = new Map<string, number>();
	return list.map((record) => {
		const identity = identityOf(record);
		const occurrence = seen.get(identity) ?? 0;
		seen.set(identity, occurrence + 1);
		return { record, occurrence, key: `${identity}#${occurrence}` };
	});
};

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
