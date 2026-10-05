import type { Birthday } from "./birthdays";

/**
 * How far out a celebration is, in order. Drives the group headings.
 */
type BucketKey = "today" | "week" | "month" | "later";

const BUCKETS = [
	{ key: "today", maxDays: 0 },
	{ key: "week", maxDays: 7 },
	{ key: "month", maxDays: 30 },
	{ key: "later", maxDays: Number.POSITIVE_INFINITY },
] as const satisfies readonly { key: BucketKey; maxDays: number }[];

export const bucketOf = (daysBeforeBirthday: number): BucketKey =>
	BUCKETS.find((bucket) => daysBeforeBirthday <= bucket.maxDays)?.key ??
	"later";

type Bucket = { key: BucketKey; items: Birthday[] };

/**
 * Groups people into Today / This week / This month / Later, dropping the
 * empty ones so a family with nothing upcoming in March does not get a
 * stranded heading.
 */
export const groupByBucket = (people: readonly Birthday[]): Bucket[] =>
	BUCKETS.map(({ key }) => ({
		key,
		items: people.filter(
			(person) => bucketOf(person.daysBeforeBirthday) === key,
		),
	})).filter((bucket) => bucket.items.length > 0);
