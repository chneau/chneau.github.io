import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hostedIcsUrl, toWebcal } from "../CalendarActions";
import {
	buildRRule,
	buildUid,
	escapeText,
	foldLine,
	formatDtstamp,
	generateIcs,
	type IcsRecord,
	icsFileName,
} from "../ics";

const NOW = new Date("2024-06-09T09:30:00.000Z");

const BOY = "♂️";
const GIRL = "♀️";
const WEDDING = "💒";

const summary = (record: IcsRecord) => `${record.name}'s Birthday`;

const build = (records: readonly IcsRecord[], calendarName = "Birthdays") =>
	generateIcs(records, { summary, calendarName, now: NOW });

const ALICE: IcsRecord = { name: "Alice", date: "1985-04-12", kind: GIRL };
const BOB: IcsRecord = { name: "Bob", date: "1978-10-04", kind: BOY };

const unfold = (ics: string): string[] =>
	ics.replace(/\r\n /g, "").split("\r\n");

const physicalLines = (ics: string): string[] => ics.split("\r\n");

const octets = (value: string) => new TextEncoder().encode(value).length;

const findLine = (ics: string, prefix: string): string => {
	const line = physicalLines(ics).find((l) => l.startsWith(prefix));
	if (line === undefined) {
		throw new Error(`No line starting with ${prefix} in:\n${ics}`);
	}
	return line;
};

describe("generateIcs", () => {
	test("wraps the calendar in a valid VCALENDAR envelope", () => {
		const ics = build([ALICE]);
		const lines = unfold(ics);
		expect(lines[0]).toBe("BEGIN:VCALENDAR");
		expect(lines).toContain("VERSION:2.0");
		expect(lines).toContain("METHOD:PUBLISH");
		expect(lines[lines.length - 2]).toBe("END:VCALENDAR");
		expect(lines[lines.length - 1]).toBe("");
		expect(ics.endsWith("\r\n")).toBe(true);
	});

	test("emits one VEVENT per record, in order", () => {
		const ics = build([ALICE, BOB]);
		expect(unfold(ics).filter((l) => l === "BEGIN:VEVENT")).toHaveLength(2);
		expect(unfold(ics).filter((l) => l === "END:VEVENT")).toHaveLength(2);
		const uids = unfold(ics).filter((l) => l.startsWith("UID:"));
		expect(uids[0]).not.toBe(uids[1]);
	});

	test("a per-person export is the same generator over one record", () => {
		const all = build([ALICE, BOB]);
		const one = build([ALICE], "Alice");
		const vevents = (ics: string) =>
			ics.slice(ics.indexOf("BEGIN:VEVENT"), ics.indexOf("END:VEVENT") + 10);
		expect(vevents(one)).toBe(vevents(all));
		expect(one).toContain("X-WR-CALNAME:Alice");
		expect(all).toContain("X-WR-CALNAME:Birthdays");
	});

	test("uses CRLF for every line break and never a bare LF", () => {
		const ics = build([ALICE, BOB]);
		expect(ics).toContain("\r\n");
		expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
	});

	test("skips an unparseable record instead of losing the whole calendar", () => {
		const bad = { name: "Nobody", date: "not-a-date", kind: BOY };
		const ics = build([ALICE, bad, BOB]);
		expect(unfold(ics).filter((l) => l === "BEGIN:VEVENT")).toHaveLength(2);
	});
});

