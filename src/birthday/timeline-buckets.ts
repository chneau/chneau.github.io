import type { Birthday } from "./birthdays";

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

export const groupByBucket = (people: readonly Birthday[]): Bucket[] =>
	BUCKETS.map(({ key }) => ({
		key,
		items: people.filter(
			(person) => bucketOf(person.daysBeforeBirthday) === key,
		),
	})).filter((bucket) => bucket.items.length > 0);
