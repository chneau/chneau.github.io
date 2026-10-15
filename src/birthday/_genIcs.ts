import { getRawBirthdays, type RawBirthday } from "./birthdays";
import { generateIcs, type IcsRecord, WEDDING_KIND } from "./ics";

const summary = (record: IcsRecord): string =>
	record.kind === WEDDING_KIND
		? `${record.name} Wedding Anniversary`
		: `${record.name}'s Birthday`;

const DTSTAMP_FALLBACK = new Date(0);

if (import.meta.main) {
	const records = getRawBirthdays() as RawBirthday[];
	const newestDate = records.reduce((newest, record) => {
		const parsed = Date.parse(record.date);
		if (Number.isNaN(parsed)) return newest;
		return parsed > newest ? parsed : newest;
	}, 0);

	const content = generateIcs(records, {
		summary,
		calendarName: "Birthdays",
		now: newestDate > 0 ? new Date(newestDate) : DTSTAMP_FALLBACK,
	});

	await Bun.write("public/birthdays.ics", content);
	console.log(`public/birthdays.ics generated (${content.length} bytes)`);
}