describe("all-day DTSTART / DTEND", () => {
	test("DTEND is the exclusive next day, one day after DTSTART", () => {
		expect(findLine(build([ALICE]), "DTSTART;VALUE=DATE:")).toBe(
			"DTSTART;VALUE=DATE:19850412",
		);
		expect(findLine(build([ALICE]), "DTEND;VALUE=DATE:")).toBe(
			"DTEND;VALUE=DATE:19850413",
		);
	});

	test("DTEND rolls over months and years", () => {
		const cases: readonly [string, string][] = [
			["1985-01-31", "19850201"],
			["1985-02-28", "19850301"],
			["1984-02-28", "19840229"],
			["1984-02-29", "19840301"],
			["1985-12-31", "19860101"],
		];
		for (const [date, expected] of cases) {
			const ics = build([{ ...ALICE, date }]);
			expect(findLine(ics, "DTEND;VALUE=DATE:")).toBe(
				`DTEND;VALUE=DATE:${expected}`,
			);
		}
	});

	test("the event occupies exactly one day, never zero and never two", () => {
		const daysBetween = (ics: string) => {
			const start = /DTSTART;VALUE=DATE:(\d{8})/.exec(ics)?.[1];
			const end = /DTEND;VALUE=DATE:(\d{8})/.exec(ics)?.[1];
			if (start === undefined || end === undefined) {
				throw new Error(`Missing DTSTART/DTEND in:\n${ics}`);
			}
			const at = (v: string) =>
				Date.UTC(
					Number(v.slice(0, 4)),
					Number(v.slice(4, 6)) - 1,
					Number(v.slice(6, 8)),
				);
			return (at(end) - at(start)) / 86_400_000;
		};
		for (const date of [
			"1985-04-12",
			"1985-01-31",
			"1984-02-29",
			"1985-12-31",
		]) {
			expect(daysBetween(build([{ ...ALICE, date }]))).toBe(1);
		}
	});
});

describe("buildRRule", () => {
	test("29 February recurs every year, leap or not", () => {
		expect(buildRRule("2000-02-29")).toBe(
			"FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1",
		);
		expect(buildRRule("1984-02-29")).toBe(
			"FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1",
		);
	});

	test("every other day of the year uses a plain annual rule", () => {
		expect(buildRRule("1985-02-28")).toBe("FREQ=YEARLY");
		expect(buildRRule("1985-04-12")).toBe("FREQ=YEARLY");
		expect(buildRRule("1984-12-31")).toBe("FREQ=YEARLY");
		expect(buildRRule("2024-02-28")).toBe("FREQ=YEARLY");
	});

	test("only the last day of February gets the BYMONTHDAY=-1 rule", () => {
		expect(buildRRule("2000-02-29")).toContain("BYMONTHDAY=-1");
		expect(buildRRule("2000-03-29")).not.toContain("BYMONTHDAY");
		expect(buildRRule("2000-01-29")).not.toContain("BYMONTHDAY");
	});

	test("the leap-day RRULE reaches the serialised event", () => {
		const ics = build([{ ...ALICE, date: "2000-02-29" }]);
		expect(findLine(ics, "RRULE:")).toBe(
			"RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1",
		);
	});
});

describe("formatDtstamp", () => {
	test("is a UTC DATE-TIME", () => {
		expect(formatDtstamp(NOW)).toBe("20240609T093000Z");
	});

	test("converts a non-UTC instant rather than reading local fields", () => {
		expect(formatDtstamp(new Date("2024-06-09T23:30:00+09:00"))).toBe(
			"20240609T143000Z",
		);
		expect(formatDtstamp(new Date("2024-06-10T00:30:00-04:00"))).toBe(
			"20240610T043000Z",
		);
	});

	test("matches RFC 5545's own example and drops milliseconds", () => {
		expect(formatDtstamp(new Date("1996-01-19T00:00:00Z"))).toBe(
			"19960119T000000Z",
		);
		expect(formatDtstamp(new Date("1996-01-19T12:34:56.789Z"))).toBe(
			"19960119T123456Z",
		);
	});

	test("every event in a file shares one DTSTAMP", () => {
		const ics = build([ALICE, BOB]);
		const stamps = unfold(ics).filter((l) => l.startsWith("DTSTAMP:"));
		expect(stamps).toHaveLength(2);
		expect(new Set(stamps)).toEqual(new Set(["DTSTAMP:20240609T093000Z"]));
	});
});

