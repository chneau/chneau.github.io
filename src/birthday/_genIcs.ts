/**
 * Build-time generator for the HOSTED `public/birthdays.ics`.
 *
 * This script is the only reason that file exists, and its whole purpose is
 * the one thing a browser cannot do: publish a single file at a stable URL
 * that anybody -- a phone's calendar app, Google Calendar, a partner's laptop
 * -- can SUBSCRIBE to via `webcal://`, and keep subscribing to it as the site
 * is rebuilt. It can only ever see the bundled `birthdays.json`; anything a
 * user adds in the app lives in their `localStorage` and is unreachable from
 * a build. The app therefore also generates `.ics` in the browser from the
 * user's own records, and both paths call the one generator in `ics.ts` so
 * the two files agree.
 */

import { getRawBirthdays, type RawBirthday } from "./birthdays";
import { generateIcs, type IcsRecord, WEDDING_KIND } from "./ics";

/**
 * The English SUMMARY templates baked into the hosted file. The in-app export
 * builds the same strings through `t()`, so a downloaded file matches the
 * user's language while this one stays English and stable.
 */
const summary = (record: IcsRecord): string =>
	record.kind === WEDDING_KIND
		? `${record.name} Wedding Anniversary`
		: `${record.name}'s Birthday`;

const content = generateIcs(getRawBirthdays() as RawBirthday[], {
	summary,
	calendarName: "Birthdays",
});

await Bun.write("public/birthdays.ics", content);
console.log(`public/birthdays.ics generated (${content.length} bytes)`);
