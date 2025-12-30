import dayjs from "dayjs";
import { type Birthday, birthdays } from "./src/birthdays";

const generateICS = (birthdays: readonly Birthday[]) => {
	const now = dayjs().format("YYYYMMDDTHHmmssZ");
	const events = birthdays.map((b) => {
		const dtstart = dayjs(b.birthday);
		const dtend = dtstart.add(1, "day");
		const summary = b.isWedding
			? `${b.name} Wedding Anniversary`
			: `${b.name}'s Birthday`;
		const uid = `${b.name.replace(/\s+/g, "_")}_${dtstart.format(
			"YYYYMMDD",
		)}@chneau.github.io`;

		return [
			"BEGIN:VEVENT",
			`UID:${uid}`,
			`DTSTAMP:${now.replace(/[-:]/g, "")}`,
			`DTSTART;VALUE=DATE:${dtstart.format("YYYYMMDD")}`,
			`DTEND;VALUE=DATE:${dtend.format("YYYYMMDD")}`,
			"RRULE:FREQ=YEARLY",
			`SUMMARY:${summary}`,
			"TRANSP:TRANSPARENT",
			"X-MICROSOFT-CDO-BUSYSTATUS:FREE",
			"STATUS:CONFIRMED",
			"CLASS:PUBLIC",
			"END:VEVENT",
		].join("\r\n");
	});

	return [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//chneau//Birthday Tracker//EN",
		"X-WR-CALNAME:Birthdays",
		"METHOD:PUBLISH",
		...events,
		"END:VCALENDAR",
	].join("\r\n");
};

const content = generateICS(birthdays);
await Bun.write("public/birthdays.ics", content);
console.log("public/birthdays.ics generated");
