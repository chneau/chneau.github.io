export type IcsRecord = {
	readonly name: string;
	readonly date: string;
	readonly kind: string;
};

export const WEDDING_KIND = "💒";

const CRLF = "\r\n";

const UID_DOMAIN = "chneau.github.io";

const MAX_OCTETS = 75;

type GenerateIcsOptions = {
	readonly summary: (record: IcsRecord) => string;
	readonly calendarName: string;
	readonly now?: Date;
};

const encoder = new TextEncoder();

const utf8Length = (value: string): number => encoder.encode(value).length;

export const escapeText = (value: string): string =>
	value
		.replace(/\\/g, "\\\\")
		.replace(/\r\n|[\r\n]/g, "\\n")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,");

export const foldLine = (line: string): string => {
	if (utf8Length(line) <= MAX_OCTETS) return line;

	const chunks: string[] = [];
	let current = "";
	let currentOctets = 0;
	let limit = MAX_OCTETS;

	for (const codePoint of line) {
		const octets = utf8Length(codePoint);
		if (currentOctets + octets > limit && current !== "") {
			chunks.push(current);
			current = "";
			currentOctets = 0;
			limit = MAX_OCTETS - 1;
		}
		current += codePoint;
		currentOctets += octets;
	}
	chunks.push(current);

	return chunks.join(`${CRLF} `);
};

const toIcsDate = (date: string): string => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!match) throw new Error(`Invalid ICS date: ${date}`);
	const [, year, month, day] = match;
	const asNumber = Number(`${year}${month}${day}`);
	if (
		year === undefined ||
		month === undefined ||
		day === undefined ||
		!isRealDate(Number(year), Number(month), Number(day))
	) {
		throw new Error(`Invalid ICS date: ${date}`);
	}
	return String(asNumber).padStart(8, "0");
};

const daysInMonth = (year: number, month: number): number =>
	new Date(Date.UTC(year, month, 0)).getUTCDate();

const isRealDate = (year: number, month: number, day: number): boolean =>
	month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);

export const formatDtstamp = (now: Date): string => {
	const pad = (value: number, width = 2) => String(value).padStart(width, "0");
	return (
		`${pad(now.getUTCFullYear(), 4)}${pad(now.getUTCMonth() + 1)}` +
		`${pad(now.getUTCDate())}T${pad(now.getUTCHours())}` +
		`${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
	);
};

const nextDay = (date: string): string => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!match) throw new Error(`Invalid ICS date: ${date}`);
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const next = new Date(Date.UTC(year, month - 1, day + 1));
	return [
		String(next.getUTCFullYear()).padStart(4, "0"),
		String(next.getUTCMonth() + 1).padStart(2, "0"),
		String(next.getUTCDate()).padStart(2, "0"),
	].join("-");
};

export const buildRRule = (date: string): string => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!match) throw new Error(`Invalid ICS date: ${date}`);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (month === 2 && day === 29) {
		return "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1";
	}
	return "FREQ=YEARLY";
};

const fnv1a = (value: string): string => {
	let hash = 0x811c9dc5;
	for (const byte of encoder.encode(value)) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, "0");
};

export const buildUid = (record: IcsRecord): string => {
	const safeName =
		record.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 32) || "birthday";
	const identity = JSON.stringify([record.name, record.date, record.kind]);
	return `${safeName}_${toIcsDate(record.date)}_${fnv1a(
		identity,
	)}@${UID_DOMAIN}`;
};

export const icsFileName = (name: string): string =>
	`${name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.ics`;

const vevent = (
	record: IcsRecord,
	dtstamp: string,
	summary: (record: IcsRecord) => string,
): string[] => [
	foldLine("BEGIN:VEVENT"),
	foldLine(`UID:${buildUid(record)}`),
	foldLine(`DTSTAMP:${dtstamp}`),
	foldLine(`DTSTART;VALUE=DATE:${toIcsDate(record.date)}`),
	foldLine(`DTEND;VALUE=DATE:${toIcsDate(nextDay(record.date))}`),
	foldLine(`RRULE:${buildRRule(record.date)}`),
	foldLine(`SUMMARY:${escapeText(summary(record))}`),
	foldLine("TRANSP:TRANSPARENT"),
	foldLine("X-MICROSOFT-CDO-BUSYSTATUS:FREE"),
	foldLine("STATUS:CONFIRMED"),
	foldLine("CLASS:PUBLIC"),
	foldLine("END:VEVENT"),
];

export const generateIcs = (
	records: readonly IcsRecord[],
	options: GenerateIcsOptions,
): string => {
	const { summary, calendarName, now = new Date() } = options;
	const dtstamp = formatDtstamp(now);

	const events: string[] = [];
	for (const record of records) {
		try {
			events.push(...vevent(record, dtstamp, summary));
		} catch (e) {
			console.error(`Skipping unserialisable birthday: ${String(e)}`);
		}
	}

	return `${[
		foldLine("BEGIN:VCALENDAR"),
		foldLine("VERSION:2.0"),
		foldLine("PRODID:-//chneau//Birthday Tracker//EN"),
		foldLine(`X-WR-CALNAME:${escapeText(calendarName)}`),
		foldLine("METHOD:PUBLISH"),
		...events,
		foldLine("END:VCALENDAR"),
		"",
	].join(CRLF)}`;
};
