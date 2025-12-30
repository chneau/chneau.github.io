import dayjs from "dayjs";
import type { Birthday } from "./birthdays";

const generateICS = (birthdays: readonly Birthday[]) => {
	const events = birthdays.map((b) => {
		const dtstart = dayjs(b.birthday).format("YYYYMMDD");
		const summary = b.isWedding
			? `${b.name} Wedding Anniversary`
			: `${b.name}'s Birthday`;

		return `BEGIN:VEVENT
DTSTART;VALUE=DATE:${dtstart}
RRULE:FREQ=YEARLY
SUMMARY:${summary}
TRANSP:TRANSPARENT
END:VEVENT`;
	});

	return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Birthday Tracker//EN
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
