/**
 * RFC 5545 (iCalendar) serialisation, as a pure module with no imports.
 *
 * The serialisation used to live inline in `_genIcs.ts`, the build-time
 * generator. That is now a thin script: the app has its own add / edit /
 * import flow, so the user's own records must be exportable too, and both
 * paths have to agree byte-for-byte or a family would see the same birthday
 * twice with two different UIDs. Hence one implementation, here.
 *
 * Everything is a pure function of its arguments -- no `Date.now()` unless the
 * caller passes one, no module state -- so the whole file is directly testable.
 */

/** The subset of a record the calendar needs; `RawBirthday` is assignable. */
export type IcsRecord = {
	readonly name: string;
	/** "YYYY-MM-DD". */
	readonly date: string;
	readonly kind: string;
};

/**
 * The one kind that is not a birthday. Exported so the build-time script and
 * the app pick the same summary without hard-coding the emoji in two places.
 */
export const WEDDING_KIND = "💒";

const CRLF = "\r\n";

const UID_DOMAIN = "chneau.github.io";

/** RFC 5545 3.1: a content line SHOULD NOT be longer than 75 octets. */
const MAX_OCTETS = 75;

type GenerateIcsOptions = {
	/**
	 * Builds the `SUMMARY` for a record. A callback rather than a template so
	 * the app can run it through `t()` and get a translated, correctly
	 * conjugated string, while the build-time script passes a plain template.
	 */
	readonly summary: (record: IcsRecord) => string;
	/** Calendar name for `X-WR-CALNAME`. */
	readonly calendarName: string;
	/**
	 * Timestamp for every `DTSTAMP`. Defaults to now; tests pass a fixed date
	 * so the output is byte-stable.
	 */
	readonly now?: Date;
};

const encoder = new TextEncoder();

const utf8Length = (value: string): number => encoder.encode(value).length;

/**
 * RFC 5545 3.3.11. A TEXT value escapes backslash, semicolon and comma; a
 * line break becomes a literal `\n` so a name can never inject a content line
 * or a whole new `VEVENT` into the calendar. The colon is deliberately NOT
 * escaped: it is legal in TEXT, and escaping it would mangle the common
 * "Birthday: Alice" style name for no gain.
 *
 * Backslash has to go first, otherwise the backslashes this function adds for
 * the later characters would themselves be escaped.
 */
export const escapeText = (value: string): string =>
	value
		.replace(/\\/g, "\\\\")
		// RFC 5545 mandates collapsing CR and LF into a literal \n, so the
		// control characters in this pattern are the specification, not a
		// mistake. No suppression is needed: biome does not flag this pattern.
		.replace(/\r\n|[\r\n]/g, "\\n")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,");

/**
 * RFC 5545 3.1 line folding, measured in OCTETS. A JS `.length` or
 * `.slice(75)` counts UTF-16 units, so folding on it splits a multi-byte
 * character in half and produces a file strict parsers reject.
 *
 * Continuation lines start with a single space, and that space counts towards
 * the 75-octet budget, so only the first line gets the full width.
 *
 * Iteration is by code point, so a surrogate pair or a combining sequence is
 * never broken apart.
 */
export const foldLine = (line: string): string => {
	if (utf8Length(line) <= MAX_OCTETS) return line;

	const chunks: string[] = [];
	let current = "";
	let currentOctets = 0;
	let limit = MAX_OCTETS;

	for (const codePoint of line) {
		const octets = utf8Length(codePoint);
		// A single code point wider than the budget is impossible in practice
		// (the widest is 4 octets against 75), but never emit an empty chunk.
		if (currentOctets + octets > limit && current !== "") {
			chunks.push(current);
			current = "";
			// The continuation's leading space eats one octet of the budget.
			currentOctets = 0;
			limit = MAX_OCTETS - 1;
		}
		current += codePoint;
		currentOctets += octets;
	}
	chunks.push(current);

	return chunks.join(`${CRLF} `);
};

/** "2014-10-03" -> "20141003", validated; throws on anything malformed. */
const toIcsDate = (date: string): string => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!match) throw new Error(`Invalid ICS date: ${date}`);
	const [, year, month, day] = match;
	const asNumber = Number(`${year}${month}${day}`);
	// Guards against 2014-02-31 style dates, which would silently roll over.
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

