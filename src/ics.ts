import dayjs from "dayjs";
import type { Birthday } from "./birthdays";

const generateICS = (birthdays: readonly Birthday[]) => {
	const now = dayjs().format("YYYYMMDDTHHmmssZ");
	const events = birthdays.map((b) => {
		const dtstart = dayjs(b.birthday).format("YYYYMMDD");
		const summary = b.isWedding
			? `${b.name} Wedding Anniversary`
			: `${b.name}'s Birthday`;
		const uid = `${Date.now()}_${Math.random()
			.toString(36)
			.slice(2)}@chneau.github.io`;

		return [
			"BEGIN:VEVENT",
			`UID:${uid}`,
			`DTSTAMP:${now.replace(/[-:]/g, "")}`,
			`DTSTART;VALUE=DATE:${dtstart}`,
			"RRULE:FREQ=YEARLY",
			`SUMMARY:${summary}`,
			"TRANSP:TRANSPARENT",
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

export const downloadICS = async (birthdays: readonly Birthday[]) => {
	const content = generateICS(birthdays);
	const filename = "birthdays.ics";
	const type = "text/calendar";

	if (
		navigator.share &&
		/android|iphone|ipad|ipod/i.test(navigator.userAgent)
	) {
		try {
			const file = new File([content], filename, { type });
			if (navigator.canShare?.({ files: [file] })) {
				await navigator.share({
					files: [file],
					title: "Birthdays",
				});
				return;
			}
		} catch (err) {
			console.error("Share failed", err);
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
	URL.revokeObjectURL(url);
};
