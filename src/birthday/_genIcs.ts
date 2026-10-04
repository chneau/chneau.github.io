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

/**
 * The `DTSTAMP` for the published file, derived from the DATA rather than the
 * clock.
 *
 * `generateIcs` defaults `now` to `new Date()`, and this script used to take
 * that default — so every build stamped the current time and
 * `public/birthdays.ics` came out dirty on every single build, whether or not
 * anything about a birthday had changed. That trained everyone to `git checkout
 * -- public/birthdays.ics`, which quietly discards a real edit whenever the
 * generator happens to have produced one.
 *
 * `DTSTAMP` means "when this revision of the event was last revised" (RFC 5545
 * 3.8.4.2), so the honest value is the newest event date in the file. Nothing
 * here has a record-level "last edited" field and inventing one would be worse
 * than the timestamp being a date we already know. Two properties follow, both
 * asserted in `birthday/tests/ics-published.test.ts`:
 *
 *  - Rebuilding with unchanged data produces a byte-identical file, so the
 *    build is clean instead of perpetually dirty.
 *  - Editing a birthday's date still changes the file, so a real update is
 *    never swallowed.
 *
 * When the data is empty there is no event to stamp, so it falls back to the
 * epoch rather than to `new Date()` — an empty calendar must not reintroduce the
 * clock.
 */
const DTSTAMP_FALLBACK = new Date(0);

// Writing is guarded on `import.meta.main` so importing this module has no side
// effect, matching `_genManifests.ts`. Nothing imports it today — only the
// `build` and `build:birthday` scripts run it — so this is not fixing a live
// bug; it is removing the trap where a future test or tool that imports the
// generator silently rewrites a tracked file.
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