describe("buildUid", () => {
	test("is stable across calls, so re-exporting does not duplicate", () => {
		expect(buildUid(ALICE)).toBe(buildUid({ ...ALICE }));
		expect(buildUid({ ...ALICE })).toBe(buildUid(ALICE));
	});

	test("stays stable when the surrounding file is re-ordered", () => {
		const forward = build([ALICE, BOB]);
		const reversed = build([BOB, ALICE]);
		const uids = (ics: string) =>
			unfold(ics)
				.filter((l) => l.startsWith("UID:"))
				.map((l) => l.slice(4));
		expect(new Set(uids(forward))).toEqual(new Set(uids(reversed)));
	});

	test("PROVE IT FAILS WITH A TIME-DEPENDENT UID: re-publishing keeps it", () => {
		const later = new Date("2025-06-09T11:00:00.000Z");
		const uidsOf = (ics: string) =>
			unfold(ics)
				.filter((l) => l.startsWith("UID:"))
				.map((l) => l.slice(4));
		const stampsOf = (ics: string) =>
			unfold(ics)
				.filter((l) => l.startsWith("DTSTAMP:"))
				.map((l) => l.slice(8));

		const first = build([ALICE, BOB]);
		const second = generateIcs([ALICE, BOB], {
			summary,
			calendarName: "Birthdays",
			now: later,
		});
		expect(uidsOf(second)).toEqual(uidsOf(first));
		expect(stampsOf(second)).not.toEqual(stampsOf(first));
		expect(second).toBe(
			first.replace(/DTSTAMP:20240609T093000Z/g, "DTSTAMP:20250609T110000Z"),
		);
	});

	test("is a fixed-width hex hash, not a counter or a timestamp", () => {
		const uid = buildUid(ALICE);
		expect(uid).toMatch(/^Alice_19850412_[0-9a-f]{8}@chneau\.github\.io$/);
	});

	test("distinguishes two people whose names sanitise to the same slug", () => {
		const accented = { ...ALICE, name: "Cécile" };
		const plain = { ...ALICE, name: "Cecile" };
		expect(buildUid(accented)).not.toBe(buildUid(plain));
	});

	test("is a function of the app's own record identity, {name, date, kind}", () => {
		const alex = { name: "Alex", date: "2014-10-03", kind: BOY };
		expect(buildUid(alex)).toBe(buildUid({ ...alex }));
		expect(buildUid({ ...alex, date: "2014-10-04" })).not.toBe(buildUid(alex));
		expect(buildUid({ ...alex, name: "Alexa" })).not.toBe(buildUid(alex));
		expect(buildUid({ ...alex, kind: WEDDING })).not.toBe(buildUid(alex));
	});

	test("separates a birthday from a wedding on the same day", () => {
		expect(buildUid({ ...ALICE, kind: WEDDING })).not.toBe(buildUid(ALICE));
	});

	test("does not let a name forge another record's identity", () => {
		const smuggled = {
			name: `Ann|1985-04-12|${ALICE.kind}`,
			date: ALICE.date,
			kind: ALICE.kind,
		};
		expect(buildUid(smuggled)).not.toBe(buildUid(ALICE));
	});

	test("is a well-formed text value, ending in a domain", () => {
		const uid = buildUid(ALICE);
		expect(uid.endsWith("@chneau.github.io")).toBe(true);
		expect(uid).toMatch(/^[A-Za-z0-9_@.-]+$/);
		expect(uid.length).toBeLessThan(200);
	});

	test("never collides across a whole realistic list", () => {
		const records: IcsRecord[] = [
			ALICE,
			BOB,
			{ name: "Cecile", date: "1977-10-05", kind: GIRL },
			{ name: "Cécile", date: "1977-10-05", kind: GIRL },
			{ name: "Alex", date: "2014-10-03", kind: BOY },
			{ name: "Alex", date: "2014-10-03", kind: WEDDING },
			{ name: "", date: "2000-01-01", kind: BOY },
			{ name: "🎂", date: "2000-01-02", kind: BOY },
		];
		const uids = records.map(buildUid);
		expect(new Set(uids).size).toBe(records.length);
		for (const uid of uids) expect(uid.length).toBeGreaterThan(0);
	});

	test("survives the round trip through a generated file", () => {
		const ics = build([ALICE, BOB]);
		const inFile = unfold(ics)
			.filter((l) => l.startsWith("UID:"))
			.map((l) => l.slice(4));
		expect(inFile).toContain(buildUid(ALICE));
		expect(inFile).toContain(buildUid(BOB));
	});
});

