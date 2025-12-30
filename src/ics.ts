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

export const downloadICS = async (birthdays: readonly Birthday[]) => {
	const content = generateICS(birthdays);
	const filename = "birthdays.ics";
	const type = "text/calendar;charset=utf-8";

	if (navigator.share) {
		const file = new File([content], filename, { type });
		if (navigator.canShare?.({ files: [file] })) {
			try {
				await navigator.share({
					files: [file],
					title: "Birthdays Tracker",
					text: "Import birthdays to your calendar",
				});
				return;
			} catch (err) {
				console.error("Error sharing ICS:", err);
			}
		}
	}

	const blob = new Blob([content], { type });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.setAttribute("download", filename);
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
};
