import dayjs from "dayjs";
import type { Birthday } from "./birthdays";

const generateICS = (birthdays: readonly Birthday[]) => {
	const events = birthdays.map((b) => {
		const dtstart = dayjs(b.birthday).format("YYYYMMDD");
		const summary = b.isWedding
			? `${b.name} Wedding Anniversary`
			: `${b.name}'s Birthday`;
		const uid = `${b.name.replace(/\s+/g, "_")}_${dtstart}@birthday-tracker`;

		return `BEGIN:VEVENT
UID:${uid}
DTSTART;VALUE=DATE:${dtstart}
RRULE:FREQ=YEARLY
SUMMARY:${summary}
TRANSP:TRANSPARENT
CATEGORIES:Birthdays
END:VEVENT`;
	});

	return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Birthday Tracker//EN
X-WR-CALNAME:Birthdays Tracker
X-WR-TIMEZONE:UTC
METHOD:PUBLISH
${events.join("\n")}
END:VCALENDAR`;
};

export const downloadICS = (birthdays: readonly Birthday[]) => {
	const content = generateICS(birthdays);
	const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.setAttribute("download", "birthdays.ics");
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
};