describe("escapeText (RFC 5545 3.3.11)", () => {
	test("escapes the three mandatory TEXT characters", () => {
		expect(escapeText("a\\b")).toBe("a\\\\b");
		expect(escapeText("a;b")).toBe("a\\;b");
		expect(escapeText("a,b")).toBe("a\\,b");
	});

	test("escapes a backslash before it escapes anything else", () => {
		expect(escapeText("a\\;b")).toBe("a\\\\\\;b");
		expect(escapeText("\\;,\\")).toBe("\\\\" + "\\;" + "\\," + "\\\\");
	});

	test("leaves a colon alone, since it is legal in TEXT", () => {
		expect(escapeText("Birthday: Alice")).toBe("Birthday: Alice");
		expect(escapeText("https://example.com")).toBe("https://example.com");
	});

	test("leaves accents, emoji and CJK untouched", () => {
		expect(escapeText("Cécile")).toBe("Cécile");
		expect(escapeText("🎂 Party")).toBe("🎂 Party");
		expect(escapeText("生日快乐")).toBe("生日快乐");
	});

	test("is a no-op on text with nothing to escape", () => {
		expect(escapeText("Alice")).toBe("Alice");
		expect(escapeText("")).toBe("");
	});

	test("collapses a CRLF injection into a literal backslash-n", () => {
		expect(escapeText("Alice\r\nSUMMARY:Pwned")).toBe("Alice\\nSUMMARY:Pwned");
		expect(escapeText("Alice\nSUMMARY:Pwned")).toBe("Alice\\nSUMMARY:Pwned");
		expect(escapeText("Alice\rSUMMARY:Pwned")).toBe("Alice\\nSUMMARY:Pwned");
	});

	test("an injected newline cannot create a second VEVENT in the file", () => {
		const evil: IcsRecord = {
			name: "Alice\r\nBEGIN:VEVENT\r\nUID:attacker\r\nEND:VEVENT",
			date: "1985-04-12",
			kind: GIRL,
		};
		const ics = build([evil, BOB]);
		expect(unfold(ics).filter((l) => l === "BEGIN:VEVENT")).toHaveLength(2);
		expect(unfold(ics)).not.toContain("UID:attacker");
		const summaryLine = findLine(ics, "SUMMARY:");
		expect(summaryLine).toContain("\\nBEGIN:VEVENT");
		expect(physicalLines(ics).some((l) => l.startsWith("UID:attacker"))).toBe(
			false,
		);
	});

	test("PROVE IT FAILS WITHOUT ESCAPING: the injection above only survives", () => {
		const unescaped = [
			"BEGIN:VCALENDAR",
			"VERSION:2.0",
			"BEGIN:VEVENT",
			"UID:attacker",
			"DTSTAMP:20240609T093000Z",
			"DTSTART;VALUE=DATE:19850412",
			"DTEND;VALUE=DATE:19850413",
			"RRULE:FREQ=YEARLY",
			"SUMMARY:Alice",
			"END:VEVENT",
			"END:VCALENDAR",
			"",
		].join("\r\n");

		expect(unescaped).toContain("\r\nUID:attacker\r\n");
		expect(unfold(unescaped).filter((l) => l === "BEGIN:VEVENT")).toHaveLength(
			1,
		);
		const real = build([
			{
				name: "Alice\r\nBEGIN:VEVENT\r\nUID:attacker\r\nEND:VEVENT",
				date: "1985-04-12",
				kind: GIRL,
			},
		]);
		expect(physicalLines(real)).not.toContain("UID:attacker");
		expect(unfold(real).filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
		expect(real).toContain("\\nBEGIN:VEVENT");
	});

	test("escaping is applied to the calendar name too", () => {
		const ics = build([ALICE], "Alice, Bob & Co\r\nX-EVIL:1");
		expect(findLine(ics, "X-WR-CALNAME:")).toBe(
			"X-WR-CALNAME:Alice\\, Bob & Co\\nX-EVIL:1",
		);
		expect(unfold(ics)).not.toContain("X-EVIL:1");
	});
});

describe("foldLine (RFC 5545 3.1)", () => {
	test("leaves a short line untouched", () => {
		expect(foldLine("SUMMARY:Alice's Birthday")).toBe(
			"SUMMARY:Alice's Birthday",
		);
	});

	test("leaves a line of exactly 75 octets untouched", () => {
		const line = `SUMMARY:${"a".repeat(67)}`;
		expect(octets(line)).toBe(75);
		expect(foldLine(line)).toBe(line);
	});

	test("folds a line of 76 octets, splitting it in two", () => {
		const line = `SUMMARY:${"a".repeat(68)}`;
		expect(octets(line)).toBe(76);
		const folded = foldLine(line);
		expect(folded).toBe(`SUMMARY:${"a".repeat(67)}\r\n a`);
		expect(octets(folded.slice(0, 75))).toBe(75);
		expect(octets(folded.split("\r\n ")[1] ?? "")).toBe(1);
	});

	test("never emits a physical line over 75 octets", () => {
		for (const length of [76, 100, 151, 200, 1000, 5000]) {
			const line = `SUMMARY:${"a".repeat(length)}`;
			for (const physical of physicalLines(foldLine(line))) {
				expect(octets(physical)).toBeLessThanOrEqual(75);
			}
		}
	});

	test("counts OCTETS, not UTF-16 units, so a multi-byte name cannot split", () => {
		const line = `SUMMARY:${"é".repeat(60)}`;
		expect(line.length).toBe(68);
		expect(octets(line)).toBe(128);
		for (const physical of physicalLines(foldLine(line))) {
			expect(octets(physical)).toBeLessThanOrEqual(75);
		}
		const decoder = new TextDecoder("utf-8", { fatal: true });
		for (const physical of physicalLines(foldLine(line))) {
			expect(() =>
				decoder.decode(new TextEncoder().encode(physical)),
			).not.toThrow();
		}
	});

	test("a fold boundary lands mid multi-byte run", () => {
		const line = `SUMMARY:${"a".repeat(60)}生日快乐🎂`;
		const folded = foldLine(line);
		const parts = physicalLines(folded);
		expect(parts.length).toBeGreaterThan(1);
		expect(parts[1]).toBeDefined();
		expect(parts[1]?.startsWith(" ")).toBe(true);
		const decoder = new TextDecoder("utf-8", { fatal: true });
		for (const part of parts) {
			expect(() =>
				decoder.decode(new TextEncoder().encode(part)),
			).not.toThrow();
		}
	});

	test("handles 4-byte characters and astral-plane pairs", () => {
		const line = `SUMMARY:${"🎂".repeat(40)}`;
		expect(line.length).toBe(88);
		expect(octets(line)).toBe(168);
		const parts = physicalLines(foldLine(line));
		for (const part of parts) expect(octets(part)).toBeLessThanOrEqual(75);
		expect(foldLine(line).replace(/\r\n /g, "")).toBe(line);
		expect(parts.length).toBeGreaterThan(1);
	});

	test("continuation lines cost one octet for the leading space", () => {
		const folded = foldLine(`SUMMARY:${"a".repeat(300)}`);
		const parts = physicalLines(folded);
		expect(octets(parts[0] ?? "")).toBe(75);
		for (const part of parts.slice(1, -1)) {
			expect(octets(part)).toBe(75);
			expect(part.startsWith(" ")).toBe(true);
			expect(octets(part.slice(1))).toBe(74);
		}
		const last = parts[parts.length - 1] ?? "";
		expect(octets(last)).toBeGreaterThan(0);
		expect(octets(last)).toBeLessThanOrEqual(75);
		expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"a".repeat(300)}`);
	});

	test("unfolding restores the original line exactly", () => {
		for (const body of [
			"é".repeat(200),
			"a".repeat(300),
			"🎂生日快乐".repeat(30),
		]) {
			const line = `SUMMARY:${body}`;
			expect(foldLine(line).replace(/\r\n /g, "")).toBe(line);
		}
	});

	test("a generated file never has an over-long physical line", () => {
		const long: IcsRecord = {
			name: "Wolfeschlegelsteinhausenbergerdorff".repeat(4),
			date: "1985-04-12",
			kind: GIRL,
		};
		for (const physical of physicalLines(build([long, BOB]))) {
			expect(octets(physical)).toBeLessThanOrEqual(75);
		}
	});
});

describe("hosted URL resolution", () => {
	const ORIGIN = "https://chneau.github.io";

	test("the .ics is addressed at the site ROOT, not under /birthday/", () => {
		expect(hostedIcsUrl(ORIGIN)).toBe("https://chneau.github.io/birthdays.ics");
		expect(new URL(hostedIcsUrl(ORIGIN)).pathname).toBe("/birthdays.ics");
	});

	test("the app's own path never leaks into the .ics URL", () => {
		const appPath = "https://chneau.github.io/birthday/";
		expect(hostedIcsUrl(appPath)).toBe(
			"https://chneau.github.io/birthdays.ics",
		);
		expect(hostedIcsUrl(appPath)).not.toContain("/birthday/");
	});

	test("works on a non-default port and on http during development", () => {
		expect(hostedIcsUrl("http://localhost:3000")).toBe(
			"http://localhost:3000/birthdays.ics",
		);
		expect(hostedIcsUrl("http://localhost:3000/birthday/")).toBe(
			"http://localhost:3000/birthdays.ics",
		);
	});

	test("the webcal substitution really changes the scheme", () => {
		const webcalUrl = toWebcal(hostedIcsUrl(ORIGIN));
		expect(webcalUrl).toBe("webcal://chneau.github.io/birthdays.ics");
		expect(webcalUrl.startsWith("webcal:")).toBe(true);
		const viaUrlObject = new URL(hostedIcsUrl(ORIGIN));
		viaUrlObject.protocol = "webcal:";
		expect(viaUrlObject.protocol).toBe("https:");
		expect(viaUrlObject.href).not.toContain("webcal");
		expect(webcalUrl).not.toBe(viaUrlObject.href);
	});

	test("webcal substitution leaves an already-webcal URL alone", () => {
		const once = toWebcal(hostedIcsUrl(ORIGIN));
		expect(toWebcal(once)).toBe(once);
		expect(toWebcal(once)).not.toBe("webcal:webcal://");
	});

	test("all three hosted paths resolve to a URL that exists in dist/", () => {
		const hosted = hostedIcsUrl(ORIGIN);
		const paths = {
			"copy link / google cid": hosted,
			subscribe: toWebcal(hosted),
			"google calendar": `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(
				hosted,
			)}`,
		};

		for (const [label, raw] of Object.entries(paths)) {
			const normalized = raw.replace(/^webcal:/, "https:");
			const parsed = new URL(normalized);
			if (label === "google calendar") {
				expect(parsed.pathname).toBe("/calendar/u/0/r");
				expect(parsed.searchParams.get("cid")).toBe(hosted);
			} else {
				expect(parsed.pathname, label).toBe("/birthdays.ics");
			}
		}
	});

	test("the .ics is published at the site ROOT, where the URL points", () => {
		const hosted = hostedIcsUrl(ORIGIN);
		expect(new URL(hosted).pathname.split("/").filter(Boolean)).toEqual([
			"birthdays.ics",
		]);
	});

	test("the browser download path does not depend on the hosted file", () => {
		const mine = build([{ ...ALICE, name: "Someone New" }]);
		expect(mine).toContain("SUMMARY:Someone New's Birthday");
		expect(mine).toContain("UID:");
	});
});

describe("icsFileName", () => {
	test("keeps a plain name readable", () => {
		expect(icsFileName("Alice")).toBe("Alice.ics");
		expect(icsFileName("Charles Neau")).toBe("Charles-Neau.ics");
	});

	test("strips characters that are illegal or awkward in a filename", () => {
		expect(icsFileName("../etc/passwd")).toBe("etc-passwd.ics");
		expect(icsFileName("a/b\\c")).toBe("a-b-c.ics");
		expect(icsFileName("***")).toBe(".ics");
		expect(icsFileName("Cécile")).toBe("C-cile.ics");
		expect(icsFileName("Cécile")).toMatch(/^[A-Za-z0-9-]+\.ics$/);
	});
});

const DIST_ROOT = join(process.cwd(), "dist");
const DIST_ICS = join(DIST_ROOT, "birthdays.ics");

describe.skipIf(!existsSync(DIST_ICS))("the built calendar on disk", () => {
	test("dist/birthdays.ics is a real calendar, not an error page", () => {
		const published = readFileSync(DIST_ICS, "utf8");
		expect(published.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
		expect(published).toContain("END:VCALENDAR");
		expect(published).not.toContain("<!DOCTYPE");
	});

	test("the root copy is a calendar, not an error page", () => {
		expect(readFileSync(DIST_ICS, "utf8")).toContain("BEGIN:VCALENDAR");
	});
});