/**
 * RFC 5545 3.2.13: a `DTSTAMP` is a UTC DATE-TIME, "20140609T093000Z". The
 * old code did `.toISOString().replace(/[-:]/g, "").split(".")[0]`, which also
 * strips the "T" separator's neighbours incorrectly and leaves the value
 * dependent on `toISOString` internals. Built from the UTC parts instead.
 */
export const formatDtstamp = (now: Date): string => {
	const pad = (value: number, width = 2) => String(value).padStart(width, "0");
	return (
		`${pad(now.getUTCFullYear(), 4)}${pad(now.getUTCMonth() + 1)}` +
		`${pad(now.getUTCDate())}T${pad(now.getUTCHours())}` +
		`${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
	);
};

/** "2014-10-03" -> "20141004": the exclusive end of a one-day all-day event. */
const nextDay = (date: string): string => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!match) throw new Error(`Invalid ICS date: ${date}`);
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	// UTC arithmetic, so a DST transition in the viewer's own timezone cannot
	// shift the exclusive end date by a day.
	const next = new Date(Date.UTC(year, month - 1, day + 1));
	return [
		String(next.getUTCFullYear()).padStart(4, "0"),
		String(next.getUTCMonth() + 1).padStart(2, "0"),
		String(next.getUTCDate()).padStart(2, "0"),
	].join("-");
};

/**
 * RFC 5545 3.3.10.
 *
 * A bare `FREQ=YEARLY` on a 29 February only lands in leap years, so a
 * leap-day birthday would be invisible three years out of four. `BYMONTHDAY=-1`
 * is "the last day of February", which is the 29th in a leap year and the 28th
 * otherwise -- the closest a recurring rule can get to "every year".
 */
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

/**
 * FNV-1a, 32 bit, over UTF-8 bytes. Not cryptographic -- it only has to make
 * two records that share a sanitised name collide unreliably, and it has to
 * produce the same digest on every machine and every run so that a UID does
 * not change (and duplicate the event in a subscribed calendar) between
 * exports. `Date.now()` and `Math.random()` would both be wrong here.
 */
const fnv1a = (value: string): string => {
	let hash = 0x811c9dc5;
	for (const byte of encoder.encode(value)) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, "0");
};

/**
 * RFC 5545 3.8.4.7: a UID must be globally unique and must not change when the
 * event is re-published, or every subscriber sees the event duplicated.
 *
 * The app's own record identity is the `{name, date}` pair (that is what
 * `updateRawBirthday` and `deleteRawBirthday` key on), with `kind` folded in
 * so a birthday and a wedding on the same day stay distinct. The name is
 * sanitised into something readable, and a hash of the full identity is
 * appended because the sanitised name is lossy: "Cecile" and "Cécile" both
 * reduce to "C_cile", and twins share a name AND a date.
 */
export const buildUid = (record: IcsRecord): string => {
	const safeName =
		record.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 32) || "birthday";
	// JSON, not a delimiter join: a name may contain any character, so
	// "Ann|Lee" + a date and "Ann" + a different date must not be able to
	// produce the same identity string.
	const identity = JSON.stringify([record.name, record.date, record.kind]);
	return `${safeName}_${toIcsDate(record.date)}_${fnv1a(
		identity,
	)}@${UID_DOMAIN}`;
};

/** Filename stem for a download, safe on every filesystem. */
export const icsFileName = (name: string): string =>
	`${name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.ics`;

/**
 * One VEVENT, as physical lines.
 *
 * Returns the lines rather than a joined string on purpose: folding has to
 * happen once, per content line. Joining here and folding again at the
 * calendar level would let the outer pass re-fold an entire already-folded
 * block -- CRLFs and all -- as though it were one 500-octet line, chopping it
 * at 75-octet boundaries that no longer line up with its content lines.
 */
const vevent = (
	record: IcsRecord,
	dtstamp: string,
	summary: (record: IcsRecord) => string,
): string[] => [
	foldLine("BEGIN:VEVENT"),
	foldLine(`UID:${buildUid(record)}`),
	foldLine(`DTSTAMP:${dtstamp}`),
	// DTEND is EXCLUSIVE for a VALUE=DATE event (RFC 5545 3.2.6), so a
	// single day runs DTSTART..DTSTART+1.
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

/**
 * Serialise records into a complete VCALENDAR. Pass a single-element array for
 * a per-person export, or the whole list for the family calendar.
 *
 * A record with an unparseable date is skipped rather than throwing: an import
 * that produced one bad row should still export the other 32 people.
 */
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

	// Every element here is already a folded physical line, so the file is a
	// plain CRLF join plus the trailing CRLF that terminates the last line.
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
